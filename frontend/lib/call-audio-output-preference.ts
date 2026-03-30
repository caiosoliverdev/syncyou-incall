const KEY = "incall-preferred-audio-output-device-id-v1";

/** Tauri: WebKit não deve usar `setSinkId` como no Chrome (IDs diferentes / bugs). */
function isTauriRuntime(): boolean {
  if (typeof globalThis === "undefined") return false;
  if ((globalThis as { isTauri?: boolean }).isTauri) return true;
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) return true;
  return false;
}

export function getPreferredAudioOutputDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** `null` = saída padrão do sistema. */
export function setPreferredAudioOutputDeviceId(deviceId: string | null): void {
  try {
    if (deviceId === null || deviceId === "") {
      window.localStorage.removeItem(KEY);
    } else {
      window.localStorage.setItem(KEY, deviceId);
    }
  } catch {
    /* ignore */
  }
}

export function audioElementSupportsSetSinkId(el: HTMLAudioElement): boolean {
  return typeof (el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId ===
    "function";
}

export async function applyPreferredSinkToAudioElement(el: HTMLAudioElement): Promise<void> {
  if (!audioElementSupportsSetSinkId(el)) return;
  if (isTauriRuntime()) {
    return;
  }
  const id = getPreferredAudioOutputDeviceId();
  try {
    const sink = el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> };
    if (id) {
      await sink.setSinkId(id);
    } else {
      await sink.setSinkId("");
    }
  } catch {
    /* dispositivo indisponível ou política do browser */
  }
}
