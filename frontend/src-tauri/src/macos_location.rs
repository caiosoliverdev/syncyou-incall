//! Core Location nativo no macOS. O `tauri-plugin-geolocation` no desktop é stub (sem diálogo).
//! Isto usa `CLLocationManager` + `requestWhenInUseAuthorization` para o alerta do sistema.

#![allow(non_snake_case)]

use objc2::rc::{Allocated, Retained};
use objc2::runtime::ProtocolObject;
use objc2::{define_class, msg_send, ClassType, MainThreadOnly};
use objc2_core_location::{
    CLLocation, CLLocationManager, CLLocationManagerDelegate, CLAuthorizationStatus,
};
use objc2_foundation::{NSArray, NSError, NSObject, NSObjectProtocol};
use std::cell::RefCell;

#[derive(Default)]
struct EmptyIvars;

struct LocationSession {
    /// Mantém o `CLLocationManager` vivo até ao callback (retenção Objective-C).
    #[allow(dead_code)]
    manager: Retained<CLLocationManager>,
    _delegate: Retained<LocationDelegate>,
    tx: std::sync::mpsc::Sender<Result<(f64, f64), String>>,
}

thread_local! {
    static LOCATION_SESSION: RefCell<Option<LocationSession>> = RefCell::new(None);
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = EmptyIvars]
    struct LocationDelegate;

    impl LocationDelegate {
        #[unsafe(method_id(init))]
        fn init(this: Allocated<Self>) -> Retained<Self> {
            let this = this.set_ivars(EmptyIvars::default());
            unsafe { msg_send![super(this), init] }
        }
    }

    unsafe impl NSObjectProtocol for LocationDelegate {}

    unsafe impl CLLocationManagerDelegate for LocationDelegate {
        #[unsafe(method(locationManager:didUpdateLocations:))]
        unsafe fn locationManager_didUpdateLocations(
            &self,
            manager: &CLLocationManager,
            locations: &NSArray<CLLocation>,
        ) {
            if locations.count() == 0 {
                return;
            }
            let loc = locations.objectAtIndex(0);
            let coord = unsafe { loc.coordinate() };
            let lat = coord.latitude;
            let lon = coord.longitude;
            unsafe {
                manager.stopUpdatingLocation();
            }
            LOCATION_SESSION.with(|cell| {
                if let Some(session) = cell.borrow_mut().take() {
                    let _ = session.tx.send(Ok((lat, lon)));
                }
            });
        }

        #[unsafe(method(locationManagerDidChangeAuthorization:))]
        unsafe fn locationManagerDidChangeAuthorization(&self, manager: &CLLocationManager) {
            let status = unsafe { manager.authorizationStatus() };
            if status == CLAuthorizationStatus::AuthorizedWhenInUse
                || status == CLAuthorizationStatus::AuthorizedAlways
            {
                unsafe {
                    manager.requestLocation();
                }
            } else if status == CLAuthorizationStatus::Denied
                || status == CLAuthorizationStatus::Restricted
            {
                LOCATION_SESSION.with(|cell| {
                    if let Some(session) = cell.borrow_mut().take() {
                        let _ = session
                            .tx
                            .send(Err("Permissão de localização recusada ou indisponível.".into()));
                    }
                });
            }
        }

        #[unsafe(method(locationManager:didFailWithError:))]
        unsafe fn locationManager_didFailWithError(
            &self,
            manager: &CLLocationManager,
            error: &NSError,
        ) {
            unsafe {
                manager.stopUpdatingLocation();
            }
            let msg = error.localizedDescription().to_string();
            LOCATION_SESSION.with(|cell| {
                if let Some(session) = cell.borrow_mut().take() {
                    let _ = session.tx.send(Err(format!("Core Location: {msg}")));
                }
            });
        }
    }
);

/// Deve ser chamado na main thread. Envia um único `Ok((lat, lon))` ou `Err` no canal.
pub fn start_location_request(tx: std::sync::mpsc::Sender<Result<(f64, f64), String>>) {
    let manager = unsafe { CLLocationManager::new() };
    let delegate: Retained<LocationDelegate> = unsafe { msg_send![LocationDelegate::class(), new] };

    unsafe {
        manager.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));

        let status = manager.authorizationStatus();
        if status == CLAuthorizationStatus::NotDetermined {
            LOCATION_SESSION.with(|cell| {
                *cell.borrow_mut() = Some(LocationSession {
                    manager: manager.clone(),
                    _delegate: delegate,
                    tx,
                });
            });
            manager.requestWhenInUseAuthorization();
        } else if status == CLAuthorizationStatus::AuthorizedWhenInUse
            || status == CLAuthorizationStatus::AuthorizedAlways
        {
            LOCATION_SESSION.with(|cell| {
                *cell.borrow_mut() = Some(LocationSession {
                    manager: manager.clone(),
                    _delegate: delegate,
                    tx,
                });
            });
            manager.requestLocation();
        } else {
            let _ = tx.send(Err(
                "Serviços de localização desativados ou permissão negada nas Definições.".into(),
            ));
        }
    }
}
