/** Evento Tauri + BroadcastChannel quando a ligacao e atendida (fecha a janelinha e abre a sessao na principal). */
export const CALL_ANSWERED_EVENT = "call-answered";

/** Canal usado fora do Tauri (aba extra). */
export const CALL_BROADCAST_CHANNEL = "incall-call-answered";

/** Participante na sala de chamada (UI em tempo real). */
export type CallRoomParticipant = {
  id: string;
  name: string;
  role: string;
  isYou?: boolean;
  avatarUrl?: string | null;
};

export type GroupAudioRoomParticipantsPayload = {
  conversationId: string;
  participants: Array<{
    userId: string;
    displayName: string;
    role: string;
    avatarUrl?: string | null;
  }>;
};

export type CallAnsweredPayload = {
  conversationId: string;
  peerName: string;
  conversationKind: "direct" | "group";
  callSessionType?: "direct" | "group_room" | "group_call";
  /** Id da sala (default: conversationId). */
  roomId?: string;
  roomParticipants?: CallRoomParticipant[];
  /** p2p = avatar 1:1; conference = lista de participantes + chat aberto por padrao. */
  roomLayout?: "p2p" | "conference";
  /**
   * Quem cria a oferta WebRTC: quem ligou recebe `caller` via socket;
   * quem atende envia `callee` no payload local (BroadcastChannel / Tauri).
   */
  callRole?: "caller" | "callee";
};

export type CallConferenceParticipantsPayload = {
  conversationId: string;
  participants: Array<{
    userId: string;
    displayName: string;
    role: string;
    avatarUrl?: string | null;
  }>;
};
