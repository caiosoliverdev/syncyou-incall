"use client";

import { useEffect, useState } from "react";

function tryCloseWindow(): void {
  try {
    self.close();
  } catch {
    /* ignorar */
  }
}

/**
 * Após OAuth no browser (fluxo iniciado pela app Tauri).
 * - Com `socket=1`: tokens já foram enviados por Socket.IO — fecha a janela (de preferência popup).
 * - Sem isso: fallback syncyou:// (deep link) para apps sem socket.
 */
export default function OAuthTauriHandoffPage() {
  const [msg, setMsg] = useState("A concluir…");

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (!sp.toString()) {
      setMsg("Ligação inválida.");
      return;
    }

    if (sp.get("oauth") === "err") {
      setMsg(sp.get("message")?.trim() || "Não foi possível iniciar sessão.");
      window.setTimeout(() => {
        tryCloseWindow();
      }, 400);
      return;
    }

    if (sp.get("socket") === "1") {
      setMsg("Sessão iniciada no SyncYou. A fechar…");
      tryCloseWindow();
      window.setTimeout(() => {
        tryCloseWindow();
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          setMsg("Pode fechar esta janela.");
        }
      }, 350);
      return;
    }

    const sync = new URL("syncyou://oauth/callback");
    sp.forEach((v, k) => {
      sync.searchParams.set(k, v);
    });
    window.location.href = sync.toString();
    window.setTimeout(() => {
      tryCloseWindow();
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        setMsg(
          "O início de sessão foi enviado para o SyncYou. Se a aplicação não abriu sozinha, abra-a no computador e depois pode fechar esta janela.",
        );
      }
    }, 500);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 p-6 text-center text-sm text-zinc-200">
      <p>{msg}</p>
    </div>
  );
}
