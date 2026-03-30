import { isTauri } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  oauthCompleteRequest,
  oauthGoogleStartUrl,
  oauthMicrosoftStartUrl,
} from "@/lib/api";
import { saveTokens } from "@/lib/auth-tokens";
import {
  connectOAuthBridge,
  type OAuthSocketPayload,
} from "@/lib/oauth-bridge-client";
import { fetchPublicIp, getCachedPublicIp } from "@/lib/client-geo";

export type OAuthContinueProvider = "google" | "microsoft";

const OAUTH_WEBVIEW_LABEL = "oauth-login";

let activeOAuthBridgeCleanup: (() => void) | undefined;

function clearOAuthBridge(): void {
  activeOAuthBridgeCleanup?.();
  activeOAuthBridgeCleanup = undefined;
}

async function closeOAuthWebviewIfOpen(): Promise<void> {
  if (!isTauri()) return;
  try {
    const w = await WebviewWindow.getByLabel(OAUTH_WEBVIEW_LABEL);
    if (w) await w.close();
  } catch {
    /* ignorar */
  }
}

/**
 * Início de sessão OAuth direto na API (redirect para Google/Microsoft), sem página intermédia.
 *
 * Tauri: WebviewWindow + Socket.IO (`/oauth-bridge`) com `bridge`; o backend emite tokens e a
 * janela OAuth fecha ao concluir.
 */
export async function oauthNavigateOrOpen(options: {
  provider: OAuthContinueProvider;
  email?: string;
}): Promise<void> {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : (process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000");

  const email = options.email?.trim();
  const { provider } = options;
  const tauriHandoffUrl = `${origin}/oauth/tauri-handoff`;

  if (isTauri()) {
    clearOAuthBridge();
    const bridgeId = crypto.randomUUID();
    activeOAuthBridgeCleanup = connectOAuthBridge(
      bridgeId,
      (p: OAuthSocketPayload) => {
        const finish = async () => {
          await closeOAuthWebviewIfOpen();
        };
        if (p.kind === "tokens") {
          saveTokens(p.accessToken, p.refreshToken, p.expiresIn);
          clearOAuthBridge();
          void finish().then(() => {
            window.location.assign("/");
          });
          return;
        }
        if (p.kind === "signup") {
          void (async () => {
            try {
              const pip = getCachedPublicIp() ?? (await fetchPublicIp());
              const tokens = await oauthCompleteRequest(p.signupToken, {
                ...(pip ? { clientPublicIp: pip } : {}),
              });
              saveTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
              clearOAuthBridge();
              await closeOAuthWebviewIfOpen();
              window.location.assign("/");
            } catch (e) {
              sessionStorage.setItem(
                "oauth_callback_error",
                JSON.stringify({
                  message:
                    e instanceof Error ? e.message : "Falha ao concluir registo.",
                }),
              );
              clearOAuthBridge();
              await closeOAuthWebviewIfOpen();
              window.location.assign("/");
            }
          })();
          return;
        }
        if (p.kind === "disabled_confirm") {
          sessionStorage.setItem(
            "oauth_reactivate_pending",
            JSON.stringify({ reactivationToken: p.reactivationToken }),
          );
          clearOAuthBridge();
          void finish().then(() => {
            window.location.assign("/");
          });
          return;
        }
        if (p.kind === "2fa_required") {
          sessionStorage.setItem(
            "oauth_2fa_pending",
            JSON.stringify({ tempToken: p.tempToken }),
          );
          clearOAuthBridge();
          void finish().then(() => {
            window.location.assign("/");
          });
          return;
        }
        sessionStorage.setItem(
          "oauth_callback_error",
          JSON.stringify({ code: p.code, message: p.message ?? "" }),
        );
        clearOAuthBridge();
        void finish().then(() => {
          window.location.assign("/");
        });
      },
    );

    await fetchPublicIp();
    const pip = getCachedPublicIp();
    const startUrl =
      provider === "google"
        ? oauthGoogleStartUrl(email, tauriHandoffUrl, bridgeId, pip ?? undefined)
        : oauthMicrosoftStartUrl(email, tauriHandoffUrl, bridgeId, pip ?? undefined);
    await closeOAuthWebviewIfOpen();
    const oauthWin = new WebviewWindow(OAUTH_WEBVIEW_LABEL, {
      url: startUrl,
      width: 440,
      height: 700,
      center: true,
      resizable: true,
      title: "SyncYou — Início de sessão",
      decorations: true,
      focus: true,
    });
    oauthWin.once("tauri://error", (e) => {
      console.error("[oauth] WebviewWindow:", e);
    });
    return;
  }

  await fetchPublicIp();
  const pipWeb = getCachedPublicIp();
  window.location.href =
    provider === "google"
      ? oauthGoogleStartUrl(email, undefined, undefined, pipWeb ?? undefined)
      : oauthMicrosoftStartUrl(email, undefined, undefined, pipWeb ?? undefined);
}
