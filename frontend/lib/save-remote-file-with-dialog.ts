import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

function isTauriApp(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Download no navegador (blob ou abrir URL). */
export async function downloadRemoteFileInBrowser(url: string, fileName: string): Promise<void> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error("fetch failed");
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

/**
 * No app Tauri: abre "Salvar como" e baixa o arquivo via backend (reqwest).
 * Fora do Tauri: mesmo fluxo que antes (download no browser).
 */
export async function saveRemoteFileWithDialog(url: string, suggestedFileName: string): Promise<void> {
  if (!isTauriApp()) {
    await downloadRemoteFileInBrowser(url, suggestedFileName);
    return;
  }

  try {
    const targetPath = await save({
      defaultPath: suggestedFileName,
    });
    if (!targetPath) return;
    await invoke("download_file", { url, targetPath });
  } catch (err) {
    console.error(err);
    await downloadRemoteFileInBrowser(url, suggestedFileName);
  }
}
