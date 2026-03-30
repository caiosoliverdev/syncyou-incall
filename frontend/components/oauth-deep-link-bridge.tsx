"use client";

import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { runOAuthCallbackFromSearchParams } from "@/lib/oauth-callback-flow";

/**
 * No Tauri: o browser externo redireciona para syncyou://oauth/callback?...
 * Este componente aplica tokens e recarrega a app para o splash/sessão atualizarem.
 */
export function OAuthDeepLinkBridge() {
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;

    void (async () => {
      const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link");

      const handle = async (urls: string[]) => {
        for (const raw of urls) {
          if (!raw.includes("oauth/callback")) continue;
          try {
            const u = new URL(raw);
            const result = await runOAuthCallbackFromSearchParams(u.searchParams);
            if (result.kind === "done") {
              window.location.assign("/");
              return;
            }
            sessionStorage.setItem(
              "oauth_callback_error",
              JSON.stringify({ message: result.message }),
            );
            window.location.assign("/");
            return;
          } catch {
            /* ignorar URL inválida */
          }
        }
      };

      const start = await getCurrent();
      if (start?.length) await handle(start);

      unlisten = await onOpenUrl((urls) => {
        void handle(urls);
      });
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  return null;
}
