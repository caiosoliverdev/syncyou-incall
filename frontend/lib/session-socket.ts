import { io, type Socket } from "socket.io-client";
import type {
  CallConferenceParticipantsPayload,
  GroupAudioRoomParticipantsPayload,
} from "@/lib/call-events";
import { apiOrigin } from "@/lib/api";
import { getAccessToken, SESSION_TOKENS_UPDATED_EVENT } from "@/lib/auth-tokens";

/**
 * Mantém um socket no namespace `/session` com o JWT (claim `sid`).
 * - Reconecta quando os tokens são actualizados (`SESSION_TOKENS_UPDATED_EVENT`).
 * - Em `session_ended` (revogação no servidor), deve chamar-se logout no cliente.
 * - Evento `notification`: payload alinhado com `AppNotificationItem` (API).
 * - Evento `friendship_update`: bloqueio/desbloqueio (outro utilizador); `{ type, peerUserId }`.
 * - Evento `peer_presence`: amigo mudou estado; `{ peerUserId, presenceStatus }`.
 * - Evento `chat_message`: nova mensagem na conversa; `{ conversationId, message, muted? }` (`muted` = destinatário silenciou a conversa).
 * - Evento `chat_read`: destinatário leu até `lastReadAt`; `{ conversationId, lastReadAt }`.
 * - Evento `chat_message_deleted_for_everyone`: apagar para todos — remetente recebe só ids; destinatário recebe `message` (tombstone).
 * - Evento `chat_conversation_created`: novo grupo (ou outra conversa) visível na lista; `{ conversation: ChatConversationListItem }`.
 * - Evento `incoming_call`: chamada de voz na conversa directa; `{ callerUserId, callerName, callerAvatarUrl?, conversationId, conversationKind: 'direct' }`.
 * - Evento `voice_call_ring_ended`: o outro lado cancelou, recusou ou o toque expirou; `{ conversationId }` — fechar janela de chamada se `cid` coincidir.
 * - Evento `voice_call_answered`: quem recebeu atendeu; quem ligou abre a tela de ligação (payload como `CallAnsweredPayload` mínimo: conversationId, peerName, conversationKind, roomId?, roomLayout?).
 * - Evento `voice_call_session_ended`: o outro encerrou a chamada na app; `{ conversationId }` — fechar `activeCallSession`.
 * - Evento `voice_call_webrtc_signal`: sinalização WebRTC relayada pelo servidor; `{ conversationId, fromUserId, signal }`.
 * - Evento `voice_call_voice_activity`: VAD relayado; `{ conversationId, fromUserId, speaking }`.
 * - Evento `voice_call_mic_muted`: mute do microfone; `{ conversationId, fromUserId, micMuted }`.
 * - Evento `voice_call_camera_off`: câmera desligada (UI); `{ conversationId, fromUserId, cameraOff }`.
 * - Emitir `chat_focus` com `{ conversationId: string | null }` para o servidor saber qual conversa está aberta (evita notificação se já estiver a ver o chat).
 */
/** Último foco reportado — reenviado após `connect` / reconexão. */
let pendingChatFocus: { conversationId: string | null } = { conversationId: null };

let activeSocket: Socket | null = null;

/** Último socket do namespace `/session` (para RPC Mediasoup). */
export function getActiveSessionSocket(): Socket | null {
  return activeSocket;
}

export async function emitMediasoupRpc<T = unknown>(event: string, payload: unknown): Promise<T> {
  const s = activeSocket;
  if (!s?.connected) {
    throw new Error("session_socket_offline");
  }
  return await new Promise<T>((resolve, reject) => {
    s.timeout(40_000).emit(event, payload, (err: Error, res: T) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

export type MediasoupNewProducerPayload = {
  conversationId: string;
  producerId: string;
  producerUserId: string;
  kind: string;
  appData?: { source?: string } & Record<string, unknown>;
};

export type MediasoupClosedProducerPayload = {
  conversationId: string;
  producerId: string;
  producerUserId: string;
  kind: string;
  appData?: { source?: string } & Record<string, unknown>;
};

export type VoiceCallWebRtcSignalPayload = {
  conversationId: string;
  fromUserId?: string;
  signal: VoiceCallWebRtcSignal;
};

export type VoiceCallWebRtcSignal =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit };

export function emitVoiceCallWebRtcSignal(payload: {
  conversationId: string;
  signal: VoiceCallWebRtcSignal;
}): void {
  activeSocket?.emit("voice_call_webrtc_signal", payload);
}

export type VoiceCallVoiceActivityPayload = {
  conversationId: string;
  fromUserId: string;
  speaking: boolean;
};

export function emitVoiceCallVoiceActivity(payload: {
  conversationId: string;
  speaking: boolean;
}): void {
  activeSocket?.emit("voice_call_voice_activity", payload);
}

export type VoiceCallMicMutedPayload = {
  conversationId: string;
  fromUserId: string;
  micMuted: boolean;
};

export function emitVoiceCallMicMuted(payload: {
  conversationId: string;
  micMuted: boolean;
}): void {
  activeSocket?.emit("voice_call_mic_muted", payload);
}

export type VoiceCallCameraOffPayload = {
  conversationId: string;
  fromUserId: string;
  cameraOff: boolean;
};

export function emitVoiceCallCameraOff(payload: {
  conversationId: string;
  cameraOff: boolean;
}): void {
  activeSocket?.emit("voice_call_camera_off", payload);
}

/** Servidor: não criar notificação de mensagem se o destinatário tiver esta conversa aberta. */
export function emitChatFocus(conversationId: string | null): void {
  pendingChatFocus = { conversationId };
  activeSocket?.emit("chat_focus", pendingChatFocus);
}

export async function emitGroupAudioRoomJoin(payload: {
  conversationId: string;
}): Promise<{ ok: true; participants?: GroupAudioRoomParticipantsPayload["participants"] }> {
  return await emitMediasoupRpc("group_audio_room_join", payload);
}

export function emitGroupAudioRoomLeave(payload: { conversationId: string }): void {
  activeSocket?.emit("group_audio_room_leave", payload);
}

export async function emitCallConferenceJoin(payload: {
  conversationId: string;
}): Promise<{ ok: true; participants?: CallConferenceParticipantsPayload["participants"] }> {
  return await emitMediasoupRpc("call_conference_join", payload);
}

export function emitCallConferenceLeave(payload: { conversationId: string }): void {
  activeSocket?.emit("call_conference_leave", payload);
}

export function bindSessionSocket(
  onSessionEnded: () => void,
  options?: {
    onSocketDisconnected?: (reason: string) => void;
    onNotification?: (payload: unknown) => void;
    onFriendshipUpdate?: (payload: unknown) => void;
    onPeerPresence?: (payload: unknown) => void;
    onChatMessage?: (payload: unknown) => void;
    onChatRead?: (payload: unknown) => void;
    onChatMessageDeletedForEveryone?: (payload: unknown) => void;
    onChatConversationCreated?: (payload: unknown) => void;
    onIncomingCall?: (payload: unknown) => void;
    onVoiceCallAnswered?: (payload: unknown) => void;
    onVoiceCallSessionEnded?: (payload: unknown) => void;
    onVoiceCallWebRtcSignal?: (payload: VoiceCallWebRtcSignalPayload) => void;
    onVoiceCallVoiceActivity?: (payload: VoiceCallVoiceActivityPayload) => void;
    onVoiceCallMicMuted?: (payload: VoiceCallMicMutedPayload) => void;
    onVoiceCallCameraOff?: (payload: VoiceCallCameraOffPayload) => void;
    onMediasoupNewProducer?: (payload: MediasoupNewProducerPayload) => void;
    onMediasoupProducerClosed?: (payload: MediasoupClosedProducerPayload) => void;
    onGroupAudioRoomParticipants?: (payload: GroupAudioRoomParticipantsPayload) => void;
    onCallConferenceParticipants?: (payload: CallConferenceParticipantsPayload) => void;
  },
): () => void {
  let socket: Socket | null = null;

  const connect = () => {
    const token = getAccessToken();
    if (!token) {
      socket?.disconnect();
      socket = null;
      activeSocket = null;
      return;
    }
    socket?.disconnect();
    const s = io(`${apiOrigin()}/session`, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
    });
    socket = s;
    activeSocket = s;
    s.on("connect", () => {
      s.emit("chat_focus", pendingChatFocus);
    });
    s.on("disconnect", (reason: string) => {
      options?.onSocketDisconnected?.(reason);
    });
    s.on("session_ended", () => {
      onSessionEnded();
    });
    s.on("notification", (payload: unknown) => {
      options?.onNotification?.(payload);
    });
    s.on("friendship_update", (payload: unknown) => {
      options?.onFriendshipUpdate?.(payload);
    });
    s.on("peer_presence", (payload: unknown) => {
      options?.onPeerPresence?.(payload);
    });
    s.on("chat_message", (payload: unknown) => {
      options?.onChatMessage?.(payload);
    });
    s.on("chat_read", (payload: unknown) => {
      options?.onChatRead?.(payload);
    });
    s.on("chat_message_deleted_for_everyone", (payload: unknown) => {
      options?.onChatMessageDeletedForEveryone?.(payload);
    });
    s.on("chat_conversation_created", (payload: unknown) => {
      options?.onChatConversationCreated?.(payload);
    });
    s.on("incoming_call", (payload: unknown) => {
      options?.onIncomingCall?.(payload);
    });
    s.on("voice_call_answered", (payload: unknown) => {
      options?.onVoiceCallAnswered?.(payload);
    });
    s.on("voice_call_session_ended", (payload: unknown) => {
      options?.onVoiceCallSessionEnded?.(payload);
    });
    s.on("voice_call_webrtc_signal", (payload: unknown) => {
      const p = payload as Partial<VoiceCallWebRtcSignalPayload>;
      if (
        typeof p.conversationId === "string" &&
        p.signal != null &&
        typeof p.signal === "object" &&
        "type" in p.signal
      ) {
        options?.onVoiceCallWebRtcSignal?.(p as VoiceCallWebRtcSignalPayload);
      }
    });
    s.on("voice_call_voice_activity", (payload: unknown) => {
      const p = payload as Partial<VoiceCallVoiceActivityPayload>;
      if (
        typeof p.conversationId === "string" &&
        typeof p.fromUserId === "string" &&
        typeof p.speaking === "boolean"
      ) {
        options?.onVoiceCallVoiceActivity?.(p as VoiceCallVoiceActivityPayload);
      }
    });
    s.on("voice_call_mic_muted", (payload: unknown) => {
      const p = payload as Partial<VoiceCallMicMutedPayload>;
      if (
        typeof p.conversationId === "string" &&
        typeof p.fromUserId === "string" &&
        typeof p.micMuted === "boolean"
      ) {
        options?.onVoiceCallMicMuted?.(p as VoiceCallMicMutedPayload);
      }
    });
    s.on("voice_call_camera_off", (payload: unknown) => {
      const p = payload as Partial<VoiceCallCameraOffPayload>;
      if (
        typeof p.conversationId === "string" &&
        typeof p.fromUserId === "string" &&
        typeof p.cameraOff === "boolean"
      ) {
        options?.onVoiceCallCameraOff?.(p as VoiceCallCameraOffPayload);
      }
    });
    s.on("mediasoup_new_producer", (payload: unknown) => {
      const p = payload as Partial<MediasoupNewProducerPayload>;
      if (
        typeof p.conversationId === "string" &&
        typeof p.producerId === "string" &&
        typeof p.producerUserId === "string" &&
        typeof p.kind === "string"
      ) {
        options?.onMediasoupNewProducer?.(p as MediasoupNewProducerPayload);
      }
    });
    s.on("mediasoup_producer_closed", (payload: unknown) => {
      const p = payload as Partial<MediasoupClosedProducerPayload>;
      if (
        typeof p.conversationId === "string" &&
        typeof p.producerId === "string" &&
        typeof p.producerUserId === "string" &&
        typeof p.kind === "string"
      ) {
        options?.onMediasoupProducerClosed?.(p as MediasoupClosedProducerPayload);
      }
    });
    s.on("group_audio_room_participants", (payload: unknown) => {
      const p = payload as Partial<GroupAudioRoomParticipantsPayload>;
      if (typeof p.conversationId === "string" && Array.isArray(p.participants)) {
        options?.onGroupAudioRoomParticipants?.(p as GroupAudioRoomParticipantsPayload);
      }
    });
    s.on("call_conference_participants", (payload: unknown) => {
      const p = payload as Partial<CallConferenceParticipantsPayload>;
      if (typeof p.conversationId === "string" && Array.isArray(p.participants)) {
        options?.onCallConferenceParticipants?.(p as CallConferenceParticipantsPayload);
      }
    });
  };

  connect();

  const onTokens = () => connect();
  window.addEventListener(SESSION_TOKENS_UPDATED_EVENT, onTokens);

  return () => {
    window.removeEventListener(SESSION_TOKENS_UPDATED_EVENT, onTokens);
    socket?.disconnect();
    socket = null;
    activeSocket = null;
  };
}
