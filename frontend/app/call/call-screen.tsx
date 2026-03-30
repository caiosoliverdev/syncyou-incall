"use client";

import { isTauri } from "@tauri-apps/api/core";
import { Phone, PhoneOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  CALL_ANSWERED_EVENT,
  CALL_BROADCAST_CHANNEL,
  type CallAnsweredPayload,
  type CallRoomParticipant,
} from "@/lib/call-events";
import { apiOrigin, voiceCallAnswerRequest, voiceCallEndRingRequest } from "@/lib/api";
import { getAccessToken, SESSION_TOKENS_UPDATED_EVENT } from "@/lib/auth-tokens";
import { isChatApiConversationId } from "@/lib/chat-map";
import { startCallingRingtone } from "@/lib/calling-ringtone";

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return `${p[0]![0] ?? ""}${p[p.length - 1]![0] ?? ""}`.toUpperCase();
}

/** Só URLs http(s) — evita `javascript:` na query string. */
function isSafeAvatarUrl(url: string): boolean {
  const t = url.trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function closeCallWindow() {
  if (isTauri()) {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    await getCurrentWebviewWindow().close();
    return;
  }
  window.close();
}

/** Sem atendimento real: fecha a janela de «Ligando…» sem abrir sessão na janela principal. */
const OUTGOING_CALL_NO_ANSWER_MS = 40_000;

export function CallScreen() {
  const searchParams = useSearchParams();
  const name = searchParams.get("name")?.trim() || "Contato";
  const themeParam = searchParams.get("theme");
  const isDark = themeParam !== "light";
  const conversationId = searchParams.get("cid")?.trim() || "";
  const kindRaw = searchParams.get("kind");
  const conversationKind: "direct" | "group" =
    kindRaw === "group" ? "group" : "direct";
  const callTypeRaw = searchParams.get("callType");
  const callSessionType: "direct" | "group_room" | "group_call" =
    callTypeRaw === "group_call"
      ? "group_call"
      : callTypeRaw === "group_room"
        ? "group_room"
        : "direct";
  const isIncoming = searchParams.get("incoming") === "1";
  const avatarRaw = searchParams.get("avatar")?.trim() ?? "";
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const showAvatar =
    avatarRaw.length > 0 && isSafeAvatarUrl(avatarRaw) && !avatarLoadFailed;

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarRaw]);

  const [busy, setBusy] = useState(false);
  /** Só saída: após este tempo sem o outro atender, a chamada cai (fecha sem simular atendimento). */
  const outgoingNoAnswerTimerRef = useRef<number | null>(null);
  const stopRingRef = useRef<(() => void) | null>(null);
  const socketRef = useRef<Socket | null>(null);

  /** O outro lado cancelou, recusou ou o toque expirou — só fechar localmente (sem notificar de novo). */
  const closeFromRemote = useCallback(() => {
    stopRingRef.current?.();
    stopRingRef.current = null;
    if (outgoingNoAnswerTimerRef.current != null) {
      window.clearTimeout(outgoingNoAnswerTimerRef.current);
      outgoingNoAnswerTimerRef.current = null;
    }
    void closeCallWindow();
  }, []);

  /** Cancelar / recusar / timeout: avisa o par por API + fecha. */
  const notifyPeerAndClose = useCallback(async () => {
    stopRingRef.current?.();
    stopRingRef.current = null;
    if (outgoingNoAnswerTimerRef.current != null) {
      window.clearTimeout(outgoingNoAnswerTimerRef.current);
      outgoingNoAnswerTimerRef.current = null;
    }
    if (conversationId && isChatApiConversationId(conversationId)) {
      try {
        await voiceCallEndRingRequest(conversationId);
      } catch {
        /* mesmo offline, fechamos a janela local */
      }
    }
    await closeCallWindow();
  }, [conversationId]);

  const emitAnsweredAndClose = useCallback(async () => {
    if (!conversationId) return;
    stopRingRef.current?.();
    stopRingRef.current = null;
    if (outgoingNoAnswerTimerRef.current != null) {
      window.clearTimeout(outgoingNoAnswerTimerRef.current);
      outgoingNoAnswerTimerRef.current = null;
    }
    /** Fecha a janela «Ligando…» do outro lado antes de abrir a sessão na principal. */
    if (conversationId && isChatApiConversationId(conversationId)) {
      try {
        await voiceCallEndRingRequest(conversationId);
      } catch {
        /* continua o atendimento na mesma */
      }
      try {
        await voiceCallAnswerRequest(conversationId);
      } catch {
        /* falha de rede: quem ligou pode nao abrir a tela; o evento local segue */
      }
    }
    const roomParticipants: CallRoomParticipant[] =
      conversationKind === "group"
        ? []
        : [
            { id: "__you__", name: "Você", role: "Conectado", isYou: true },
            { id: conversationId, name, role: "Em chamada" },
          ];
    const payload: CallAnsweredPayload = {
      conversationId,
      peerName: name,
      conversationKind,
      callSessionType,
      roomId: conversationId,
      roomLayout:
        callSessionType === "group_call" || conversationKind === "group" ? "conference" : "p2p",
      ...(conversationKind === "group" ? {} : { roomParticipants }),
      ...(conversationKind === "group" ? {} : { callRole: "callee" as const }),
    };
    setBusy(true);
    try {
      if (isTauri()) {
        const { emit } = await import("@tauri-apps/api/event");
        await emit(CALL_ANSWERED_EVENT, payload);
      } else {
        const bc = new BroadcastChannel(CALL_BROADCAST_CHANNEL);
        bc.postMessage({ type: "call-answered", payload });
        bc.close();
      }
      await closeCallWindow();
    } finally {
      setBusy(false);
    }
  }, [callSessionType, conversationId, conversationKind, name]);

  useEffect(() => {
    stopRingRef.current = startCallingRingtone();
    return () => {
      stopRingRef.current?.();
      stopRingRef.current = null;
    };
  }, []);

  /** Socket só para receber `voice_call_ring_ended` (a janela /call não usa o bind da página principal). */
  useEffect(() => {
    if (!conversationId || !isChatApiConversationId(conversationId)) return;

    const connect = () => {
      const token = getAccessToken();
      if (!token) return;
      socketRef.current?.disconnect();
      const s = io(`${apiOrigin()}/session`, {
        auth: { token },
        transports: ["websocket", "polling"],
        reconnection: true,
      });
      s.on("voice_call_ring_ended", (payload: unknown) => {
        const p = payload as { conversationId?: string };
        if (p.conversationId === conversationId) {
          closeFromRemote();
        }
      });
      socketRef.current = s;
    };

    connect();
    const onTokens = () => connect();
    window.addEventListener(SESSION_TOKENS_UPDATED_EVENT, onTokens);
    return () => {
      window.removeEventListener(SESSION_TOKENS_UPDATED_EVENT, onTokens);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [conversationId, closeFromRemote]);

  useEffect(() => {
    if (!conversationId || isIncoming) return;
    outgoingNoAnswerTimerRef.current = window.setTimeout(() => {
      outgoingNoAnswerTimerRef.current = null;
      void notifyPeerAndClose();
    }, OUTGOING_CALL_NO_ANSWER_MS);
    return () => {
      if (outgoingNoAnswerTimerRef.current != null) {
        window.clearTimeout(outgoingNoAnswerTimerRef.current);
        outgoingNoAnswerTimerRef.current = null;
      }
    };
  }, [conversationId, isIncoming, notifyPeerAndClose]);

  const onCancel = useCallback(() => {
    void notifyPeerAndClose();
  }, [notifyPeerAndClose]);

  const shell = isDark
    ? "bg-gradient-to-b from-zinc-950 via-emerald-950/25 to-zinc-950 text-zinc-100"
    : "bg-gradient-to-b from-slate-100 via-emerald-50/80 to-white text-slate-900";

  return (
    <div className={`relative flex min-h-screen w-full flex-col overflow-hidden ${shell}`}>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h30v30H0z' fill='%23fff' fill-opacity='.1'/%3E%3C/svg%3E")`,
        }}
      />

      <header
        data-tauri-drag-region
        className="relative z-10 cursor-grab select-none px-4 pt-4 pb-2 active:cursor-grabbing"
      >
        <p
          className={`text-[10px] font-bold tracking-widest uppercase ${
            isDark ? "text-emerald-400/90" : "text-emerald-700"
          }`}
        >
          SyncYou
        </p>
        <p className={`text-xs ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
          {isIncoming ? "Chamada recebida" : "Ligando…"}
        </p>
      </header>

      <div
        data-tauri-drag-region
        className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-6 pb-4"
      >
        <div className="relative mb-8">
          <span
            className={`absolute inset-[-12px] animate-ping rounded-full opacity-35 ${
              isDark ? "bg-emerald-500" : "bg-emerald-400"
            }`}
          />
          <div
            className={`relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full shadow-2xl ring-4 ${
              isDark ? "ring-emerald-500/25" : "ring-emerald-300/50"
            }`}
          >
            {showAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL da API / ficheiros públicos
              <img
                src={avatarRaw}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <div
                className={`flex h-full w-full items-center justify-center bg-gradient-to-br text-2xl font-bold text-white ${
                  isDark
                    ? "from-emerald-600 to-emerald-900"
                    : "from-emerald-500 to-emerald-700"
                }`}
              >
                {initials(name)}
              </div>
            )}
          </div>
        </div>

        <h1 className="max-w-[280px] text-center text-lg font-semibold tracking-tight">{name}</h1>
        <p className={`mt-2 text-center text-sm ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
          {isIncoming ? "está ligando…" : "Aguardando atendimento…"}
        </p>
      </div>

      <div className="relative z-10 flex flex-col items-center px-6 pb-8">
        {isIncoming ? (
          <div className="flex w-full max-w-[280px] items-center justify-center gap-10">
            <div className="flex flex-col items-center">
              <button
                type="button"
                data-tauri-drag-region="false"
                onClick={() => void emitAnsweredAndClose()}
                disabled={busy}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-900/35 transition hover:from-emerald-400 hover:to-emerald-600 disabled:opacity-60"
                aria-label="Atender ligacao"
              >
                <Phone size={28} strokeWidth={2.2} />
              </button>
              <span className={`mt-3 text-center text-xs ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                Atender
              </span>
            </div>
            <div className="flex flex-col items-center">
              <button
                type="button"
                data-tauri-drag-region="false"
                onClick={onCancel}
                disabled={busy}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-red-500 to-red-700 text-white shadow-lg shadow-red-900/35 transition hover:from-red-400 hover:to-red-600 disabled:opacity-60"
                aria-label="Recusar ligacao"
              >
                <PhoneOff size={28} strokeWidth={2.2} />
              </button>
              <span className={`mt-3 text-center text-xs ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
                Recusar
              </span>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              data-tauri-drag-region="false"
              onClick={onCancel}
              disabled={busy}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-red-500 to-red-700 text-white shadow-lg shadow-red-900/35 transition hover:from-red-400 hover:to-red-600 disabled:opacity-60"
              aria-label="Cancelar ligacao"
            >
              <PhoneOff size={28} strokeWidth={2.2} />
            </button>
            <span className={`mt-3 text-center text-xs ${isDark ? "text-zinc-500" : "text-slate-500"}`}>
              Cancelar chamada
            </span>
          </>
        )}
      </div>
    </div>
  );
}
