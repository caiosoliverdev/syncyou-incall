import { oauthCompleteRequest } from "@/lib/api";
import { saveTokens } from "@/lib/auth-tokens";
import { fetchPublicIp, getCachedPublicIp } from "@/lib/client-geo";

export type OAuthFlowResult =
  | { kind: "done" }
  | { kind: "error"; message: string };

/**
 * Processa query params do redirect OAuth (http ou syncyou://).
 * Usado pela página /oauth/callback e pelo deep link no Tauri.
 */
export async function runOAuthCallbackFromSearchParams(
  sp: URLSearchParams,
): Promise<OAuthFlowResult> {
  const oauth = sp.get("oauth");
  if (oauth === "ok") {
    /** Tokens entregues por Socket.IO na app Tauri; o URL só traz oauth=ok&socket=1 */
    if (sp.get("socket") === "1") {
      return { kind: "done" };
    }
    const access = sp.get("access_token");
    const refresh = sp.get("refresh_token");
    if (!access || !refresh) {
      return { kind: "error", message: "Resposta OAuth inválida." };
    }
    saveTokens(access, refresh);
    return { kind: "done" };
  }
  if (oauth === "signup") {
    if (sp.get("socket") === "1") {
      return { kind: "done" };
    }
    const token = sp.get("signup_token");
    if (!token) {
      return { kind: "error", message: "Token de registo em falta." };
    }
    try {
      const pip = getCachedPublicIp() ?? (await fetchPublicIp());
      const tokens = await oauthCompleteRequest(token, {
        ...(pip ? { clientPublicIp: pip } : {}),
      });
      saveTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
      return { kind: "done" };
    } catch (e) {
      return {
        kind: "error",
        message: e instanceof Error ? e.message : "Falha ao concluir registo.",
      };
    }
  }
  if (oauth === "reactivate") {
    if (sp.get("socket") === "1") {
      return { kind: "done" };
    }
    const reactivationToken = sp.get("reactivation_token");
    if (!reactivationToken) {
      return { kind: "error", message: "Token de reativação em falta." };
    }
    sessionStorage.setItem(
      "oauth_reactivate_pending",
      JSON.stringify({ reactivationToken }),
    );
    return { kind: "done" };
  }
  if (oauth === "2fa") {
    if (sp.get("socket") === "1") {
      return { kind: "done" };
    }
    const tempToken = sp.get("temp_token");
    if (!tempToken) {
      return { kind: "error", message: "Token 2FA em falta." };
    }
    sessionStorage.setItem("oauth_2fa_pending", JSON.stringify({ tempToken }));
    return { kind: "done" };
  }
  if (oauth === "err") {
    const code = sp.get("code") ?? "";
    const message = sp.get("message") ?? "";
    sessionStorage.setItem(
      "oauth_callback_error",
      JSON.stringify({ code, message }),
    );
    return { kind: "done" };
  }
  return { kind: "error", message: "Parâmetros OAuth em falta." };
}
