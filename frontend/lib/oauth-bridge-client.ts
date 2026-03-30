import { io } from "socket.io-client";
import { apiOrigin } from "@/lib/api";

export type OAuthSocketPayload =
  | {
      kind: "tokens";
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }
  | { kind: "signup"; signupToken: string }
  | { kind: "disabled_confirm"; reactivationToken: string }
  | { kind: "2fa_required"; tempToken: string }
  | { kind: "error"; code: string; message?: string };

/**
 * Liga ao namespace `/oauth-bridge` no backend e junta-se à sala do `bridgeId`.
 * O servidor emite `oauth_result` quando o OAuth termina (app Tauri).
 */
export function connectOAuthBridge(
  bridgeId: string,
  onResult: (payload: OAuthSocketPayload) => void,
): () => void {
  const socket = io(`${apiOrigin()}/oauth-bridge`, {
    transports: ["websocket", "polling"],
    autoConnect: true,
  });

  const onConnect = () => {
    socket.emit("join", { bridgeId });
  };

  socket.on("connect", onConnect);
  if (socket.connected) {
    onConnect();
  }

  socket.on("oauth_result", (payload: OAuthSocketPayload) => {
    onResult(payload);
  });

  return () => {
    socket.off("connect", onConnect);
    socket.off("oauth_result");
    socket.disconnect();
  };
}
