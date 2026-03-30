import { isTauri } from "@tauri-apps/api/core";

/** Notificação do sistema (Windows / macOS) — só em Tauri; na web não faz nada. */
export async function showNativeNotification(options: {
  title: string;
  body: string;
}): Promise<void> {
  if (!isTauri() || typeof window === "undefined") return;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      "@tauri-apps/plugin-notification"
    );
    let granted = await isPermissionGranted();
    if (!granted) {
      const p = await requestPermission();
      granted = p === "granted";
    }
    if (granted) {
      sendNotification({ title: options.title, body: options.body });
    }
  } catch {
    /* plugin indisponível ou recusado */
  }
}
