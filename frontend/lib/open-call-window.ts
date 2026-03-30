import { isTauri } from "@tauri-apps/api/core";

/**
 * Abre a janela de discagem (sem controles de midia). Apos atendimento, a sessao segue na janela principal.
 */
export async function openCallWindow(
  peerName: string,
  theme: "light" | "dark",
  conversationId: string,
  conversationKind: "direct" | "group",
  callSessionType: "direct" | "group_room" | "group_call" = conversationKind === "group"
    ? "group_room"
    : "direct",
  peerAvatarUrl?: string | null,
): Promise<void> {
  const params = new URLSearchParams({
    name: peerName,
    theme,
    cid: conversationId,
    kind: conversationKind,
    callType: callSessionType,
  });
  const a = peerAvatarUrl?.trim();
  if (a) params.set("avatar", a);
  const query = params.toString();

  if (isTauri()) {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const label = `call-${Date.now()}`;
    const safeTitle =
      peerName.length > 42 ? `${peerName.slice(0, 40)}…` : peerName;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const url = `${origin}/call?${query}`;

    const win = new WebviewWindow(label, {
      url,
      title: `Ligando — ${safeTitle}`,
      width: 360,
      height: 480,
      minWidth: 360,
      maxWidth: 360,
      minHeight: 480,
      maxHeight: 480,
      center: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      decorations: false,
      shadow: true,
      focus: true,
    });

    win.once("tauri://error", (e) => {
      // eslint-disable-next-line no-console
      console.error("[call] falha ao criar janela:", e);
    });
    return;
  }

  const path = `/call?${query}`;
  window.open(path, "_blank", "noopener,noreferrer,width=360,height=480");
}

/** Simula chamada recebida (query `incoming=1`). Mesmo tamanho da janela de discagem. */
export async function openIncomingCallWindow(
  peerName: string,
  theme: "light" | "dark",
  conversationId: string,
  conversationKind: "direct" | "group",
  callSessionType: "direct" | "group_room" | "group_call" = conversationKind === "group"
    ? "group_room"
    : "direct",
  peerAvatarUrl?: string | null,
): Promise<void> {
  const params = new URLSearchParams({
    name: peerName,
    theme,
    cid: conversationId,
    kind: conversationKind,
    callType: callSessionType,
    incoming: "1",
  });
  const a = peerAvatarUrl?.trim();
  if (a) params.set("avatar", a);
  const query = params.toString();

  if (isTauri()) {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const label = `call-in-${Date.now()}`;
    const safeTitle =
      peerName.length > 42 ? `${peerName.slice(0, 40)}…` : peerName;
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
    const url = `${origin}/call?${query}`;

    const win = new WebviewWindow(label, {
      url,
      title: `Chamada recebida — ${safeTitle}`,
      width: 360,
      height: 480,
      minWidth: 360,
      maxWidth: 360,
      minHeight: 480,
      maxHeight: 480,
      center: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      decorations: false,
      shadow: true,
      focus: true,
    });

    win.once("tauri://error", (e) => {
      // eslint-disable-next-line no-console
      console.error("[call-incoming] falha ao criar janela:", e);
    });
    return;
  }

  const path = `/call?${query}`;
  window.open(path, "_blank", "noopener,noreferrer,width=360,height=480");
}
