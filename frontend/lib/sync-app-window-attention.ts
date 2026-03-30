import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MutableRefObject } from "react";

/**
 * Em dev (Next em localhost dentro do WebView), o IPC do plugin window pode falhar nas
 * verificações de CORS do WebKit até `devCsp` incluir `ipc:` / `http://ipc.localhost`.
 * Depois do primeiro erro, deixamos de invocar o plugin para não encher a consola e para
 * evitar callbacks órfãos com HMR.
 */
let tauriWindowMetricsWorks: boolean | null = null;

export async function syncAppWindowAttention(
  appWindowHasAttentionRef: MutableRefObject<boolean>,
): Promise<void> {
  const fromDom = () => {
    appWindowHasAttentionRef.current =
      document.visibilityState === "visible" && document.hasFocus();
  };

  try {
    if (!isTauri()) {
      fromDom();
      return;
    }
    if (tauriWindowMetricsWorks === false) {
      fromDom();
      return;
    }
    const w = getCurrentWindow();
    const [minimized, focused] = await Promise.all([w.isMinimized(), w.isFocused()]);
    tauriWindowMetricsWorks = true;
    const visible = document.visibilityState === "visible";
    appWindowHasAttentionRef.current = !minimized && focused && visible;
  } catch {
    if (isTauri()) tauriWindowMetricsWorks = false;
    fromDom();
  }
}
