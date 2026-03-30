import {
  AUTH_LOGOUT_REQUIRED_EVENT,
  clearTokens,
  getAccessExpiresAtMs,
  getAccessToken,
  getRefreshToken,
  saveTokens,
  setAccessExpiresAtMs,
} from "./auth-tokens";

const base = () =>
  (process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001/api/v1").replace(/\/$/, "");

/** Renovar access token se faltar ≤10 min para expirar (ou já expirou). */
const REFRESH_MARGIN_MS = 10 * 60 * 1000;

function decodeJwtExpMs(accessToken: string): number | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(b64 + pad);
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp === "number") return payload.exp * 1000;
    return null;
  } catch {
    return null;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

export async function refreshRequest(refreshToken: string): Promise<LoginResponse> {
  return apiJson<LoginResponse>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export async function ensureAccessTokenFresh(): Promise<boolean> {
  if (typeof window === "undefined") return true;

  const access = getAccessToken();
  const refresh = getRefreshToken();
  if (!access && !refresh) return false;

  let expiresAt = getAccessExpiresAtMs();
  if (expiresAt == null && access) {
    const fromJwt = decodeJwtExpMs(access);
    if (fromJwt != null) {
      setAccessExpiresAtMs(fromJwt);
      expiresAt = fromJwt;
    }
  }

  const now = Date.now();
  const needRefresh =
    !access || (expiresAt != null && now + REFRESH_MARGIN_MS >= expiresAt);

  if (!needRefresh) return true;
  if (!refresh) {
    clearTokens();
    window.dispatchEvent(new Event(AUTH_LOGOUT_REQUIRED_EVENT));
    return false;
  }

  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async (): Promise<boolean> => {
    try {
      const res = await refreshRequest(refresh);
      saveTokens(res.accessToken, res.refreshToken, res.expiresIn);
      return true;
    } catch {
      clearTokens();
      window.dispatchEvent(new Event(AUTH_LOGOUT_REQUIRED_EVENT));
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Origem HTTP da API (sem `/api/v1`), ex. para Socket.IO. */
export function apiOrigin(): string {
  const b = base();
  return b.replace(/\/api\/v1$/, "") || "http://localhost:3001";
}

export type ApiErrorBody = {
  message?: string | string[];
  statusCode?: number;
  code?: string;
  email?: string;
  tempToken?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly email?: string;
  readonly tempToken?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    email?: string,
    tempToken?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.email = email;
    this.tempToken = tempToken;
  }
}

function parseMessage(body: ApiErrorBody): string {
  const m = body.message;
  if (Array.isArray(m)) return m.join(", ");
  if (typeof m === "string") return m;
  return "Pedido falhou";
}

export async function apiJson<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const { auth, ...rest } = options;
  if (auth && typeof window !== "undefined") {
    const fresh = await ensureAccessTokenFresh();
    if (!fresh) {
      throw new ApiError("Sessão expirada. Entre novamente.", 401);
    }
    const token = window.localStorage.getItem("syncyou_access_token");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const res = await fetch(`${base()}${path}`, { ...rest, headers });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : {};

  if (!res.ok) {
    const err = data as ApiErrorBody;
    const msg = parseMessage(err);
    throw new ApiError(msg, res.status, err.code, err.email, err.tempToken);
  }

  return data as T;
}

export type PresenceStatus = "online" | "away" | "busy" | "invisible" | "on_call";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  publicToken: string;
  emailVerified: boolean;
  encryptionPublicKey: string | null;
  phoneWhatsapp: string | null;
  socialDiscord: string | null;
  socialLinkedin: string | null;
  socialYoutube: string | null;
  socialInstagram: string | null;
  socialFacebook: string | null;
  websiteUrl: string | null;
  accountDisabledAt: string | null;
  hasPassword: boolean;
  twoFactorEnabled?: boolean;
  /** Estado de presença persistido no servidor */
  presenceStatus?: PresenceStatus;
  lastSessionIp?: string | null;
  lastSessionCity?: string | null;
  lastSessionLatitude?: number | null;
  lastSessionLongitude?: number | null;
  lastSessionAt?: string | null;
};

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
};

export async function loginRequest(
  email: string,
  password: string,
  options?: {
    reactivate?: boolean;
    latitude?: number;
    longitude?: number;
    /** IP público (ipify) quando o API em dev só vê ::1 */
    clientPublicIp?: string;
  },
): Promise<LoginResponse> {
  return apiJson<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      email,
      password,
      ...(options?.reactivate ? { reactivate: true } : {}),
      ...(options?.latitude != null && options?.longitude != null
        ? { latitude: options.latitude, longitude: options.longitude }
        : {}),
      ...(options?.clientPublicIp ? { clientPublicIp: options.clientPublicIp } : {}),
    }),
  });
}

export async function login2faRequest(
  tempToken: string,
  totpCode: string,
  options?: { latitude?: number; longitude?: number; clientPublicIp?: string },
): Promise<LoginResponse> {
  return apiJson<LoginResponse>("/auth/login/2fa", {
    method: "POST",
    body: JSON.stringify({
      tempToken,
      totpCode,
      ...(options?.latitude != null && options?.longitude != null
        ? { latitude: options.latitude, longitude: options.longitude }
        : {}),
      ...(options?.clientPublicIp ? { clientPublicIp: options.clientPublicIp } : {}),
    }),
  });
}

export async function passwordChangeRequestOtp(): Promise<{ message: string }> {
  return apiJson<{ message: string }>("/auth/me/password-change/request-otp", {
    method: "POST",
    auth: true,
  });
}

export async function passwordChangeVerifyOtp(
  code: string,
): Promise<{ changeToken: string; expiresIn: string }> {
  return apiJson<{ changeToken: string; expiresIn: string }>("/auth/me/password-change/verify-otp", {
    method: "POST",
    body: JSON.stringify({ code }),
    auth: true,
  });
}

export async function passwordChangeComplete(
  changeToken: string,
  newPassword: string,
  confirmPassword: string,
): Promise<{ message: string }> {
  return apiJson<{ message: string }>("/auth/password-change/complete", {
    method: "POST",
    body: JSON.stringify({ changeToken, newPassword, confirmPassword }),
  });
}

export async function twoFactorRequestOtp(): Promise<{ message: string }> {
  return apiJson<{ message: string }>("/auth/me/2fa/request-otp", {
    method: "POST",
    auth: true,
  });
}

export async function twoFactorVerifyEmail(code: string): Promise<{
  otpauthUrl: string;
  qrDataUrl: string;
  manualSecret: string;
}> {
  return apiJson<{ otpauthUrl: string; qrDataUrl: string; manualSecret: string }>(
    "/auth/me/2fa/verify-email",
    {
      method: "POST",
      body: JSON.stringify({ code }),
      auth: true,
    },
  );
}

export async function twoFactorConfirmTotp(code: string): Promise<AuthUser> {
  return apiJson<AuthUser>("/auth/me/2fa/confirm", {
    method: "POST",
    body: JSON.stringify({ code }),
    auth: true,
  });
}

export async function twoFactorDisable(password?: string): Promise<AuthUser> {
  return apiJson<AuthUser>("/auth/me/2fa/disable", {
    method: "POST",
    body: JSON.stringify(password ? { password } : {}),
    auth: true,
  });
}

export async function oauthReactivateRequest(
  reactivationToken: string,
  options?: { clientPublicIp?: string },
): Promise<LoginResponse> {
  return apiJson<LoginResponse>("/auth/oauth/reactivate", {
    method: "POST",
    body: JSON.stringify({
      reactivationToken,
      ...(options?.clientPublicIp ? { clientPublicIp: options.clientPublicIp } : {}),
    }),
  });
}

/** `redirectUri` ex.: handoff HTTP ou syncyou://. `bridge` associa ao Socket.IO na app Tauri. */
export function oauthGoogleStartUrl(
  email?: string,
  redirectUri?: string,
  bridge?: string,
  clientPublicIp?: string,
): string {
  const u = new URL(`${base()}/auth/google`);
  if (email?.includes("@")) {
    u.searchParams.set("email", email.trim());
  }
  if (redirectUri) {
    u.searchParams.set("redirect_uri", redirectUri);
  }
  if (bridge?.trim()) {
    u.searchParams.set("bridge", bridge.trim());
  }
  if (clientPublicIp?.trim()) {
    u.searchParams.set("client_public_ip", clientPublicIp.trim());
  }
  return u.toString();
}

export function oauthMicrosoftStartUrl(
  email?: string,
  redirectUri?: string,
  bridge?: string,
  clientPublicIp?: string,
): string {
  const u = new URL(`${base()}/auth/microsoft`);
  if (email?.includes("@")) {
    u.searchParams.set("email", email.trim());
  }
  if (redirectUri) {
    u.searchParams.set("redirect_uri", redirectUri);
  }
  if (bridge?.trim()) {
    u.searchParams.set("bridge", bridge.trim());
  }
  if (clientPublicIp?.trim()) {
    u.searchParams.set("client_public_ip", clientPublicIp.trim());
  }
  return u.toString();
}

export async function oauthCompleteRequest(
  signupToken: string,
  options?: { clientPublicIp?: string },
): Promise<LoginResponse> {
  return apiJson<LoginResponse>("/auth/oauth/complete", {
    method: "POST",
    body: JSON.stringify({
      signupToken,
      ...(options?.clientPublicIp ? { clientPublicIp: options.clientPublicIp } : {}),
    }),
  });
}

export async function meRequest(): Promise<AuthUser> {
  return apiJson<AuthUser>("/auth/me", {
    method: "GET",
    auth: true,
  });
}

export type SessionListItem = {
  id: string;
  createdAt: string;
  expiresAt: string;
  active: boolean;
  current: boolean;
  ip: string;
  city: string | null;
  loginMethod: string;
  userAgent: string | null;
};

export type SessionsResponse = {
  sessions: SessionListItem[];
};

export async function listSessionsRequest(): Promise<SessionsResponse> {
  return apiJson<SessionsResponse>("/auth/me/sessions", {
    method: "GET",
    auth: true,
  });
}

export async function revokeSessionRequest(sessionId: string): Promise<{ wasCurrent: boolean }> {
  return apiJson<{ wasCurrent: boolean }>(
    `/auth/me/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      auth: true,
    },
  );
}

/** Atualiza a foto de perfil; resposta com o mesmo formato que `/auth/me`. */
export async function uploadAvatarRequest(file: File): Promise<AuthUser> {
  const fd = new FormData();
  fd.append("photo", file);
  return apiJson<AuthUser>("/auth/me/avatar", {
    method: "PATCH",
    body: fd,
    auth: true,
  });
}

export type UpdateProfileBody = {
  firstName?: string;
  lastName?: string;
  phoneWhatsapp?: string;
  socialDiscord?: string;
  socialLinkedin?: string;
  socialYoutube?: string;
  socialInstagram?: string;
  socialFacebook?: string;
  websiteUrl?: string;
};

export async function updateProfileRequest(body: UpdateProfileBody): Promise<AuthUser> {
  return apiJson<AuthUser>("/auth/me/profile", {
    method: "PATCH",
    body: JSON.stringify(body),
    auth: true,
  });
}

export async function updatePresenceRequest(status: PresenceStatus): Promise<AuthUser> {
  return apiJson<AuthUser>("/auth/me/presence", {
    method: "PATCH",
    body: JSON.stringify({ status }),
    auth: true,
  });
}

export async function deactivateAccountRequest(password?: string): Promise<{ message: string }> {
  return apiJson<{ message: string }>("/auth/me/deactivate", {
    method: "POST",
    body: JSON.stringify(password ? { password } : {}),
    auth: true,
  });
}

export async function deleteAccountRequest(
  confirmation: "EXCLUIR",
  password?: string,
): Promise<{ message: string }> {
  return apiJson<{ message: string }>("/auth/me/delete", {
    method: "POST",
    body: JSON.stringify({
      confirmation,
      ...(password ? { password } : {}),
    }),
    auth: true,
  });
}

export async function reactivateAccountRequest(
  email: string,
  password: string,
): Promise<{ message: string }> {
  return apiJson<{ message: string }>("/auth/reactivate", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export type RegisterResponse = {
  message: string;
  emailSent: boolean;
};

export async function registerRequest(form: FormData): Promise<RegisterResponse> {
  return apiJson<RegisterResponse>("/auth/register", {
    method: "POST",
    body: form,
  });
}

export type LegalDocumentPublic = {
  kind: "terms" | "privacy";
  title: string;
  content: string;
  versionLabel: string;
  publishedAt: string;
};

export type LegalBundle = {
  terms: LegalDocumentPublic;
  privacy: LegalDocumentPublic;
};

export async function fetchLegalBundle(): Promise<LegalBundle> {
  return apiJson<LegalBundle>("/legal");
}

export async function forgotPasswordRequest(email: string): Promise<{ message: string }> {
  return apiJson<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyOtpRequest(
  email: string,
  code: string,
): Promise<{ resetToken: string; expiresIn: string }> {
  return apiJson<{ resetToken: string; expiresIn: string }>("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export async function resetPasswordRequest(
  resetToken: string,
  newPassword: string,
): Promise<{ message: string }> {
  return apiJson<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ resetToken, newPassword }),
  });
}

/** --- Contatos / amizades --- */

export type ContactPeer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  phoneWhatsapp: string | null;
  socialDiscord: string | null;
  socialLinkedin: string | null;
  socialYoutube: string | null;
  socialInstagram: string | null;
  socialFacebook: string | null;
  websiteUrl: string | null;
  presenceStatus: PresenceStatus;
};

export type ContactFriendRow = {
  friendshipId: string;
  peer: ContactPeer;
  friendsSince: string;
};

export type ContactRequestRow = {
  friendshipId: string;
  peer: ContactPeer;
  direction: "incoming" | "outgoing";
  createdAt: string;
};

export type ContactBlockedRow = {
  friendshipId: string;
  peer: ContactPeer;
  blockedAt: string;
};

export async function listContactsFriends(): Promise<{ friends: ContactFriendRow[] }> {
  return apiJson<{ friends: ContactFriendRow[] }>("/contacts/friends", {
    method: "GET",
    auth: true,
  });
}

/** Perfil público do amigo (telefone, redes) — dados actuais na API. */
export async function getContactPeerProfileRequest(peerUserId: string): Promise<{ peer: ContactPeer }> {
  return apiJson<{ peer: ContactPeer }>(
    `/contacts/peers/${encodeURIComponent(peerUserId)}/profile`,
    { method: "GET", auth: true },
  );
}

export async function listContactsRequests(): Promise<{
  incoming: ContactRequestRow[];
  outgoing: ContactRequestRow[];
}> {
  return apiJson<{ incoming: ContactRequestRow[]; outgoing: ContactRequestRow[] }>(
    "/contacts/requests",
    { method: "GET", auth: true },
  );
}

export async function listContactsBlocked(): Promise<{ blocked: ContactBlockedRow[] }> {
  return apiJson<{ blocked: ContactBlockedRow[] }>("/contacts/blocked", {
    method: "GET",
    auth: true,
  });
}

export type InviteContactResponse = {
  friendshipId: string;
  status: "pending" | "accepted" | "incoming_pending";
  peer: ContactPeer;
  message?: string;
};

export async function inviteContactByEmail(email: string): Promise<InviteContactResponse> {
  return apiJson<InviteContactResponse>("/contacts/invite", {
    method: "POST",
    body: JSON.stringify({ email }),
    auth: true,
  });
}

/** Pedido de amizade por ID (ex.: menção em grupo). */
export async function inviteContactByUserId(peerUserId: string): Promise<InviteContactResponse> {
  return apiJson<InviteContactResponse>("/contacts/invite/user", {
    method: "POST",
    body: JSON.stringify({ peerUserId }),
    auth: true,
  });
}

export async function acceptContactRequest(friendshipId: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/contacts/requests/${encodeURIComponent(friendshipId)}/accept`, {
    method: "POST",
    auth: true,
  });
}

export async function rejectContactRequest(friendshipId: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/contacts/requests/${encodeURIComponent(friendshipId)}/reject`, {
    method: "POST",
    auth: true,
  });
}

export async function cancelContactRequest(friendshipId: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/contacts/requests/${encodeURIComponent(friendshipId)}`, {
    method: "DELETE",
    auth: true,
  });
}

export async function blockContactPeer(peerUserId: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(
    `/contacts/peers/${encodeURIComponent(peerUserId)}/block`,
    { method: "POST", auth: true },
  );
}

export async function unblockContactPeer(peerUserId: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(
    `/contacts/peers/${encodeURIComponent(peerUserId)}/unblock`,
    { method: "POST", auth: true },
  );
}

/** --- Chat / conversas --- */

export type ChatConversationListItemDirect = {
  id: string;
  kind: "direct";
  peerUserId: string;
  peerName: string;
  peerAvatarUrl: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastMessageType: string;
  unreadCount: number;
  favorite: boolean;
  muted: boolean;
  /** Amizade em bloqueio: ninguém pode enviar mensagens. */
  friendshipBlocked: boolean;
  /** Se bloqueado: `true` se quem bloqueou foi o utilizador actual. */
  blockedByMe: boolean;
};

export type ChatConversationListItemGroup = {
  id: string;
  kind: "group";
  groupSubtype?: "channel" | "call" | null;
  title: string;
  description: string | null;
  avatarUrl: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastMessageType: string;
  /** Nome para «Nome: mensagem» na lista (ex. «Você» se foi o utilizador). */
  lastMessageSenderName?: string | null;
  unreadCount: number;
  favorite: boolean;
  muted: boolean;
  /** Mensagem não lida menciona o utilizador. */
  hasUnreadMention?: boolean;
  /** Id da mensagem a saltar (menção não lida mais recente). */
  unreadMentionMessageId?: string | null;
};

export type ChatConversationListItem =
  | ChatConversationListItemDirect
  | ChatConversationListItemGroup;

export type CallLogListItem = {
  id: string;
  callType: "direct" | "group";
  conversationId: string;
  conversationKind: "direct" | "group";
  conversationGroupSubtype?: "channel" | "call" | null;
  title: string;
  avatarUrl: string | null;
  peerUserId?: string | null;
  status: "ringing" | "ongoing" | "missed" | "completed";
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  missedAt: string | null;
  durationSeconds: number | null;
};

export function chatConversationTitle(row: ChatConversationListItem): string {
  return row.kind === "direct" ? row.peerName : row.title;
}

export type ChatMessageApi = {
  id: string;
  conversationId: string;
  senderId: string;
  sentAt: string;
  kind: string;
  text: string | null;
  payload: Record<string, unknown> | null;
  /** Apagada para todos (placeholder no destinatário). */
  deletedForEveryone?: boolean;
  /** Grupo: dados do remetente (histórico / tempo real). */
  senderName?: string | null;
  senderAvatarUrl?: string | null;
};

export async function ensureDirectConversationRequest(peerUserId: string): Promise<{
  conversationId: string;
  peer: { id: string; firstName: string; lastName: string; avatarUrl: string | null };
}> {
  return apiJson(`/chat/conversations/direct`, {
    method: "POST",
    body: JSON.stringify({ peerUserId }),
    auth: true,
  });
}

export async function listChatConversationsRequest(options?: {
  /** Largura da janela em dias (por defeito 7: hoje + 6 dias anteriores). */
  days?: number;
  /** ISO: extremo superior exclusivo da janela seguinte (resposta anterior `nextCursorEnd`). */
  cursorEnd?: string | null;
}): Promise<{
  conversations: ChatConversationListItem[];
  nextCursorEnd: string | null;
  hasMore: boolean;
}> {
  const params = new URLSearchParams();
  if (options?.days != null) params.set("days", String(options.days));
  if (options?.cursorEnd) params.set("cursorEnd", options.cursorEnd);
  const q = params.toString();
  return apiJson(`/chat/conversations${q ? `?${q}` : ""}`, { method: "GET", auth: true });
}

export async function listCallLogsRequest(): Promise<{
  calls: CallLogListItem[];
}> {
  return apiJson("/chat/calls/logs", { method: "GET", auth: true });
}

export type GroupMemberApiRow = {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  role: "admin" | "moderator" | "member";
  joinedAt: string;
  callStatus?: "active" | "left" | "invited" | "participated" | "missed";
};

export async function listGroupMembersRequest(conversationId: string): Promise<{
  members: GroupMemberApiRow[];
}> {
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/members`, {
    method: "GET",
    auth: true,
  });
}

export type ConversationMediaPageItem =
  | {
      kind: "image";
      id: string;
      messageId: string;
      sentAt: string;
      path: string;
      title: string | null;
    }
  | {
      kind: "video";
      id: string;
      messageId: string;
      sentAt: string;
      path: string;
      posterPath: string | null;
      title: string | null;
    }
  | {
      kind: "document";
      id: string;
      messageId: string;
      sentAt: string;
      path: string;
      fileName: string;
    }
  | {
      kind: "audio";
      id: string;
      messageId: string;
      sentAt: string;
      path: string;
      title: string | null;
    };

export async function listConversationMediaPageRequest(
  conversationId: string,
  options: {
    tab: "fotos-videos" | "arquivos-audios";
    limit?: number;
    cursorSentAt?: string;
    cursorMessageId?: string;
  },
): Promise<{
  items: ConversationMediaPageItem[];
  nextCursor: { sentAt: string; messageId: string } | null;
  hasMore: boolean;
}> {
  const params = new URLSearchParams();
  params.set("tab", options.tab);
  if (options.limit != null) params.set("limit", String(options.limit));
  if (options.cursorSentAt) params.set("cursorSentAt", options.cursorSentAt);
  if (options.cursorMessageId) params.set("cursorMessageId", options.cursorMessageId);
  const q = params.toString();
  return apiJson(
    `/chat/conversations/${encodeURIComponent(conversationId)}/media?${q}`,
    { method: "GET", auth: true },
  );
}

export async function createGroupConversationRequest(params: {
  name: string;
  description?: string;
  memberUserIds: string[];
  avatar?: File | null;
}): Promise<{
  conversationId: string;
  title: string;
  description: string | null;
  avatarUrl: string | null;
}> {
  const fd = new FormData();
  fd.append("name", params.name.trim());
  if (params.description?.trim()) {
    fd.append("description", params.description.trim());
  }
  fd.append("memberUserIds", JSON.stringify(params.memberUserIds));
  if (params.avatar) {
    fd.append("avatar", params.avatar);
  }
  return apiJson("/chat/conversations/group", {
    method: "POST",
    body: fd,
    auth: true,
  });
}

export async function getChatMessagesRequest(conversationId: string): Promise<{
  messages: ChatMessageApi[];
  peerLastReadAt: string | null;
}> {
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "GET",
    auth: true,
  });
}

export async function markChatConversationReadRequest(
  conversationId: string,
): Promise<{ lastReadAt: string }> {
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: "POST",
    auth: true,
  });
}

/** Notifica o outro participante (Socket.IO `incoming_call`) e deve ser seguido de abrir a janela de discagem no cliente. */
export async function voiceCallInviteRequest(conversationId: string): Promise<{ ok: boolean }> {
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/voice-call-invite`, {
    method: "POST",
    auth: true,
  });
}

export async function createGroupCallRequest(params: {
  sourceConversationId: string;
  inviteeUserIds: string[];
}): Promise<{
  ok: true;
  conversationId: string;
  title: string;
  avatarUrl: string | null;
}> {
  return apiJson("/chat/calls/group", {
    method: "POST",
    body: JSON.stringify(params),
    auth: true,
  });
}

export async function inviteParticipantsToGroupCallRequest(
  conversationId: string,
  inviteeUserIds: string[],
): Promise<{ ok: true }> {
  return apiJson(`/chat/calls/group/${encodeURIComponent(conversationId)}/invite`, {
    method: "POST",
    body: JSON.stringify({ inviteeUserIds }),
    auth: true,
  });
}

/** Cancelar (quem liga), recusar (quem recebe) ou timeout — notifica o outro participante (`voice_call_ring_ended`). */
export async function voiceCallEndRingRequest(conversationId: string): Promise<{ ok: boolean }> {
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/voice-call-end-ring`, {
    method: "POST",
    auth: true,
  });
}

/** Quem recebe atende: o servidor notifica quem ligou (`voice_call_answered`) para abrir a tela de ligação. */
export async function voiceCallAnswerRequest(conversationId: string): Promise<{ ok: boolean }> {
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/voice-call-answer`, {
    method: "POST",
    auth: true,
  });
}

/** Um dos dois encerra a sessão de chamada na app principal (`voice_call_session_ended`). */
export async function voiceCallEndSessionRequest(conversationId: string): Promise<{ ok: boolean }> {
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/voice-call-end-session`, {
    method: "POST",
    auth: true,
  });
}

export async function patchChatConversationPreferencesRequest(
  conversationId: string,
  body: { favorite?: boolean; muted?: boolean },
): Promise<{ favorite: boolean; muted: boolean }> {
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/preferences`, {
    method: "PATCH",
    body: JSON.stringify(body),
    auth: true,
  });
}

export type ChatAttachmentUploadResult = {
  path: string;
  fileName: string;
  mimeType: string;
  size: number;
  /** JPEG gerado no servidor (frame ~ao meio do vídeo). */
  posterPath?: string;
};

/** Imagem → WebP figurinha (servidor usa wa-sticker-formatter). */
export async function uploadChatStickerFromImageRequest(
  conversationId: string,
  file: File | Blob,
  fileName = "image.png",
): Promise<ChatAttachmentUploadResult> {
  const fd = new FormData();
  const blob = file instanceof File ? file : file;
  fd.append("file", blob, file instanceof File ? file.name : fileName);
  return apiJson<ChatAttachmentUploadResult>(
    `/chat/conversations/${encodeURIComponent(conversationId)}/sticker-from-image`,
    {
      method: "POST",
      body: fd,
      auth: true,
    },
  );
}

/** Imagem → servidor remove fundo (@imgly/background-removal-node) → PNG com alpha. */
export async function removeStickerBackgroundRequest(
  conversationId: string,
  file: File,
): Promise<Blob> {
  if (typeof window !== "undefined") {
    const fresh = await ensureAccessTokenFresh();
    if (!fresh) {
      throw new ApiError("Sessão expirada. Entre novamente.", 401);
    }
  }
  const fd = new FormData();
  fd.append("file", file, file.name);
  const headers = new Headers();
  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("syncyou_access_token");
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  const res = await fetch(
    `${base()}/chat/conversations/${encodeURIComponent(conversationId)}/sticker-remove-background`,
    {
      method: "POST",
      body: fd,
      headers,
    },
  );
  if (!res.ok) {
    const text = await res.text();
    let msg = "Pedido falhou";
    try {
      const err = JSON.parse(text) as ApiErrorBody;
      msg = parseMessage(err);
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new ApiError(msg, res.status);
  }
  return res.blob();
}

export async function uploadChatAttachmentRequest(
  conversationId: string,
  file: File | Blob,
  fileName = "file",
  videoTrim?: { trimStartSec: number; trimEndSec: number },
): Promise<ChatAttachmentUploadResult> {
  const fd = new FormData();
  const blob = file instanceof File ? file : file;
  fd.append("file", blob, file instanceof File ? file.name : fileName);
  if (videoTrim) {
    fd.append("videoTrimStartSec", String(videoTrim.trimStartSec));
    fd.append("videoTrimEndSec", String(videoTrim.trimEndSec));
  }
  return apiJson<ChatAttachmentUploadResult>(`/chat/conversations/${encodeURIComponent(conversationId)}/attachments`, {
    method: "POST",
    body: fd,
    auth: true,
  });
}

/** Upload com progresso (XHR); útil para vídeos grandes. */
export function uploadChatAttachmentRequestWithProgress(
  conversationId: string,
  file: File | Blob,
  fileName: string,
  options: {
    videoTrim?: { trimStartSec: number; trimEndSec: number };
    /** 0–100 só do envio em bytes; na UI convém mapear para <100 até o servidor responder. */
    onUploadProgress?: (percent: number) => void;
  } = {},
): Promise<ChatAttachmentUploadResult> {
  const { videoTrim, onUploadProgress } = options;
  return (async () => {
    if (typeof window !== "undefined") {
      const fresh = await ensureAccessTokenFresh();
      if (!fresh) {
        throw new ApiError("Sessão expirada. Entre novamente.", 401);
      }
    }
    return new Promise<ChatAttachmentUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    const blob = file instanceof File ? file : file;
    fd.append("file", blob, file instanceof File ? file.name : fileName);
    if (videoTrim) {
      fd.append("videoTrimStartSec", String(videoTrim.trimStartSec));
      fd.append("videoTrimEndSec", String(videoTrim.trimEndSec));
    }
    const path = `/chat/conversations/${encodeURIComponent(conversationId)}/attachments`;
    xhr.open("POST", `${base()}${path}`);
    xhr.responseType = "json";
    if (typeof window !== "undefined") {
      const token = window.localStorage.getItem("syncyou_access_token");
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onUploadProgress) {
        onUploadProgress(Math.min(100, Math.round((100 * e.loaded) / e.total)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as ChatAttachmentUploadResult);
        return;
      }
      const raw = xhr.response as ApiErrorBody | undefined;
      const msg = raw ? parseMessage(raw) : "Pedido falhou";
      reject(new ApiError(msg, xhr.status, raw?.code, raw?.email, raw?.tempToken));
    };
    xhr.onerror = () => reject(new ApiError("Falha de rede", 0));
    xhr.send(fd);
  });
  })();
}

export async function sendChatMessageRequest(
  conversationId: string,
  body: { kind?: string; text?: string; payload?: Record<string, unknown> },
): Promise<{ message: ChatMessageApi; deliveredToPeer: boolean }> {
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
    auth: true,
  });
}

export async function clearChatConversationForMeRequest(
  conversationId: string,
): Promise<{ ok: boolean }> {
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/clear-for-me`, {
    method: "POST",
    auth: true,
  });
}

export async function leaveGroupConversationRequest(
  conversationId: string,
): Promise<{ ok: boolean }> {
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/leave-group`, {
    method: "POST",
    auth: true,
  });
}

export async function patchGroupDetailsRequest(
  conversationId: string,
  body: { name?: string; description?: string | null },
): Promise<{ title: string; description: string | null }> {
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/group`, {
    method: "PATCH",
    body: JSON.stringify(body),
    auth: true,
  });
}

export async function uploadGroupAvatarRequest(
  conversationId: string,
  file: File,
): Promise<{ avatarUrl: string | null }> {
  const fd = new FormData();
  fd.append("avatar", file);
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/group/avatar`, {
    method: "POST",
    body: fd,
    auth: true,
  });
}

export async function addGroupMembersRequest(
  conversationId: string,
  memberUserIds: string[],
): Promise<{ ok: boolean }> {
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/members`, {
    method: "POST",
    body: JSON.stringify({ memberUserIds }),
    auth: true,
  });
}

export async function removeGroupMemberRequest(
  conversationId: string,
  userId: string,
): Promise<{ ok: boolean }> {
  return apiJson(
    `/chat/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE", auth: true },
  );
}

export async function setGroupMemberRoleRequest(
  conversationId: string,
  userId: string,
  role: "moderator" | "member",
): Promise<{ ok: boolean }> {
  return apiJson(
    `/chat/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}/role`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
      auth: true,
    },
  );
}

export async function deleteGroupConversationRequest(
  conversationId: string,
): Promise<{ ok: boolean }> {
  return apiJson(`/chat/conversations/${encodeURIComponent(conversationId)}/group`, {
    method: "DELETE",
    auth: true,
  });
}

export async function deleteChatMessageForEveryoneRequest(
  conversationId: string,
  messageId: string,
): Promise<{ ok: boolean }> {
  return apiJson(
    `/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "DELETE",
      auth: true,
    },
  );
}

/** --- Notificações --- */

export type AppNotificationActor = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

export type AppNotificationItem =
  | {
      id: string;
      kind: "friend_request";
      read: boolean;
      createdAt: string;
      title: string;
      body: string;
      data: {
        friendshipId: string;
        actor: AppNotificationActor;
      };
    }
  | {
      id: string;
      kind: "chat_message";
      read: boolean;
      createdAt: string;
      title: string;
      body: string;
      data: {
        conversationId: string;
        /** Última mensagem (mais recente) neste acumulado. */
        lastMessageId: string;
        unreadCount: number;
        actor: AppNotificationActor;
        preview: string;
        /** Legado. */
        messageId?: string;
      };
    };

export async function listNotificationsRequest(): Promise<{
  items: AppNotificationItem[];
  unreadCount: number;
}> {
  return apiJson<{ items: AppNotificationItem[]; unreadCount: number }>("/notifications", {
    method: "GET",
    auth: true,
  });
}

/** Preview de link (Open Graph) via API — necessário com `output: export` no Next. */
export async function fetchLinkPreviewRequest(
  url: string,
): Promise<Record<string, unknown> | null> {
  return apiJson<Record<string, unknown> | null>(
    `/link-preview?url=${encodeURIComponent(url)}`,
    { method: "GET", auth: true },
  );
}

export async function markNotificationRead(id: string): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>(`/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
    auth: true,
  });
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean }> {
  return apiJson<{ ok: boolean }>("/notifications/read-all", {
    method: "POST",
    auth: true,
  });
}
