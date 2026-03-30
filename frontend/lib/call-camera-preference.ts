const PREFERRED_CAMERA_DEVICE_ID_KEY = "incall-preferred-camera-device-id-v1";

export function getPreferredCameraDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFERRED_CAMERA_DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

/** `null` = câmera padrão do sistema (sem `deviceId` nas constraints). */
export function setPreferredCameraDeviceId(deviceId: string | null): void {
  try {
    if (deviceId === null || deviceId === "") {
      window.localStorage.removeItem(PREFERRED_CAMERA_DEVICE_ID_KEY);
    } else {
      window.localStorage.setItem(PREFERRED_CAMERA_DEVICE_ID_KEY, deviceId);
    }
  } catch {
    /* ignore */
  }
}

export function getVideoConstraintsForPreferredCamera(
  deviceId: string | null,
): MediaTrackConstraints {
  if (!deviceId) return {};
  return { deviceId: { ideal: deviceId } };
}
