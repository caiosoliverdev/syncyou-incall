const PREFERRED_MIC_DEVICE_ID_KEY = "incall-preferred-mic-device-id-v1";

export function getPreferredMicDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFERRED_MIC_DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

/** `null` = microfone padrão do sistema (sem `deviceId` nas constraints). */
export function setPreferredMicDeviceId(deviceId: string | null): void {
  try {
    if (deviceId === null || deviceId === "") {
      window.localStorage.removeItem(PREFERRED_MIC_DEVICE_ID_KEY);
    } else {
      window.localStorage.setItem(PREFERRED_MIC_DEVICE_ID_KEY, deviceId);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Preferência de microfone. Usar `ideal` (não `exact`): no Tauri/WebKit um `deviceId`
 * vindo do Chrome ou antigo causa `OverconstrainedError` com `exact`.
 */
export function getAudioConstraintsForPreferredMic(
  deviceId: string | null,
): MediaTrackConstraints {
  if (!deviceId) return {};
  return { deviceId: { ideal: deviceId } };
}
