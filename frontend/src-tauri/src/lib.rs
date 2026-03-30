#[cfg(target_os = "macos")]
mod macos_location;

#[tauri::command]
async fn download_file(url: String, target_path: String) -> Result<(), String> {
  let response = reqwest::get(&url)
    .await
    .map_err(|error| format!("Falha ao baixar arquivo: {error}"))?;
  let bytes = response
    .bytes()
    .await
    .map_err(|error| format!("Falha ao ler conteudo do arquivo: {error}"))?;
  std::fs::write(&target_path, &bytes).map_err(|error| format!("Falha ao salvar arquivo: {error}"))?;
  Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeGeo {
  latitude: f64,
  longitude: f64,
}

/// macOS: Core Location nativo (alerta do sistema). Outras plataformas: `None` — use `navigator.geolocation` no frontend.
#[tauri::command]
async fn get_native_geo(app: tauri::AppHandle) -> Result<Option<NativeGeo>, String> {
  #[cfg(target_os = "macos")]
  {
    let app = app.clone();
    tokio::task::spawn_blocking(move || {
      let (tx, rx) = std::sync::mpsc::channel();
      app
        .run_on_main_thread(move || {
          macos_location::start_location_request(tx);
        })
        .map_err(|e| e.to_string())?;
      match rx.recv_timeout(std::time::Duration::from_secs(35)) {
        Ok(Ok((lat, lon))) => Ok(Some(NativeGeo {
          latitude: lat,
          longitude: lon,
        })),
        Ok(Err(msg)) => Err(msg),
        Err(_) => Err("Tempo esgotado ao obter localização.".into()),
      }
    })
    .await
    .map_err(|e| e.to_string())?
  }
  #[cfg(not(target_os = "macos"))]
  {
    Ok(None)
  }
}

/// WebView2: `navigator.geolocation` pede permissão via evento `PermissionRequested` (não via
/// `ICoreWebView2Settings` nas APIs atuais). Autorizamos só `COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION`.
#[cfg(windows)]
fn enable_webview2_geolocation<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
  use tauri::Manager;
  use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
  };
  use webview2_com::PermissionRequestedEventHandler;

  let Some(win) = app.get_webview_window("main") else {
    log::warn!("[geolocation] janela main não encontrada");
    return;
  };
  let _ = win.with_webview(|webview| {
    let controller = webview.controller();
    let core = match unsafe { controller.CoreWebView2() } {
      Ok(c) => c,
      Err(e) => {
        log::warn!("[geolocation] CoreWebView2: {e:?}");
        return;
      }
    };

    let handler = PermissionRequestedEventHandler::create(Box::new(
      |_sender, args| {
        let Some(args) = args else {
          return Ok(());
        };
        let mut kind = webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_PERMISSION_KIND(0);
        unsafe {
          args.PermissionKind(&mut kind)?;
          if kind == COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION {
            args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
          }
        }
        Ok(())
      },
    ));

    let mut token = 0i64;
    match unsafe { core.add_PermissionRequested(&handler, &mut token) } {
      Ok(()) => log::info!("[geolocation] WebView2: permissão de geolocalização autorizada no handler"),
      Err(e) => log::warn!("[geolocation] add_PermissionRequested: {e:?}"),
    }
  });
}

// Updater: a chave pública em `tauri.conf.json` deve corresponder à chave privada
// usada no CI (`TAURI_SIGNING_PRIVATE_KEY`). Gere o par com:
// `npm run tauri signer generate -w caminho/seguro/syncyou.key`
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      #[cfg(windows)]
      enable_webview2_geolocation(app.handle());

      #[cfg(any(windows, target_os = "linux"))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        app.deep_link().register_all()?;
      }
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![download_file, get_native_geo])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
