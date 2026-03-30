"use client";

import {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  FormEvent,
  SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save } from "@tauri-apps/plugin-dialog";
import {
  AtSign,
  BookUser,
  Camera,
  Eye,
  EyeOff,
  Download,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Lock,
  LockOpen,
  Mail,
  MessageSquare,
  Mic,
  MonitorUp,
  Paperclip,
  Pause,
  Headphones,
  PhoneCall,
  PhoneOff,
  Play,
  Search,
  SendHorizonal,
  Settings,
  Smile,
  Square,
  Star,
  StarOff,
  UserPlus,
  X,
} from "lucide-react";
import { FaGoogle, FaMicrosoft } from "react-icons/fa";
import { type Area } from "react-easy-crop";
import * as Tooltip from "@radix-ui/react-tooltip";
import { emptyOtp6, Otp6Input } from "@/components/otp-6-input";
import { PhotoCropModal } from "@/components/photo-crop-modal";
import { WindowTitleBar } from "@/components/window-title-bar";
import { NotificationAlert } from "@/components/ui/notification-alert";
import {
  MessagesSidebarContent,
  type SelectedConversation,
} from "@/components/platform/messages-sidebar-content";
import { SettingsSidebarContent } from "@/components/platform/settings-sidebar-content";
import { AccountSettingsPanel } from "@/components/platform/account-settings-panel";
import { SecuritySettingsPanel } from "@/components/platform/security-settings-panel";
import { SessionsSettingsPanel } from "@/components/platform/sessions-settings-panel";
import { ContactsMainPanel } from "@/components/platform/contacts-main-panel";
import {
  ContactsSidebarContent,
  type ContactsSectionId,
} from "@/components/platform/contacts-sidebar-content";
import { NotificationsDropdown } from "@/components/platform/notifications-dropdown";
import { PresenceStatusSelect } from "@/components/presence-status-select";
import { SettingsMainPanel } from "@/components/platform/settings-main-panel";
import type { SettingsSectionId } from "@/components/platform/settings-types";
import {
  MessageAttachmentMenu,
  type AttachmentMenuOption,
} from "@/components/platform/message-attachment-menu";
import { MediaAttachmentPreview } from "@/components/platform/media-attachment-preview";
import { DocumentAttachmentPreview, isPdfAttachment } from "@/components/platform/document-attachment-preview";
import { ContactShareAttachment } from "@/components/platform/contact-share-attachment";
import type { ShareableContact } from "@/data/shareable-contacts";
import { MOCK_SHAREABLE_CONTACTS } from "@/data/shareable-contacts";
import { PeerPresenceDot } from "@/components/peer-presence-dot";
import { ConversationMessageList } from "@/components/platform/conversation-message-list";
import {
  ChatCommandPalette,
  type ChatCommandPaletteAction,
} from "@/components/platform/chat-command-palette";
import { ConversationGalleryModal } from "@/components/platform/conversation-gallery-modal";
import { ForwardMessageModal } from "@/components/platform/forward-message-modal";
import { ConversationSearchModal } from "@/components/platform/conversation-search-modal";
import { ConversationInfoModal } from "@/components/platform/conversation-info-modal";
import type { ConversationPickerItem } from "@/data/conversation-picker-options";
import { CONVERSATION_PICKER_OPTIONS } from "@/data/conversation-picker-options";
import type { ChatMessage } from "@/data/mock-conversation-messages";
import {
  createForwardedChatMessage,
  getMessageSnippet,
  getMockConversationMessages,
} from "@/data/mock-conversation-messages";
import { GroupMentionPopover } from "@/components/platform/group-mention-popover";
import type { GroupMentionMember } from "@/components/platform/group-mention-types";
import type { GroupMentionHandlers } from "@/components/platform/message-text";
import { MessageEmojiPicker } from "@/components/platform/message-emoji-picker";
import { useDirectVoiceCallAudio } from "@/hooks/use-direct-voice-call-audio";
import { useGroupCallMedia } from "@/hooks/use-group-call-media";
import { formatVoiceDuration, useVoiceRecorder, WAVE_DISPLAY_BARS } from "@/hooks/use-voice-recorder";
import {
  ActiveCallMinimizedBar,
  ActiveCallOverlay,
} from "@/components/platform/active-call-overlay";
import { CallCameraControl } from "@/components/platform/call-camera-control";
import { CallMicControl } from "@/components/platform/call-mic-control";
import { AddCallParticipantsModal } from "@/components/platform/add-call-participants-modal";
import type {
  CallAnsweredPayload,
  CallConferenceParticipantsPayload,
  CallRoomParticipant,
  GroupAudioRoomParticipantsPayload,
} from "@/lib/call-events";
import { CALL_ANSWERED_EVENT, CALL_BROADCAST_CHANNEL } from "@/lib/call-events";
import { openCallWindow, openIncomingCallWindow } from "@/lib/open-call-window";
import { isTauri } from "@tauri-apps/api/core";
import { AUTH_LOGOUT_REQUIRED_EVENT, clearTokens, saveTokens } from "@/lib/auth-tokens";
import { addStickerCreated, addStickerFavorite } from "@/lib/sticker-local-storage";
import { rasterizeStickerWithCaption } from "@/lib/sticker-rasterize";
import {
  GROUP_ALL_MENTION_USER_ID,
  prettifyCanonicalMentionsInDraft,
  prettifyCanonicalMentionsInDraftAtCursor,
  serializeGroupMentionsForApi,
} from "@/lib/group-mention";
import {
  bindSessionSocket,
  emitCallConferenceJoin,
  emitCallConferenceLeave,
  emitChatFocus,
  emitGroupAudioRoomJoin,
  emitGroupAudioRoomLeave,
  emitVoiceCallCameraOff,
  emitVoiceCallMicMuted,
  type VoiceCallCameraOffPayload,
  type VoiceCallMicMutedPayload,
  type VoiceCallVoiceActivityPayload,
  type VoiceCallWebRtcSignalPayload,
  type MediasoupNewProducerPayload,
} from "@/lib/session-socket";
import { isConversationMutedForNotifications } from "@/lib/chat-muted";
import { outboxAdd, outboxRead, outboxRemove } from "@/lib/chat-offline-outbox";
import { getFeatureFlag } from "@/lib/feature-flags";
import { playNotificationChime } from "@/lib/play-notification-sound";
import { showNativeNotification } from "@/lib/tauri-native-notification";
import {
  ApiError,
  type AppNotificationItem,
  type AuthUser,
  type ChatConversationListItem,
  chatConversationTitle,
  type ChatMessageApi,
  type CallLogListItem,
  type ContactFriendRow,
  type ContactPeer,
  type PresenceStatus,
  apiOrigin,
  blockContactPeer,
  createGroupCallRequest,
  ensureDirectConversationRequest,
  fetchLegalBundle,
  forgotPasswordRequest,
  deleteChatMessageForEveryoneRequest,
  getChatMessagesRequest,
  listGroupMembersRequest,
  listChatConversationsRequest,
  markChatConversationReadRequest,
  patchChatConversationPreferencesRequest,
  inviteContactByUserId,
  inviteParticipantsToGroupCallRequest,
  listContactsBlocked,
  listCallLogsRequest,
  listContactsFriends,
  listContactsRequests,
  listNotificationsRequest,
  login2faRequest,
  loginRequest,
  type LoginResponse,
  markAllNotificationsRead,
  markNotificationRead,
  meRequest,
  oauthReactivateRequest,
  updatePresenceRequest,
  registerRequest,
  resetPasswordRequest,
  sendChatMessageRequest,
  type ChatAttachmentUploadResult,
  uploadAvatarRequest,
  uploadChatAttachmentRequest,
  uploadChatAttachmentRequestWithProgress,
  uploadChatStickerFromImageRequest,
  removeStickerBackgroundRequest,
  unblockContactPeer,
  verifyOtpRequest,
  voiceCallEndSessionRequest,
  voiceCallInviteRequest,
  type LegalBundle,
} from "@/lib/api";
import {
  applyOutgoingReceipts,
  isChatApiConversationId,
  mapApiMessageToChatMessage,
  mergeServerMessagesWithPendingUploads,
} from "@/lib/chat-map";
import { buildForwardSendBody } from "@/lib/forward-chat-message";
import { bustAvatarCache } from "@/lib/avatar-url";
import { getAccessToken } from "@/lib/auth-tokens";
import { oauthNavigateOrOpen } from "@/lib/oauth-open";
import {
  fetchPublicIp,
  getCachedClientGeo,
  getCachedPublicIp,
  getClientGeo,
  primeClientGeo,
} from "@/lib/client-geo";

type Theme = "light" | "dark";
type AuthView = "splash" | "login" | "register" | "forgot" | "platform";
type ForgotStep = "email" | "otp" | "reset";
type PlatformMenu = "messages" | "contacts" | "settings";
type GroupMemberRow = {
  id: string;
  name: string;
  email?: string;
  role: string;
  avatarUrl?: string | null;
  callStatus?: "active" | "left" | "invited" | "participated" | "missed";
};

type GroupMembersMap = Record<string, GroupMemberRow[]>;

const MOCK_GROUP_MEMBERS_MAP: GroupMembersMap = {
  "c-1": [
    { id: "m-1", name: "Carlos Mendes", role: "admin" },
    { id: "m-2", name: "Ana Ribeiro", role: "member" },
    { id: "m-3", name: "Lucas Souza", role: "member" },
    { id: "m-4", name: "Fernanda Lima", role: "member" },
  ],
  "c-5": [
    { id: "m-5", name: "Julia Alves", role: "admin" },
    { id: "m-6", name: "Bruno Costa", role: "member" },
    { id: "m-7", name: "Mariana Rocha", role: "member" },
  ],
};

/** Sessao ativa na UI (sempre com sala e participantes resolvidos). */
type ActiveCallSession = CallAnsweredPayload & {
  roomId: string;
  roomLayout: "p2p" | "conference";
  roomParticipants: CallRoomParticipant[];
  callSessionType: "direct" | "group_room" | "group_call";
};

function buildActiveCallSession(
  p: CallAnsweredPayload,
): ActiveCallSession {
  const roomId = p.roomId ?? p.conversationId;
  const roomLayout =
    p.roomLayout ?? (p.conversationKind === "group" ? "conference" : "p2p");
  const callSessionType =
    p.callSessionType ??
    (p.conversationKind === "group"
      ? "group_room"
      : "direct");
  let roomParticipants: CallRoomParticipant[];
  if (p.roomParticipants && p.roomParticipants.length > 0) {
    roomParticipants = p.roomParticipants;
  } else if (p.conversationKind === "group") {
    roomParticipants = [{ id: "__you__", name: "Você", role: "Conectado", isYou: true }];
  } else {
    roomParticipants = [
      { id: "__you__", name: "Você", role: "Conectado", isYou: true },
      { id: p.conversationId, name: p.peerName, role: "Em chamada" },
    ];
  }
  return { ...p, roomId, roomLayout, roomParticipants, callSessionType };
}

const LOGIN_WINDOW = { width: 380, height: 640 };
const REGISTER_WINDOW = { width: 430, height: 720 };
const APP_MIN_WINDOW = { width: 980, height: 640 };
const SPLASH_DURATION_MS = 4000;

function formatTransferMb(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
const MESSAGE_INPUT_MAX_HEIGHT = 112;
const AUTO_CALL_PRESENCE_STORAGE_KEY = "incall_auto_call_presence_before";

function authorLabelForReply(msg: ChatMessage, conv: SelectedConversation): string {
  if (msg.outgoing) return "Você";
  if (conv.kind === "group") return msg.senderName?.trim() || conv.name;
  return conv.name;
}

function readStoredAutoCallPresence(): PresenceStatus | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(AUTO_CALL_PRESENCE_STORAGE_KEY);
  return raw === "online" || raw === "away" || raw === "busy" || raw === "invisible"
    || raw === "on_call"
    ? raw
    : null;
}

function writeStoredAutoCallPresence(status: PresenceStatus | null): void {
  if (typeof window === "undefined") return;
  if (status == null) {
    window.localStorage.removeItem(AUTO_CALL_PRESENCE_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(AUTO_CALL_PRESENCE_STORAGE_KEY, status);
}

function normalizeMentionSearch(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

const ATTACH_IMAGE_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i;
const ATTACH_VIDEO_EXT = /\.(mp4|webm|mov|mkv|avi|m4v|ogv|3gp)$/i;
const ATTACH_AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|opus|flac|m4b|oga|wma)$/i;

function validateAttachmentForSlot(
  file: File,
  slot: "image" | "video" | "audio",
): { ok: true } | { ok: false; message: string } {
  const t = file.type.toLowerCase();
  if (slot === "image") {
    if (t.startsWith("video/")) {
      return {
        ok: false,
        message: "Este fluxo e so para imagem. Selecione um arquivo de imagem, nao video.",
      };
    }
    if (t.startsWith("audio/")) {
      return {
        ok: false,
        message: "Este fluxo e so para imagem. Selecione um arquivo de imagem, nao audio.",
      };
    }
    if (t.startsWith("image/")) return { ok: true };
    if (!t && ATTACH_IMAGE_EXT.test(file.name)) return { ok: true };
    return {
      ok: false,
      message:
        "Selecione apenas imagem (JPG, PNG, WebP, GIF, etc.). Outros tipos de arquivo nao sao aceitos aqui.",
    };
  }
  if (slot === "video") {
    if (t.startsWith("image/")) {
      return {
        ok: false,
        message: "Este fluxo e so para video. Selecione um arquivo de video, nao imagem.",
      };
    }
    if (t.startsWith("audio/")) {
      return {
        ok: false,
        message: "Este fluxo e so para video. Para audio use a opcao Audio no menu de anexos.",
      };
    }
    if (t.startsWith("video/")) return { ok: true };
    if (!t && ATTACH_VIDEO_EXT.test(file.name)) return { ok: true };
    return {
      ok: false,
      message:
        "Selecione apenas video (MP4, WebM, MOV, etc.). Outros tipos de arquivo nao sao aceitos aqui.",
    };
  }
  if (t.startsWith("image/")) {
    return {
      ok: false,
      message: "Este fluxo e so para audio. Selecione um arquivo de audio, nao imagem.",
    };
  }
  if (t.startsWith("video/")) {
    return {
      ok: false,
      message: "Este fluxo e so para audio. Selecione um arquivo de audio, nao video.",
    };
  }
  if (t.startsWith("audio/")) return { ok: true };
  if (!t && ATTACH_AUDIO_EXT.test(file.name)) return { ok: true };
  return {
    ok: false,
    message:
      "Selecione apenas audio (MP3, M4A, WAV, OGG, etc.). Outros tipos de arquivo nao sao aceitos aqui.",
  };
}

function validateDocumentAttachment(
  file: File,
): { ok: true } | { ok: false; message: string } {
  const t = file.type.toLowerCase();
  if (t.startsWith("image/")) {
    return {
      ok: false,
      message: "Para imagens use a opcao Imagem no menu de anexos.",
    };
  }
  if (t.startsWith("video/")) {
    return {
      ok: false,
      message: "Para videos use a opcao Video no menu de anexos.",
    };
  }
  if (t.startsWith("audio/")) {
    return {
      ok: false,
      message: "Para audio use a opcao Audio no menu de anexos.",
    };
  }
  if (!t) {
    if (ATTACH_IMAGE_EXT.test(file.name)) {
      return { ok: false, message: "Para imagens use a opcao Imagem no menu de anexos." };
    }
    if (ATTACH_VIDEO_EXT.test(file.name)) {
      return { ok: false, message: "Para videos use a opcao Video no menu de anexos." };
    }
    if (ATTACH_AUDIO_EXT.test(file.name)) {
      return { ok: false, message: "Para audio use a opcao Audio no menu de anexos." };
    }
  }
  return { ok: true };
}

export default function Home() {
  const [authView, setAuthView] = useState<AuthView>("splash");
  const [showPassword, setShowPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [showForgotConfirmPassword, setShowForgotConfirmPassword] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [legalTab, setLegalTab] = useState<"termos" | "politica">("termos");
  const [registerPassword, setRegisterPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStep, setForgotStep] = useState<ForgotStep>("email");
  const [forgotOtpDigits, setForgotOtpDigits] = useState<string[]>(() => emptyOtp6());
  const [forgotPassword, setForgotPassword] = useState("");
  const [passwordResetJwt, setPasswordResetJwt] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isForgotSending, setIsForgotSending] = useState(false);
  const [isVerifyOtpLoading, setIsVerifyOtpLoading] = useState(false);
  const [isResetPasswordLoading, setIsResetPasswordLoading] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [showPhotoCropModal, setShowPhotoCropModal] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [photoCropPurpose, setPhotoCropPurpose] = useState<"register" | "settings">("register");
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [showAvatarSuccessAlert, setShowAvatarSuccessAlert] = useState(false);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);
  const [splashUpdaterPhase, setSplashUpdaterPhase] = useState<
    "idle" | "checking" | "downloading" | "installing"
  >("idle");
  const [splashUpdaterPercent, setSplashUpdaterPercent] = useState<number | null>(null);
  const [splashUpdaterBytes, setSplashUpdaterBytes] = useState(0);
  const [splashUpdaterVersion, setSplashUpdaterVersion] = useState<string | null>(null);

  const [isLoginLoading, setIsLoginLoading] = useState(false);
  const [isReactivateLoading, setIsReactivateLoading] = useState(false);
  const [reactivatePrompt, setReactivatePrompt] = useState<
    | null
    | { mode: "password"; email: string; password: string }
    | { mode: "oauth"; token: string }
  >(null);
  const [login2faPending, setLogin2faPending] = useState<{
    tempToken: string;
    geo: { latitude: number; longitude: number } | null;
  } | null>(null);
  const [login2faDigits, setLogin2faDigits] = useState<string[]>(() => emptyOtp6());
  const [isLogin2faLoading, setIsLogin2faLoading] = useState(false);
  const [showLoginSuccessAlert, setShowLoginSuccessAlert] = useState(false);
  const [isRegisterLoading, setIsRegisterLoading] = useState(false);
  const [showRegisterSuccessAlert, setShowRegisterSuccessAlert] = useState(false);
  const [registerSuccessMessage, setRegisterSuccessMessage] = useState(
    "Verifique o email para ativar a conta. Depois pode iniciar sessão.",
  );
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerEmailReadonly, setRegisterEmailReadonly] = useState(false);
  const [legalBundle, setLegalBundle] = useState<LegalBundle | null>(null);
  const [legalLoading, setLegalLoading] = useState(true);
  const [legalFetchFailed, setLegalFetchFailed] = useState(false);
  const [showDownloadSuccessAlert, setShowDownloadSuccessAlert] = useState(false);
  const [showDownloadErrorAlert, setShowDownloadErrorAlert] = useState(false);
  const [isDownloadingAsset, setIsDownloadingAsset] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [platformMenu, setPlatformMenu] = useState<PlatformMenu>("messages");
  const [contactsSection, setContactsSection] = useState<ContactsSectionId>("friends");
  const [contactsIncomingCount, setContactsIncomingCount] = useState(0);
  const [contactsBlockedCount, setContactsBlockedCount] = useState(0);
  const [contactsFriendsCount, setContactsFriendsCount] = useState(0);
  const [contactsRemoteRefreshKey, setContactsRemoteRefreshKey] = useState(0);
  const [peerPresenceLive, setPeerPresenceLive] = useState<Record<string, PresenceStatus>>({});
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);
  const [notificationsUnread, setNotificationsUnread] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  /** Incrementar ao abrir conversa pelo sino para forçar scroll à mensagem mais recente. */
  const [messagesScrollToBottomKey, setMessagesScrollToBottomKey] = useState(0);
  /** Carregamento inicial do histórico (API) sem cache — mostra skeleton e evita rolagem feia. */
  const [threadMessagesLoading, setThreadMessagesLoading] = useState(false);
  /** Conversa cujo scroll inicial já estabilizou e pode ser revelada sem “filme” de rolagem. */
  const [threadScrollReadyConversationId, setThreadScrollReadyConversationId] = useState<
    string | null
  >(null);
  const processedNotificationIdsRef = useRef(new Set<string>());
  const applyNotificationsReadForConversationRef = useRef<(conversationId: string) => void>(
    () => {},
  );
  const notificationHandlerRef = useRef<(n: AppNotificationItem) => void>(() => {});
  const [chatConversationList, setChatConversationList] = useState<ChatConversationListItem[]>([]);
  const [callLogs, setCallLogs] = useState<CallLogListItem[]>([]);
  const [chatListHasMore, setChatListHasMore] = useState(false);
  const [chatListLoadingMore, setChatListLoadingMore] = useState(false);
  /** Primeira carga da lista de conversas (sidebar). */
  const [chatListInitialLoading, setChatListInitialLoading] = useState(false);
  const [deleteUndo, setDeleteUndo] = useState<{
    message: ChatMessage;
    index: number;
    convId: string;
  } | null>(null);
  const chatListNextCursorRef = useRef<string | null>(null);
  const chatListHasMoreRef = useRef(false);
  const chatListLoadingMoreRef = useRef(false);
  const [chatFriendsRows, setChatFriendsRows] = useState<ContactFriendRow[]>([]);
  const chatConversationListRef = useRef<ChatConversationListItem[]>([]);
  /** Fonte rápida para som / notificação: sincronizado com a lista e actualizado de forma optimista ao mudar silenciar na API. */
  const conversationMutedByIdRef = useRef<Map<string, boolean>>(new Map());
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(null);
  const sessionUserRef = useRef<AuthUser | null>(null);
  sessionUserRef.current = sessionUser;
  chatConversationListRef.current = chatConversationList;
  const [userMeLoading, setUserMeLoading] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>("account");
  const [selectedConversation, setSelectedConversation] = useState<SelectedConversation | null>(
    null,
  );
  const selectedConversationRef = useRef<SelectedConversation | null>(null);
  selectedConversationRef.current = selectedConversation;
  /** Grupo: saltar à mensagem onde o utilizador foi mencionado (botão @). */
  const [mentionJump, setMentionJump] = useState<{
    conversationId: string;
    messageId: string;
  } | null>(null);
  const [mentionJumpRequestKey, setMentionJumpRequestKey] = useState(0);
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
  const [searchJump, setSearchJump] = useState<{
    messageId: string;
    requestKey: number;
  } | null>(null);
  /** Após saltar à menção (FAB), esconde o @ na lista para esse id de mensagem até haver menção nova. */
  const [suppressedMentionMessageByConvId, setSuppressedMentionMessageByConvId] = useState<
    Record<string, string>
  >({});

  const chatConversationListForSidebar = useMemo((): ChatConversationListItem[] => {
    return chatConversationList.map((row) => {
      if (row.kind !== "group") return row;
      const dismissed = suppressedMentionMessageByConvId[row.id];
      if (
        dismissed &&
        row.unreadMentionMessageId === dismissed &&
        row.hasUnreadMention
      ) {
        return { ...row, hasUnreadMention: false, unreadMentionMessageId: null };
      }
      return row;
    });
  }, [chatConversationList, suppressedMentionMessageByConvId]);

  useEffect(() => {
    const m = new Map<string, boolean>();
    for (const c of chatConversationList) {
      m.set(c.id, c.muted === true);
    }
    conversationMutedByIdRef.current = m;
  }, [chatConversationList]);

  const forwardPickerOptions: ConversationPickerItem[] = useMemo(() => {
    if (chatConversationList.length > 0) {
      return chatConversationList.map((c) =>
        c.kind === "direct"
          ? { id: c.id, name: c.peerName, kind: "direct" as const }
          : { id: c.id, name: c.title, kind: "group" as const },
      );
    }
    return CONVERSATION_PICKER_OPTIONS;
  }, [chatConversationList]);

  const applyChatConversationPreferencesLocal = useCallback(
    (conversationId: string, prefs: { muted?: boolean; favorite?: boolean }) => {
      if (prefs.muted !== undefined) {
        conversationMutedByIdRef.current.set(conversationId, prefs.muted);
      }
      setChatConversationList((prev) =>
        prev.map((c) => {
          if (c.id !== conversationId) return c;
          return {
            ...c,
            ...(prefs.favorite !== undefined ? { favorite: prefs.favorite } : {}),
            ...(prefs.muted !== undefined ? { muted: prefs.muted } : {}),
          };
        }),
      );
    },
    [],
  );

  const platformMenuRef = useRef<PlatformMenu>("messages");
  platformMenuRef.current = platformMenu;
  /** Janela em primeiro plano e não minimizada — usado para não tocar som se já estiver a ver o chat. */
  const appWindowHasAttentionRef = useRef(true);
  const syncWindowAttentionRef = useCallback(async () => {
    try {
      if (isTauri()) {
        const w = getCurrentWindow();
        const [minimized, focused] = await Promise.all([w.isMinimized(), w.isFocused()]);
        const visible = document.visibilityState === "visible";
        appWindowHasAttentionRef.current = !minimized && focused && visible;
      } else {
        appWindowHasAttentionRef.current =
          document.visibilityState === "visible" && document.hasFocus();
      }
    } catch {
      appWindowHasAttentionRef.current =
        document.visibilityState === "visible" && document.hasFocus();
    }
  }, []);
  const [showConversationInfoModal, setShowConversationInfoModal] = useState(false);
  const [draftByConversationId, setDraftByConversationId] = useState<Record<string, string>>({});
  const [pinnedConversationIds, setPinnedConversationIds] = useState<string[]>([]);
  const [mutedUntilByConversationId, setMutedUntilByConversationId] = useState<
    Record<string, number>
  >({});
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [conversationMessagesById, setConversationMessagesById] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [peerLastReadAtByConversationId, setPeerLastReadAtByConversationId] = useState<
    Record<string, string | null>
  >({});
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [messageInputExpanded, setMessageInputExpanded] = useState(false);
  const [attachmentTypeRejectMessage, setAttachmentTypeRejectMessage] = useState<string | null>(null);
  const [pendingMedia, setPendingMedia] = useState<{
    kind: "image" | "video" | "audio";
    file: File;
    objectUrl: string;
  } | null>(null);
  const [pendingDocument, setPendingDocument] = useState<{
    file: File;
    objectUrl: string | null;
  } | null>(null);
  const [mediaSentToast, setMediaSentToast] = useState(false);
  const [contactShareSentToast, setContactShareSentToast] = useState(false);
  const [voiceSentToast, setVoiceSentToast] = useState(false);
  const [forwardSentToast, setForwardSentToast] = useState(false);
  const [forwardToastDescription, setForwardToastDescription] = useState("");
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [forwardSource, setForwardSource] = useState<ChatMessage | null>(null);
  const [forwardSendError, setForwardSendError] = useState<string | null>(null);
  const [activeCallSession, setActiveCallSession] = useState<ActiveCallSession | null>(null);
  /** Com ligação ativa: minimiza o overlay e usa a thread + rodapé normais para o chat. */
  const [callMinimizedForChat, setCallMinimizedForChat] = useState(false);
  /** Mute real do microfone (WebRTC) em chamada directa 1:1. */
  const [callMicMuted, setCallMicMuted] = useState(false);
  /** Incrementa ao mudar o microfone no menu (substitui track na sessão WebRTC). */
  const [micDeviceEpoch, setMicDeviceEpoch] = useState(0);
  /** `true` = câmera desligada (sem captura); início de cada ligação desligado. */
  const [callCameraOff, setCallCameraOff] = useState(true);
  /** Tempo decorrido da ligação (UI do header da conversa). */
  const [callElapsedSec, setCallElapsedSec] = useState(0);
  /** Incrementa ao escolher outra câmera no menu (refresca captura WebRTC). */
  const [cameraDeviceEpoch, setCameraDeviceEpoch] = useState(0);
  /** VAD do outro lado: efeito na foto do contacto (não o teu microfone local). */
  const [peerRemoteSpeaking, setPeerRemoteSpeaking] = useState(false);
  /** O outro participante mutou o microfone (socket). */
  const [peerRemoteMicMuted, setPeerRemoteMicMuted] = useState(false);
  /** O outro participante desligou a câmera (socket — evita último frame congelado). */
  const [peerRemoteCameraOff, setPeerRemoteCameraOff] = useState(false);
  const [groupRemoteSpeakingByUserId, setGroupRemoteSpeakingByUserId] = useState<
    Record<string, boolean>
  >({});
  const [groupRemoteMicMutedByUserId, setGroupRemoteMicMutedByUserId] = useState<
    Record<string, boolean>
  >({});
  const [groupRemoteCameraOffByUserId, setGroupRemoteCameraOffByUserId] = useState<
    Record<string, boolean>
  >({});
  const activeCallSessionRef = useRef<ActiveCallSession | null>(null);
  const voiceWebRtcHandlerRef = useRef<(p: VoiceCallWebRtcSignalPayload) => void>(() => {});
  const voiceMediasoupProducerRef = useRef<(p: MediasoupNewProducerPayload) => void>(() => {});
  const voiceMediasoupProducerClosedRef = useRef<
    (p: import("@/lib/session-socket").MediasoupClosedProducerPayload) => void
  >(() => {});
  activeCallSessionRef.current = activeCallSession;
  useEffect(() => {
    if (!activeCallSession) {
      setCallElapsedSec(0);
      return;
    }
    setCallElapsedSec(0);
    const id = window.setInterval(() => setCallElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [activeCallSession]);
  const [addCallParticipantsOpen, setAddCallParticipantsOpen] = useState(false);
  const [contactShareAttachment, setContactShareAttachment] = useState<
    null | { step: "list" } | { step: "preview"; contact: ShareableContact }
  >(null);
  const imageAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const videoAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const audioAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const documentAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const voiceRecorder = useVoiceRecorder();
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewAudioTime, setPreviewAudioTime] = useState({ current: 0, duration: 0 });
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [conversationFlags, setConversationFlags] = useState<
    Record<string, { blocked: boolean; favorite: boolean }>
  >({});
  /** IDs de pares com pedido de amizade enviado por mim (sincronizado com /contacts/requests). */
  const [contactOutgoingRequestPeerIds, setContactOutgoingRequestPeerIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [friendRequestFeedback, setFriendRequestFeedback] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);
  const [voiceCallInviteError, setVoiceCallInviteError] = useState<string | null>(null);
  const [groupMembersByConversationId, setGroupMembersByConversationId] = useState<GroupMembersMap>(
    () => ({ ...MOCK_GROUP_MEMBERS_MAP }),
  );
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const splashTimerRef = useRef<number | null>(null);
  /** Evita múltiplos getCurrentPosition no mesmo ecrã; WebKit exige gesto do utilizador para o prompt. */
  const loginGeoPrimedRef = useRef(false);
  const [mentionMenu, setMentionMenu] = useState<{
    open: boolean;
    atIndex: number;
    query: string;
    highlightIndex: number;
  }>({ open: false, atIndex: 0, query: "", highlightIndex: 0 });

  const isDark = theme === "dark";
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  const messageDraft = selectedConversation
    ? draftByConversationId[selectedConversation.id] ?? ""
    : "";
  const setMessageDraft = useCallback(
    (value: string | ((prev: string) => string)) => {
      const id = selectedConversation?.id;
      if (!id) return;
      setDraftByConversationId((prev) => {
        const cur = prev[id] ?? "";
        const next = typeof value === "function" ? (value as (x: string) => string)(cur) : value;
        return { ...prev, [id]: next };
      });
    },
    [selectedConversation?.id],
  );

  const mutedUntilByConversationIdRef = useRef(mutedUntilByConversationId);
  mutedUntilByConversationIdRef.current = mutedUntilByConversationId;

  useEffect(() => {
    try {
      const t = window.localStorage.getItem("theme");
      if (t === "light" || t === "dark") setTheme(t);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const d = window.localStorage.getItem("incall-chat-drafts-v1");
      if (d) setDraftByConversationId(JSON.parse(d) as Record<string, string>);
      const p = window.localStorage.getItem("incall-pinned-conversations-v1");
      if (p) setPinnedConversationIds(JSON.parse(p) as string[]);
      const m = window.localStorage.getItem("incall-mute-until-v1");
      if (m) setMutedUntilByConversationId(JSON.parse(m) as Record<string, number>);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("incall-chat-drafts-v1", JSON.stringify(draftByConversationId));
    } catch {
      /* ignore */
    }
  }, [draftByConversationId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "incall-pinned-conversations-v1",
        JSON.stringify(pinnedConversationIds),
      );
    } catch {
      /* ignore */
    }
  }, [pinnedConversationIds]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "incall-mute-until-v1",
        JSON.stringify(mutedUntilByConversationId),
      );
    } catch {
      /* ignore */
    }
  }, [mutedUntilByConversationId]);

  /** Alinha tema/cor nativos da janela (Tauri) ao conteúdo — evita botões da barra invisíveis no Windows. */
  const syncTauriWindowChrome = async (dark: boolean) => {
    if (!isTauri()) return;
    try {
      const w = getCurrentWindow();
      await w.setTheme(dark ? "dark" : "light");
      await w.setBackgroundColor(dark ? "#09090b" : "#ecfdf5");
    } catch {
      /* API indisponível ou permissão */
    }
  };

  const toggleTheme = () => {
    const nextTheme: Theme = isDark ? "light" : "dark";
    setTheme(nextTheme);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("theme", nextTheme);
    }
    if (authView !== "splash") {
      void syncTauriWindowChrome(nextTheme === "dark");
    }
  };

  const closeTopModal = useCallback((): boolean => {
    if (commandPaletteOpen) {
      setCommandPaletteOpen(false);
      return true;
    }
    if (conversationSearchOpen) {
      setConversationSearchOpen(false);
      return true;
    }
    if (galleryOpen) {
      setGalleryOpen(false);
      return true;
    }
    if (forwardModalOpen) {
      setForwardModalOpen(false);
      setForwardSource(null);
      setForwardSendError(null);
      return true;
    }
    if (emojiPickerOpen) {
      setEmojiPickerOpen(false);
      return true;
    }
    if (attachmentMenuOpen) {
      setAttachmentMenuOpen(false);
      return true;
    }
    if (showConversationInfoModal) {
      setShowConversationInfoModal(false);
      return true;
    }
    if (addCallParticipantsOpen) {
      setAddCallParticipantsOpen(false);
      return true;
    }
    return false;
  }, [
    commandPaletteOpen,
    conversationSearchOpen,
    galleryOpen,
    forwardModalOpen,
    emojiPickerOpen,
    attachmentMenuOpen,
    showConversationInfoModal,
    addCallParticipantsOpen,
  ]);

  const handleChatCommandPaletteAction = useCallback(
    (action: ChatCommandPaletteAction) => {
      if (action === "search") {
        if (selectedConversation) setConversationSearchOpen(true);
        return;
      }
      if (action === "focusComposer") {
        queueMicrotask(() => messageInputRef.current?.focus());
        return;
      }
      if (action === "toggleTheme") toggleTheme();
    },
    [selectedConversation],
  );

  useEffect(() => {
    if (authView !== "platform") return;
    const onKey = (e: Event) => {
      if (!(e instanceof globalThis.KeyboardEvent)) return;
      if (e.key === "Escape") {
        if (closeTopModal()) e.preventDefault();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (platformMenu === "messages") setCommandPaletteOpen(true);
        return;
      }
      if (
        e.key === "/" &&
        !mod &&
        platformMenu === "messages" &&
        selectedConversation &&
        !e.altKey
      ) {
        const t = e.target as HTMLElement | null;
        if (!t) return;
        if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
        e.preventDefault();
        setConversationSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [authView, platformMenu, selectedConversation, closeTopModal]);

  const getPasswordStrength = (password: string) => {
    if (!password) {
      return { score: 0, label: "Vazia", widthClass: "w-0", colorClass: "bg-zinc-400" };
    }

    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    if (password.length >= 12) score += 1;

    if (score <= 1) {
      return { score, label: "Fraca", widthClass: "w-1/5", colorClass: "bg-red-500" };
    }
    if (score <= 3) {
      return { score, label: "Media", widthClass: "w-3/5", colorClass: "bg-yellow-500" };
    }
    if (score === 4) {
      return { score, label: "Boa", widthClass: "w-4/5", colorClass: "bg-lime-500" };
    }
    return { score, label: "Forte", widthClass: "w-full", colorClass: "bg-emerald-500" };
  };

  const passwordStrength = getPasswordStrength(registerPassword);
  const forgotPasswordStrength = getPasswordStrength(forgotPassword);
  const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  useEffect(() => {
    let cancelled = false;
    setLegalLoading(true);
    void (async () => {
      try {
        const data = await fetchLegalBundle();
        if (!cancelled) {
          setLegalBundle(data);
          setLegalFetchFailed(false);
        }
      } catch {
        if (!cancelled) {
          setLegalFetchFailed(true);
        }
      } finally {
        if (!cancelled) {
          setLegalLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const raw = sessionStorage.getItem("oauth_callback_error");
    if (!raw) return;
    sessionStorage.removeItem("oauth_callback_error");
    if (getAccessToken()) return;
    try {
      const parsed = JSON.parse(raw) as { message?: string; code?: string };
      setAuthError(
        parsed.message?.trim() ||
          parsed.code ||
          "Erro ao iniciar sessão com Google ou Microsoft.",
      );
    } catch {
      setAuthError("Erro OAuth.");
    }
  }, []);

  useEffect(() => {
    if (authView !== "login") return;
    const raw = sessionStorage.getItem("oauth_reactivate_pending");
    if (!raw) return;
    sessionStorage.removeItem("oauth_reactivate_pending");
    if (getAccessToken()) return;
    try {
      const parsed = JSON.parse(raw) as { reactivationToken?: string };
      if (typeof parsed.reactivationToken === "string" && parsed.reactivationToken.length > 0) {
        setReactivatePrompt({ mode: "oauth", token: parsed.reactivationToken });
      }
    } catch {
      /* ignorar */
    }
  }, [authView]);

  useEffect(() => {
    if (authView !== "login") return;
    const raw = sessionStorage.getItem("oauth_2fa_pending");
    if (!raw) return;
    sessionStorage.removeItem("oauth_2fa_pending");
    if (getAccessToken()) return;
    try {
      const parsed = JSON.parse(raw) as { tempToken?: string };
      if (typeof parsed.tempToken === "string" && parsed.tempToken.length > 0) {
        void (async () => {
          const geo = await getClientGeo();
          setLogin2faDigits(emptyOtp6());
          setLogin2faPending({ tempToken: parsed.tempToken!, geo });
        })();
      }
    } catch {
      /* ignorar */
    }
  }, [authView]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setResendSeconds((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  useEffect(() => {
    if (authView !== "login") {
      loginGeoPrimedRef.current = false;
    }
  }, [authView]);

  const requestLoginGeoOnUserInteraction = useCallback(() => {
    if (loginGeoPrimedRef.current) return;
    loginGeoPrimedRef.current = true;
    void primeClientGeo();
  }, []);

  useEffect(() => {
    if (authView !== "platform") {
      setSessionUser(null);
      setUserMeLoading(false);
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setSessionUser(null);
      setUserMeLoading(false);
      return;
    }
    let cancelled = false;
    setUserMeLoading(true);
    void (async () => {
      try {
        const u = await meRequest();
        if (!cancelled) {
          setSessionUser((prev) => ({
            ...u,
            avatarUrl: bustAvatarCache(u.avatarUrl),
            hasPassword: u.hasPassword ?? false,
            phoneWhatsapp: u.phoneWhatsapp ?? null,
            socialDiscord: u.socialDiscord ?? null,
            socialLinkedin: u.socialLinkedin ?? null,
            socialYoutube: u.socialYoutube ?? null,
            socialInstagram: u.socialInstagram ?? null,
            socialFacebook: u.socialFacebook ?? null,
            websiteUrl: u.websiteUrl ?? null,
            accountDisabledAt: u.accountDisabledAt ?? null,
            twoFactorEnabled: u.twoFactorEnabled ?? false,
            lastSessionIp: u.lastSessionIp ?? null,
            lastSessionCity: u.lastSessionCity ?? null,
            lastSessionLatitude: u.lastSessionLatitude ?? null,
            lastSessionLongitude: u.lastSessionLongitude ?? null,
            lastSessionAt: u.lastSessionAt ?? null,
            presenceStatus: u.presenceStatus ?? prev?.presenceStatus ?? "online",
          }));
        }
      } catch {
        if (!cancelled) setSessionUser(null);
      } finally {
        if (!cancelled) setUserMeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authView]);

  const getCroppedImage = async (imageSrc: string, area: Area) => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageSrc;
    });

    const canvas = document.createElement("canvas");
    canvas.width = area.width;
    canvas.height = area.height;
    const context = canvas.getContext("2d");
    if (!context) return null;

    context.drawImage(
      image,
      area.x,
      area.y,
      area.width,
      area.height,
      0,
      0,
      area.width,
      area.height,
    );

    return canvas.toDataURL("image/jpeg", 0.92);
  };

  const resizeWindow = async (
    width: number,
    height: number,
    resizable = false,
    minWidth?: number,
    minHeight?: number,
  ) => {
    if (!isTauri()) return;
    try {
      const appWindow = getCurrentWindow();
      // Temporarily enable native resize to ensure setSize works reliably.
      await appWindow.setResizable(true);
      await appWindow.setMinSize(
        minWidth && minHeight ? new LogicalSize(minWidth, minHeight) : null,
      );
      await appWindow.setSize(new LogicalSize(width, height));
      await appWindow.center();
      await appWindow.setResizable(resizable);
      await appWindow.setMaximizable(resizable);
      if (!resizable) {
        try {
          await appWindow.unmaximize();
        } catch {
          /* ignorar */
        }
      }
    } catch {
      console.error("Falha ao redimensionar janela do Tauri.");
    }
  };

  const exitSplash = async () => {
    if (isTauri()) {
      await syncTauriWindowChrome(isDark);
    }
    if (getAccessToken()) {
      const widthFromScreen = Math.floor(window.screen.availWidth * 0.8);
      const heightFromScreen = Math.floor(window.screen.availHeight * 0.8);
      const targetWidth = Math.max(APP_MIN_WINDOW.width, widthFromScreen);
      const targetHeight = Math.max(APP_MIN_WINDOW.height, heightFromScreen);
      setAuthView("platform");
      await resizeWindow(
        targetWidth,
        targetHeight,
        true,
        APP_MIN_WINDOW.width,
        APP_MIN_WINDOW.height,
      );
    } else {
      setAuthView("login");
      await resizeWindow(LOGIN_WINDOW.width, LOGIN_WINDOW.height);
    }
  };

  const exitSplashRef = useRef(exitSplash);
  exitSplashRef.current = exitSplash;

  useEffect(() => {
    if (authView !== "splash") return;
    if (typeof window === "undefined") return;
    void resizeWindow(LOGIN_WINDOW.width, LOGIN_WINDOW.height);

    let cancelled = false;

    const clearSplashTimer = () => {
      if (splashTimerRef.current != null) {
        window.clearTimeout(splashTimerRef.current);
        splashTimerRef.current = null;
      }
    };

    const scheduleNormalExit = () => {
      clearSplashTimer();
      splashTimerRef.current = window.setTimeout(() => {
        splashTimerRef.current = null;
        if (!cancelled) void exitSplashRef.current();
      }, SPLASH_DURATION_MS);
    };

    if (!isTauri()) {
      scheduleNormalExit();
      return () => {
        cancelled = true;
        clearSplashTimer();
      };
    }

    setSplashUpdaterPhase("checking");
    setSplashUpdaterPercent(null);
    setSplashUpdaterBytes(0);
    setSplashUpdaterVersion(null);

    void (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const { relaunch } = await import("@tauri-apps/plugin-process");
        const update = await check();
        if (cancelled) return;
        if (!update) {
          try {
            const { getVersion } = await import("@tauri-apps/api/app");
            const localVer = await getVersion();
            console.info(
              `[splash updater] Sem atualização remota (versão no app: ${localVer}). O updater compara com a versão em src-tauri/Cargo.toml [package].version — tem de ser menor que a do latest.json (semver).`,
            );
          } catch {
            /* ignorar */
          }
          setSplashUpdaterPhase("idle");
          scheduleNormalExit();
          return;
        }
        setSplashUpdaterVersion(update.version);
        setSplashUpdaterPhase("downloading");
        let downloaded = 0;
        let contentLength: number | undefined;
        await update.downloadAndInstall((event) => {
          if (cancelled) return;
          if (event.event === "Started") {
            contentLength = event.data.contentLength;
            if (contentLength != null && contentLength > 0) {
              setSplashUpdaterPercent(0);
            } else {
              setSplashUpdaterPercent(null);
            }
            setSplashUpdaterBytes(0);
          } else if (event.event === "Progress") {
            downloaded += event.data.chunkLength;
            setSplashUpdaterBytes(downloaded);
            if (contentLength != null && contentLength > 0) {
              const p = Math.min(100, Math.round((100 * downloaded) / contentLength));
              setSplashUpdaterPercent(p);
            }
          } else if (event.event === "Finished") {
            setSplashUpdaterPercent(100);
            setSplashUpdaterPhase("installing");
          }
        });
        if (cancelled) return;
        await relaunch();
      } catch (e) {
        console.error("[splash updater]", e);
        if (!cancelled) {
          setSplashUpdaterPhase("idle");
          setSplashUpdaterPercent(null);
          setSplashUpdaterBytes(0);
          setSplashUpdaterVersion(null);
          scheduleNormalExit();
        }
      }
    })();

    return () => {
      cancelled = true;
      clearSplashTimer();
    };
  }, [authView]);

  /** Tema/cor da janela (Tauri) alinhados ao conteúdo — janela sem decorações nativas (barra customizada). */
  useEffect(() => {
    if (authView === "splash" || !isTauri()) return;
    void syncTauriWindowChrome(isDark);
  }, [authView, isDark]);

  const goToRegister = async () => {
    setAuthError(null);
    setRegisterEmail("");
    setRegisterEmailReadonly(false);
    setAuthView("register");
    await resizeWindow(REGISTER_WINDOW.width, REGISTER_WINDOW.height);
  };

  const goToRegisterOauthOnly = async (email: string) => {
    setAuthError(null);
    setRegisterEmail(email.trim());
    setRegisterEmailReadonly(true);
    setAuthView("register");
    await resizeWindow(REGISTER_WINDOW.width, REGISTER_WINDOW.height);
  };

  const resetRegisterForm = () => {
    setRegisterEmail("");
    setRegisterEmailReadonly(false);
    setRegisterPassword("");
    setShowRegisterPassword(false);
    setShowConfirmPassword(false);
    setShowPhotoCropModal(false);
    setCropSource(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview(null);
  };

  const goToLogin = async () => {
    setAuthError(null);
    setLogin2faPending(null);
    setLogin2faDigits(emptyOtp6());
    setReactivatePrompt(null);
    setPasswordResetJwt(null);
    resetRegisterForm();
    setForgotStep("email");
    setForgotEmail("");
    setForgotOtpDigits(emptyOtp6());
    setForgotPassword("");
    setShowForgotNewPassword(false);
    setShowForgotConfirmPassword(false);
    setResendSeconds(0);
    setAuthView("login");
    await resizeWindow(LOGIN_WINDOW.width, LOGIN_WINDOW.height);
  };

  const handleLogout = async () => {
    clearTokens();
    processedNotificationIdsRef.current.clear();
    setNotifications([]);
    setNotificationsUnread(0);
    setContactsBlockedCount(0);
    setContactsFriendsCount(0);
    setPeerPresenceLive({});
    setSessionUser(null);
    setSelectedConversation(null);
    setPlatformMenu("messages");
    setSettingsSection("account");
    await goToLogin();
  };

  const handleLogoutRef = useRef(handleLogout);
  handleLogoutRef.current = handleLogout;

  useEffect(() => {
    const onAuthLogoutRequired = () => {
      void handleLogoutRef.current();
    };
    window.addEventListener(AUTH_LOGOUT_REQUIRED_EVENT, onAuthLogoutRequired);
    return () => window.removeEventListener(AUTH_LOGOUT_REQUIRED_EVENT, onAuthLogoutRequired);
  }, []);

  const handleSettingsAvatarFile = (file: File) => {
    setPhotoCropPurpose("settings");
    const fileReader = new FileReader();
    fileReader.onload = () => {
      if (typeof fileReader.result === "string") {
        setCropSource(fileReader.result);
        setShowPhotoCropModal(true);
      }
    };
    fileReader.readAsDataURL(file);
  };

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPhotoCropPurpose("register");
    const file = event.target.files?.[0];
    if (!file) return;
    const fileReader = new FileReader();
    fileReader.onload = () => {
      if (typeof fileReader.result === "string") {
        setCropSource(fileReader.result);
        setShowPhotoCropModal(true);
      }
    };
    fileReader.readAsDataURL(file);
    event.currentTarget.value = "";
  };

  const onCropComplete = useCallback((_croppedArea: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleApplyPhotoCrop = async () => {
    if (!cropSource || !croppedAreaPixels) return;
    const croppedImage = await getCroppedImage(cropSource, croppedAreaPixels);
    if (!croppedImage) return;

    if (photoCropPurpose === "settings") {
      setIsAvatarUploading(true);
      setAvatarUploadError(null);
      try {
        const blob = await fetch(croppedImage).then((r) => r.blob());
        const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
        const user = await uploadAvatarRequest(file);
        setSessionUser({
          ...user,
          avatarUrl: bustAvatarCache(user.avatarUrl),
          hasPassword: user.hasPassword ?? false,
          phoneWhatsapp: user.phoneWhatsapp ?? null,
          socialDiscord: user.socialDiscord ?? null,
          socialLinkedin: user.socialLinkedin ?? null,
          socialYoutube: user.socialYoutube ?? null,
          socialInstagram: user.socialInstagram ?? null,
          socialFacebook: user.socialFacebook ?? null,
          websiteUrl: user.websiteUrl ?? null,
          accountDisabledAt: user.accountDisabledAt ?? null,
        });
        setShowPhotoCropModal(false);
        setCropSource(null);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedAreaPixels(null);
        setPhotoCropPurpose("register");
        setShowAvatarSuccessAlert(true);
      } catch (err) {
        const msg =
          err instanceof ApiError ? err.message : "Não foi possível atualizar a foto.";
        setAvatarUploadError(msg);
      } finally {
        setIsAvatarUploading(false);
      }
      return;
    }

    setPhotoPreview(croppedImage);
    setShowPhotoCropModal(false);
    setCropSource(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  };

  const applyLoginTokens = async (tokens: LoginResponse) => {
    saveTokens(tokens.accessToken, tokens.refreshToken, tokens.expiresIn);
    setSessionUser({
      ...tokens.user,
      avatarUrl: bustAvatarCache(tokens.user.avatarUrl),
      hasPassword: tokens.user.hasPassword ?? false,
      phoneWhatsapp: tokens.user.phoneWhatsapp ?? null,
      socialDiscord: tokens.user.socialDiscord ?? null,
      socialLinkedin: tokens.user.socialLinkedin ?? null,
      socialYoutube: tokens.user.socialYoutube ?? null,
      socialInstagram: tokens.user.socialInstagram ?? null,
      socialFacebook: tokens.user.socialFacebook ?? null,
      websiteUrl: tokens.user.websiteUrl ?? null,
      accountDisabledAt: tokens.user.accountDisabledAt ?? null,
      twoFactorEnabled: tokens.user.twoFactorEnabled ?? false,
      lastSessionIp: tokens.user.lastSessionIp ?? null,
      lastSessionCity: tokens.user.lastSessionCity ?? null,
      lastSessionLatitude: tokens.user.lastSessionLatitude ?? null,
      lastSessionLongitude: tokens.user.lastSessionLongitude ?? null,
      lastSessionAt: tokens.user.lastSessionAt ?? null,
      presenceStatus: tokens.user.presenceStatus ?? "online",
    });
    setShowLoginSuccessAlert(true);
    await sleep(800);
    setShowLoginSuccessAlert(false);

    const widthFromScreen = Math.floor(window.screen.availWidth * 0.8);
    const heightFromScreen = Math.floor(window.screen.availHeight * 0.8);
    const targetWidth = Math.max(APP_MIN_WINDOW.width, widthFromScreen);
    const targetHeight = Math.max(APP_MIN_WINDOW.height, heightFromScreen);

    setAuthView("platform");
    setReactivatePrompt(null);
    await resizeWindow(
      targetWidth,
      targetHeight,
      true,
      APP_MIN_WINDOW.width,
      APP_MIN_WINDOW.height,
    );
  };

  const handleReactivateConfirm = async () => {
    if (!reactivatePrompt) return;
    setAuthError(null);
    const geoFirst = await getClientGeo();
    setIsReactivateLoading(true);
    try {
      let tokens: LoginResponse;
      if (reactivatePrompt.mode === "password") {
        const geo = geoFirst;
        const pubIp = getCachedPublicIp() ?? (await fetchPublicIp());
        tokens = await loginRequest(reactivatePrompt.email, reactivatePrompt.password, {
          reactivate: true,
          ...(geo ? { latitude: geo.latitude, longitude: geo.longitude } : {}),
          ...(pubIp ? { clientPublicIp: pubIp } : {}),
        });
      } else {
        const pubIp = getCachedPublicIp() ?? (await fetchPublicIp());
        tokens = await oauthReactivateRequest(reactivatePrompt.token, {
          ...(pubIp ? { clientPublicIp: pubIp } : {}),
        });
      }
      await applyLoginTokens(tokens);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Falha ao reativar a conta.");
    } finally {
      setIsReactivateLoading(false);
    }
  };

  const handleLogin2faConfirm = async () => {
    const code = login2faDigits.join("");
    if (!login2faPending?.tempToken || code.length !== 6) return;
    setAuthError(null);
    const geo =
      (await getClientGeo()) ?? getCachedClientGeo() ?? login2faPending.geo;
    setIsLogin2faLoading(true);
    try {
      const pubIp = getCachedPublicIp() ?? (await fetchPublicIp());
      const tokens = await login2faRequest(login2faPending.tempToken, code, {
        ...(geo ? { latitude: geo.latitude, longitude: geo.longitude } : {}),
        ...(pubIp ? { clientPublicIp: pubIp } : {}),
      });
      setLogin2faPending(null);
      setLogin2faDigits(emptyOtp6());
      await applyLoginTokens(tokens);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Código inválido.");
    } finally {
      setIsLogin2faLoading(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);
    loginGeoPrimedRef.current = true;
    const fd = new FormData(event.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    /** Antes de setState — mantém o pedido de geo ligado ao gesto (Entrar) no WebKit/Tauri. */
    const geoSnapshot = await getClientGeo();
    setIsLoginLoading(true);
    try {
      const pubIp = getCachedPublicIp() ?? (await fetchPublicIp());
      const tokens = await loginRequest(email, password, {
        ...(geoSnapshot ? { latitude: geoSnapshot.latitude, longitude: geoSnapshot.longitude } : {}),
        ...(pubIp ? { clientPublicIp: pubIp } : {}),
      });
      await applyLoginTokens(tokens);
    } catch (err) {
      if (err instanceof ApiError && err.code === "USER_NOT_FOUND") {
        const em = err.email ?? email;
        await goToRegisterOauthOnly(em);
        return;
      }
      if (err instanceof ApiError && err.code === "OAUTH_ONLY") {
        setAuthError(
          "Esta conta usa Google ou Microsoft. Utilize um dos botões abaixo para entrar.",
        );
        return;
      }
      if (err instanceof ApiError && err.code === "TWO_FACTOR_REQUIRED" && err.tempToken) {
        setLogin2faDigits(emptyOtp6());
        setLogin2faPending({ tempToken: err.tempToken, geo: geoSnapshot });
        return;
      }
      if (err instanceof ApiError && err.code === "ACCOUNT_DISABLED") {
        setReactivatePrompt({ mode: "password", email, password });
        return;
      }
      if (err instanceof ApiError && err.code === "ACCOUNT_DELETED") {
        setAuthError(
          err.message ||
            "Esta conta foi eliminada. Pode criar uma nova conta com o mesmo email.",
        );
        return;
      }
      setAuthError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setIsLoginLoading(false);
    }
  };

  const handleRegisterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);
    if (registerEmailReadonly) {
      setAuthError("Complete o registo com Google ou Microsoft.");
      return;
    }
    const form = event.currentTarget;
    const fd0 = new FormData(form);
    const firstName = String(fd0.get("firstName") ?? "").trim();
    const lastName = String(fd0.get("lastName") ?? "").trim();
    const email = registerEmail.trim();
    const password = String(fd0.get("password") ?? "");
    const confirmPassword = String(fd0.get("confirmPassword") ?? "");
    if (password !== confirmPassword) {
      setAuthError("As senhas não coincidem");
      return;
    }
    setIsRegisterLoading(true);
    try {
      const body = new FormData();
      body.append("firstName", firstName);
      body.append("lastName", lastName);
      body.append("email", email);
      body.append("password", password);
      body.append("confirmPassword", confirmPassword);
      if (photoPreview) {
        const blob = await (await fetch(photoPreview)).blob();
        body.append("photo", blob, "avatar.jpg");
      }
      const reg = await registerRequest(body);
      setRegisterSuccessMessage(reg.message);
      setShowRegisterSuccessAlert(true);
      await sleep(2400);
      setShowRegisterSuccessAlert(false);
      await goToLogin();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Falha no registo");
    } finally {
      setIsRegisterLoading(false);
    }
  };

  const goToForgotPassword = () => {
    setAuthError(null);
    setPasswordResetJwt(null);
    setForgotStep("email");
    setForgotEmail("");
    setForgotOtpDigits(emptyOtp6());
    setForgotPassword("");
    setShowForgotNewPassword(false);
    setShowForgotConfirmPassword(false);
    setResendSeconds(0);
    setAuthView("forgot");
  };

  const handleForgotEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);
    setIsForgotSending(true);
    try {
      await forgotPasswordRequest(forgotEmail.trim());
      setForgotStep("otp");
      setResendSeconds(40);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Falha ao enviar código");
    } finally {
      setIsForgotSending(false);
    }
  };

  const handleVerifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const otpCode = forgotOtpDigits.join("");
    if (otpCode.length !== 6) return;
    setAuthError(null);
    setIsVerifyOtpLoading(true);
    try {
      const { resetToken } = await verifyOtpRequest(forgotEmail.trim(), otpCode);
      setPasswordResetJwt(resetToken);
      setForgotStep("reset");
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Código inválido");
    } finally {
      setIsVerifyOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendSeconds > 0) return;
    setAuthError(null);
    setForgotOtpDigits(emptyOtp6());
    try {
      await forgotPasswordRequest(forgotEmail.trim());
      setResendSeconds(40);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Falha ao reenviar");
    }
  };

  const handleResetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);
    const fd = new FormData(event.currentTarget);
    const newPassword = String(fd.get("newPassword") ?? "");
    const confirm = String(fd.get("confirmNewPassword") ?? "");
    if (newPassword !== confirm) {
      setAuthError("As senhas não coincidem");
      return;
    }
    if (!passwordResetJwt) {
      setAuthError("Sessão de redefinição inválida. Valide o OTP novamente.");
      return;
    }
    setIsResetPasswordLoading(true);
    try {
      await resetPasswordRequest(passwordResetJwt, newPassword);
      setPasswordResetJwt(null);
      await goToLogin();
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Falha ao redefinir");
    } finally {
      setIsResetPasswordLoading(false);
    }
  };

  const openLegalModal = (tab: "termos" | "politica") => {
    setLegalTab(tab);
    setShowLegalModal(true);
  };

  const getPlatformButtonClass = (active: boolean, compact = false) =>
    `${compact ? "h-9 w-9" : "h-10 w-10"} flex items-center justify-center rounded-full border transition ${
      active
        ? "border-emerald-500 bg-emerald-600 text-white"
        : isDark
          ? "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
          : "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
    }`;

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length <= 1) return name.slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  };

  const getConversationFlag = (conversationId: string) => {
    const local = conversationFlags[conversationId] ?? { blocked: false, favorite: false };
    if (isChatApiConversationId(conversationId)) {
      const row = chatConversationList.find((c) => c.id === conversationId);
      return {
        blocked: row?.kind === "direct" ? row.friendshipBlocked : false,
        blockedByMe: row?.kind === "direct" ? row.blockedByMe : false,
        favorite: row?.favorite ?? false,
      };
    }
    return { ...local, blockedByMe: local.blocked };
  };

  const groupDescriptionFromList = useMemo(() => {
    if (!selectedConversation || selectedConversation.kind !== "group") return null;
    const row = chatConversationList.find((c) => c.id === selectedConversation.id);
    return row?.kind === "group" ? (row.description ?? null) : null;
  }, [selectedConversation, chatConversationList]);

  const directPeerProfile = useMemo((): ContactPeer | null => {
    if (!selectedConversation || selectedConversation.kind !== "direct") return null;
    const pid = selectedConversation.peerUserId;
    if (!pid) return null;
    return chatFriendsRows.find((r) => r.peer.id === pid)?.peer ?? null;
  }, [selectedConversation, chatFriendsRows]);

  const directChatComposerLock = useMemo(() => {
    if (!selectedConversation || selectedConversation.kind !== "direct") {
      return { locked: false, hint: null as string | null };
    }
    const id = selectedConversation.id;
    if (isChatApiConversationId(id)) {
      const row = chatConversationList.find((c) => c.id === id);
      if (row?.kind !== "direct" || !row.friendshipBlocked) return { locked: false, hint: null };
      if (!row.blockedByMe) {
        return {
          locked: true,
          hint: "Este contacto bloqueou-o. Não pode enviar mensagens.",
        };
      }
      return {
        locked: true,
        hint: "Bloqueou este contacto. Desbloqueie para voltar a enviar mensagens.",
      };
    }
    const blocked = conversationFlags[id]?.blocked ?? false;
    if (!blocked) return { locked: false, hint: null };
    return { locked: true, hint: "Conversa bloqueada (demonstração)." };
  }, [selectedConversation, chatConversationList, conversationFlags]);

  const updateConversationFlag = (
    conversationId: string,
    updater: (current: { blocked: boolean; favorite: boolean }) => { blocked: boolean; favorite: boolean },
  ) => {
    setConversationFlags((current) => {
      const previous = current[conversationId] ?? { blocked: false, favorite: false };
      return { ...current, [conversationId]: updater(previous) };
    });
  };

  const loadChatConversations = useCallback(async () => {
    try {
      const r = await listChatConversationsRequest({ days: 7 });
      setChatConversationList(r.conversations);
      setChatListHasMore(r.hasMore);
      chatListNextCursorRef.current = r.nextCursorEnd;
      chatListHasMoreRef.current = r.hasMore;
    } catch {
      /* ignore */
    }
  }, []);

  const loadCallLogs = useCallback(async () => {
    try {
      const r = await listCallLogsRequest();
      setCallLogs(r.calls);
    } catch {
      /* ignore */
    }
  }, []);

  const loadMoreChatConversations = useCallback(async () => {
    if (!chatListHasMoreRef.current || !chatListNextCursorRef.current) return;
    if (chatListLoadingMoreRef.current) return;
    chatListLoadingMoreRef.current = true;
    setChatListLoadingMore(true);
    try {
      const r = await listChatConversationsRequest({
        days: 7,
        cursorEnd: chatListNextCursorRef.current,
      });
      chatListNextCursorRef.current = r.nextCursorEnd;
      chatListHasMoreRef.current = r.hasMore;
      setChatListHasMore(r.hasMore);
      setChatConversationList((prev) => {
        const byId = new Map(prev.map((x) => [x.id, x]));
        for (const c of r.conversations) {
          byId.set(c.id, c);
        }
        return Array.from(byId.values()).sort(
          (a, b) =>
            new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime(),
        );
      });
    } catch {
      /* ignore */
    } finally {
      chatListLoadingMoreRef.current = false;
      setChatListLoadingMore(false);
    }
  }, []);

  const refreshGroupMembersList = useCallback(() => {
    const id = selectedConversation?.id;
    if (!id || selectedConversation?.kind !== "group" || !isChatApiConversationId(id)) return;
    void listGroupMembersRequest(id)
      .then((r) => {
        setGroupMembersByConversationId((prev) => ({
          ...prev,
          [id]: r.members.map((m) => ({
            id: m.userId,
            name: m.displayName,
            email: m.email,
            role: m.role,
            avatarUrl: m.avatarUrl,
          })),
        }));
      })
      .catch(() => {});
  }, [selectedConversation?.id, selectedConversation?.kind]);

  const handleConversationInfoToggleFavorite = useCallback(() => {
    const id = selectedConversation?.id;
    if (!id) return;
    if (isChatApiConversationId(id)) {
      const row = chatConversationList.find((c) => c.id === id);
      const next = !(row?.favorite ?? false);
      applyChatConversationPreferencesLocal(id, { favorite: next });
      void (async () => {
        try {
          await patchChatConversationPreferencesRequest(id, { favorite: next });
          await loadChatConversations();
        } catch {
          /* ignore */
        }
      })();
      return;
    }
    updateConversationFlag(id, (current) => ({
      ...current,
      favorite: !current.favorite,
    }));
  }, [
    selectedConversation?.id,
    chatConversationList,
    applyChatConversationPreferencesLocal,
    loadChatConversations,
  ]);

  const handleConversationInfoToggleBlock = useCallback(() => {
    const id = selectedConversation?.id;
    const peerId = selectedConversation?.peerUserId;
    if (!id) return;
    if (!peerId || !isChatApiConversationId(id)) {
      updateConversationFlag(id, (current) => ({
        ...current,
        blocked: !current.blocked,
      }));
      return;
    }
    const f = getConversationFlag(id);
    if (f.blocked && !f.blockedByMe) return;
    void (async () => {
      try {
        if (f.blocked) await unblockContactPeer(peerId);
        else await blockContactPeer(peerId);
        await loadChatConversations();
        const b = await listContactsBlocked();
        setContactsBlockedCount(b.blocked.length);
      } catch {
        /* ignore */
      }
    })();
  }, [selectedConversation?.id, selectedConversation?.peerUserId, loadChatConversations]);

  const loadChatConversationsRef = useRef<() => void>(() => {});
  loadChatConversationsRef.current = () => {
    void loadChatConversations();
    void loadCallLogs();
  };

  const handleToggleBlockPeer = useCallback(
    async (peerUserId: string, nextBlocked: boolean) => {
      try {
        if (nextBlocked) await blockContactPeer(peerUserId);
        else await unblockContactPeer(peerUserId);
        await loadChatConversations();
        const b = await listContactsBlocked();
        setContactsBlockedCount(b.blocked.length);
      } catch {
        /* ignore */
      }
    },
    [loadChatConversations],
  );

  const startDirectChat = useCallback(
    async (peerUserId: string, displayName: string) => {
      try {
        const r = await ensureDirectConversationRequest(peerUserId);
        setSelectedConversation({
          id: r.conversationId,
          name: displayName,
          kind: "direct",
          peerUserId,
          peerAvatarUrl: r.peer.avatarUrl,
        });
        await loadChatConversations();
      } catch {
        /* ignore */
      }
    },
    [loadChatConversations],
  );

  const handleSelectConversation = useCallback((conv: SelectedConversation) => {
    const { scrollToMessageIdOnOpen, ...rest } = conv;
    setSelectedConversation(rest);
    setMentionJumpRequestKey(0);
    if (conv.kind === "group" && scrollToMessageIdOnOpen) {
      setMentionJump({ conversationId: conv.id, messageId: scrollToMessageIdOnOpen });
    } else {
      setMentionJump(null);
    }
  }, []);

  const handleMentionJumpClick = useCallback(() => {
    if (!mentionJump?.messageId) return;
    setSuppressedMentionMessageByConvId((prev) => ({
      ...prev,
      [mentionJump.conversationId]: mentionJump.messageId,
    }));
    setMentionJumpRequestKey((k) => k + 1);
  }, [mentionJump?.conversationId, mentionJump?.messageId]);

  const handleMentionJumpHandled = useCallback(() => {
    setMentionJump(null);
  }, []);

  const handleSearchJumpHandled = useCallback(() => {
    setSearchJump(null);
  }, []);

  const handleConversationSearchPick = useCallback((msg: ChatMessage) => {
    setSearchJump((prev) => ({
      messageId: msg.id,
      requestKey: (prev?.requestKey ?? 0) + 1,
    }));
  }, []);

  const togglePinConversation = useCallback((conversationId: string) => {
    setPinnedConversationIds((prev) =>
      prev.includes(conversationId)
        ? prev.filter((x) => x !== conversationId)
        : [...prev, conversationId],
    );
  }, []);

  const handleMuteConversationPreset = useCallback(
    async (conversationId: string, preset: "8h" | "tomorrow" | "forever" | "off") => {
      if (!isChatApiConversationId(conversationId)) return;
      try {
        if (preset === "off") {
          setMutedUntilByConversationId((prev) => {
            const n = { ...prev };
            delete n[conversationId];
            return n;
          });
          applyChatConversationPreferencesLocal(conversationId, { muted: false });
          await patchChatConversationPreferencesRequest(conversationId, { muted: false });
        } else {
          applyChatConversationPreferencesLocal(conversationId, { muted: true });
          await patchChatConversationPreferencesRequest(conversationId, { muted: true });
          if (preset === "8h") {
            setMutedUntilByConversationId((prev) => ({
              ...prev,
              [conversationId]: Date.now() + 8 * 3600000,
            }));
          } else if (preset === "tomorrow") {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            d.setHours(9, 0, 0, 0);
            setMutedUntilByConversationId((prev) => ({
              ...prev,
              [conversationId]: d.getTime(),
            }));
          } else {
            setMutedUntilByConversationId((prev) => {
              const n = { ...prev };
              delete n[conversationId];
              return n;
            });
          }
        }
        await loadChatConversations();
      } catch {
        /* ignore */
      }
    },
    [applyChatConversationPreferencesLocal, loadChatConversations],
  );

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const snap = mutedUntilByConversationIdRef.current;
      const expired = Object.entries(snap).filter(([, u]) => u <= now);
      if (expired.length === 0) return;
      for (const [id] of expired) {
        void (async () => {
          try {
            applyChatConversationPreferencesLocal(id, { muted: false });
            await patchChatConversationPreferencesRequest(id, { muted: false });
            await loadChatConversations();
          } catch {
            /* ignore */
          }
        })();
      }
      setMutedUntilByConversationId((prev) => {
        const n = { ...prev };
        for (const [id] of expired) delete n[id];
        return n;
      });
    };
    const t = window.setInterval(tick, 60000);
    tick();
    return () => clearInterval(t);
  }, [applyChatConversationPreferencesLocal, loadChatConversations]);

  useEffect(() => {
    if (!selectedConversation?.id) {
      setMentionJump(null);
      setMentionJumpRequestKey(0);
      setSearchJump(null);
      setConversationSearchOpen(false);
      setGalleryOpen(false);
      setCommandPaletteOpen(false);
      return;
    }
    setMentionJump((prev) =>
      prev && prev.conversationId !== selectedConversation.id ? null : prev,
    );
    setSearchJump(null);
    setConversationSearchOpen(false);
    setGalleryOpen(false);
    setCommandPaletteOpen(false);
  }, [selectedConversation?.id]);

  const handleAfterClearConversationForMe = useCallback((conversationId: string) => {
    setSelectedConversation((prev) => (prev?.id === conversationId ? null : prev));
  }, []);

  const sendApiChatAttachment = useCallback(
    async (
      conversationId: string,
      peerDisplayName: string,
      file: File | Blob,
      fileName: string,
      slotKind: "image" | "video" | "audio" | "document",
      caption: string,
      videoTrim?: { trimStartSec: number; trimEndSec: number },
      imageExtras?: { asGif?: boolean; asSticker?: boolean },
    ) => {
      const me = sessionUserRef.current;
      if (!me || !isChatApiConversationId(conversationId)) return;

      const useVideoProgress =
        slotKind === "video" && file instanceof Blob && "name" in file;
      const tempId = useVideoProgress
        ? `local-upload-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
        : "";
      let previewUrl: string | null = null;

      if (useVideoProgress) {
        previewUrl = URL.createObjectURL(file);
        const optimistic: ChatMessage = {
          id: tempId,
          conversationId,
          sentAt: new Date().toISOString(),
          text: caption.trim(),
          outgoing: true,
          attachment: { kind: "video", url: previewUrl },
          uploadProgress: 0,
        };
        setConversationMessagesById((prev) => ({
          ...prev,
          [conversationId]: [...(prev[conversationId] ?? []), optimistic],
        }));
      }

      const patchUploadPct = (pct: number) => {
        if (!useVideoProgress) return;
        setConversationMessagesById((prev) => {
          const list = prev[conversationId] ?? [];
          return {
            ...prev,
            [conversationId]: list.map((m) =>
              m.id === tempId ? { ...m, uploadProgress: pct } : m,
            ),
          };
        });
      };

      try {
        const up = useVideoProgress
          ? await uploadChatAttachmentRequestWithProgress(conversationId, file, fileName, {
              videoTrim,
              onUploadProgress: (pct) =>
                patchUploadPct(Math.min(65, Math.round((65 * pct) / 100))),
            })
          : await uploadChatAttachmentRequest(
              conversationId,
              file,
              fileName,
              slotKind === "video" ? videoTrim : undefined,
            );
        if (useVideoProgress) {
          patchUploadPct(85);
        }
        const url = `${apiOrigin()}/api/v1/files/${up.path.replace(/^\/+/, "")}`;
        const sizeLabel =
          up.size < 1024
            ? `${up.size} B`
            : up.size < 1048576
              ? `${(up.size / 1024).toFixed(1)} KB`
              : `${(up.size / (1024 * 1024)).toFixed(1)} MB`;
        const payloadAttachment =
          slotKind === "image"
            ? {
                kind: "image" as const,
                url,
                alt: up.fileName,
                ...(imageExtras?.asGif ? { asGif: true as const } : {}),
                ...(imageExtras?.asSticker ? { asSticker: true as const } : {}),
              }
            : slotKind === "video"
              ? {
                  kind: "video" as const,
                  url,
                  ...(up.posterPath
                    ? {
                        posterUrl: `${apiOrigin()}/api/v1/files/${up.posterPath.replace(/^\/+/, "")}`,
                      }
                    : {}),
                }
              : slotKind === "audio"
                ? { kind: "audio" as const, url }
                : {
                    kind: "document" as const,
                    fileName: up.fileName,
                    sizeLabel,
                    url,
                  };
        const res = await sendChatMessageRequest(conversationId, {
          kind: slotKind,
          text: caption.trim() ? caption.trim() : undefined,
          payload: { attachment: payloadAttachment },
        });
        const mapped = mapApiMessageToChatMessage(res.message, me.id, peerDisplayName);
        mapped.outgoingReceipt = res.deliveredToPeer ? "delivered" : "sent";
        if (useVideoProgress) {
          patchUploadPct(100);
        }
        const finalizeMessages = () => {
          setConversationMessagesById((prev) => {
            const base = prev[conversationId] ?? [];
            if (useVideoProgress && previewUrl) {
              URL.revokeObjectURL(previewUrl);
              return {
                ...prev,
                [conversationId]: [...base.filter((m) => m.id !== tempId), mapped],
              };
            }
            return { ...prev, [conversationId]: [...base, mapped] };
          });
        };
        if (useVideoProgress) {
          window.setTimeout(finalizeMessages, 80);
        } else {
          finalizeMessages();
        }
        void loadChatConversations();
      } catch {
        if (useVideoProgress && previewUrl) {
          URL.revokeObjectURL(previewUrl);
          setConversationMessagesById((prev) => {
            const base = prev[conversationId] ?? [];
            return {
              ...prev,
              [conversationId]: base.filter((m) => m.id !== tempId),
            };
          });
        }
      }
    },
    [loadChatConversations],
  );

  const sendApiChatImageAfterUpload = useCallback(
    async (
      conversationId: string,
      peerDisplayName: string,
      up: ChatAttachmentUploadResult,
      opts: {
        asSticker?: boolean;
        stickerCaption?: { text: string; xPercent: number; yPercent: number } | null;
      } = {},
    ) => {
      const me = sessionUserRef.current;
      if (!me || !isChatApiConversationId(conversationId)) return;
      try {
        const url = `${apiOrigin()}/api/v1/files/${up.path.replace(/^\/+/, "")}`;
        const payloadAttachment = {
          kind: "image" as const,
          url,
          alt: up.fileName,
          ...(opts.asSticker ? { asSticker: true as const } : {}),
        };
        const payload: Record<string, unknown> = { attachment: payloadAttachment };
        const cap = opts.stickerCaption?.text?.trim();
        if (opts.asSticker && cap) {
          payload.stickerCaption = {
            text: cap,
            xPercent: opts.stickerCaption!.xPercent,
            yPercent: opts.stickerCaption!.yPercent,
          };
        }
        const res = await sendChatMessageRequest(conversationId, {
          kind: "image",
          text: undefined,
          payload,
        });
        const mapped = mapApiMessageToChatMessage(res.message, me.id, peerDisplayName);
        mapped.outgoingReceipt = res.deliveredToPeer ? "delivered" : "sent";
        if (opts.asSticker) {
          addStickerCreated(url);
        }
        setConversationMessagesById((prev) => ({
          ...prev,
          [conversationId]: [...(prev[conversationId] ?? []), mapped],
        }));
        void loadChatConversations();
      } catch {
        /* ignore */
      }
    },
    [loadChatConversations],
  );

  const handleSendStickerFromPicker = useCallback(
    async (
      file: File,
      meta?: { text: string; xPercent: number; yPercent: number } | null,
    ) => {
      const conv = selectedConversation;
      if (!conv || !isChatApiConversationId(conv.id)) return;
      try {
        let uploadFile = file;
        if (meta?.text?.trim()) {
          uploadFile = await rasterizeStickerWithCaption(file, {
            text: meta.text.trim(),
            xPercent: meta.xPercent,
            yPercent: meta.yPercent,
          });
        }
        const up = await uploadChatStickerFromImageRequest(conv.id, uploadFile);
        await sendApiChatImageAfterUpload(conv.id, conv.name, up, {
          asSticker: true,
          stickerCaption: null,
        });
      } catch {
        /* ignore */
      }
    },
    [selectedConversation, sendApiChatImageAfterUpload],
  );

  const prepareStickerImageForCompose = useCallback(
    async (file: File) => {
      const conv = selectedConversation;
      if (!conv || !isChatApiConversationId(conv.id)) return file;
      const blob = await removeStickerBackgroundRequest(conv.id, file);
      const stem = file.name.replace(/\.[^.]+$/, "") || "sticker";
      return new File([blob], `${stem}-nobg.png`, { type: "image/png" });
    },
    [selectedConversation],
  );

  const handleResendStickerFromUrl = useCallback(
    async (url: string) => {
      const conv = selectedConversation;
      const me = sessionUserRef.current;
      if (!conv || !me || !isChatApiConversationId(conv.id)) return;
      try {
        const payloadAttachment = {
          kind: "image" as const,
          url,
          alt: "Figurinha",
          asSticker: true as const,
        };
        const res = await sendChatMessageRequest(conv.id, {
          kind: "image",
          payload: { attachment: payloadAttachment },
        });
        const mapped = mapApiMessageToChatMessage(res.message, me.id, conv.name);
        mapped.outgoingReceipt = res.deliveredToPeer ? "delivered" : "sent";
        setConversationMessagesById((prev) => ({
          ...prev,
          [conv.id]: [...(prev[conv.id] ?? []), mapped],
        }));
        void loadChatConversations();
      } catch {
        /* ignore */
      }
    },
    [selectedConversation, loadChatConversations],
  );

  const handleFavoriteSticker = useCallback((message: ChatMessage) => {
    const att = message.attachment;
    if (att?.kind !== "image" || !att.url) return;
    addStickerFavorite(att.url);
  }, []);

  const handleGifFileFromEmojiPicker = useCallback(
    async (file: File) => {
      const conv = selectedConversation;
      if (!conv || !isChatApiConversationId(conv.id)) return;
      await sendApiChatAttachment(conv.id, conv.name, file, file.name, "image", "", undefined, {
        asGif: true,
      });
    },
    [selectedConversation, sendApiChatAttachment],
  );

  const handleDownloadWithDialog = async (url: string, suggestedFileName: string) => {
    try {
      const targetPath = await save({
        defaultPath: suggestedFileName,
      });
      if (!targetPath) return;
      setIsDownloadingAsset(true);
      await invoke("download_file", { url, targetPath });
      setShowDownloadSuccessAlert(true);
    } catch {
      setShowDownloadErrorAlert(true);
    } finally {
      setIsDownloadingAsset(false);
    }
  };

  const groupMembersMapRef = useRef(groupMembersByConversationId);
  groupMembersMapRef.current = groupMembersByConversationId;
  const presenceBeforeAutoCallRef = useRef<PresenceStatus | null>(readStoredAutoCallPresence());

  const syncPresenceWhileInCall = useCallback(async (nextStatus: PresenceStatus) => {
    const previousPresence = sessionUserRef.current?.presenceStatus ?? "online";
    setSessionUser((prev) => (prev ? { ...prev, presenceStatus: nextStatus } : null));
    try {
      const u = await updatePresenceRequest(nextStatus);
      setSessionUser((prev) =>
        prev
          ? {
              ...prev,
              ...u,
              avatarUrl: bustAvatarCache(u.avatarUrl),
              hasPassword: u.hasPassword ?? false,
              phoneWhatsapp: u.phoneWhatsapp ?? null,
              socialDiscord: u.socialDiscord ?? null,
              socialLinkedin: u.socialLinkedin ?? null,
              socialYoutube: u.socialYoutube ?? null,
              socialInstagram: u.socialInstagram ?? null,
              socialFacebook: u.socialFacebook ?? null,
              websiteUrl: u.websiteUrl ?? null,
              accountDisabledAt: u.accountDisabledAt ?? null,
              twoFactorEnabled: u.twoFactorEnabled ?? false,
              lastSessionIp: u.lastSessionIp ?? null,
              lastSessionCity: u.lastSessionCity ?? null,
              lastSessionLatitude: u.lastSessionLatitude ?? null,
              lastSessionLongitude: u.lastSessionLongitude ?? null,
              lastSessionAt: u.lastSessionAt ?? null,
              presenceStatus: u.presenceStatus ?? nextStatus,
            }
          : null,
      );
    } catch {
      setSessionUser((prev) => (prev ? { ...prev, presenceStatus: previousPresence } : null));
    }
  }, []);

  const restorePresenceAfterAutoCall = useCallback(async (fallbackStatus?: PresenceStatus) => {
    const previousPresence =
      presenceBeforeAutoCallRef.current ??
      readStoredAutoCallPresence() ??
      fallbackStatus ??
      "online";
    if (!previousPresence) return;
    presenceBeforeAutoCallRef.current = null;
    writeStoredAutoCallPresence(null);
    await syncPresenceWhileInCall(previousPresence);
  }, [syncPresenceWhileInCall]);

  const endActiveCallSessionForSwitch = useCallback(async () => {
    const s = activeCallSessionRef.current;
    if (
      s &&
      s.conversationKind === "direct" &&
      isChatApiConversationId(s.conversationId)
    ) {
      try {
        await voiceCallEndSessionRequest(s.conversationId);
      } catch {
        /* encerra na mesma localmente */
      }
    }
    setActiveCallSession(null);
  }, []);

  const applyCallAnsweredFromPayload = useCallback((p: CallAnsweredPayload) => {
    void (async () => {
      await endActiveCallSessionForSwitch();
      setCallMicMuted(false);
      setCallCameraOff(true);
      const listRow = chatConversationListRef.current.find((c) => c.id === p.conversationId);
      const conversationName =
        p.conversationKind === "group" && listRow?.kind === "group"
          ? listRow.title
          : p.peerName;
      setActiveCallSession(buildActiveCallSession({ ...p, peerName: conversationName }));
      setSelectedConversation({
        id: p.conversationId,
        name: conversationName,
        kind: p.conversationKind,
        ...(p.conversationKind === "group" && listRow?.kind === "group"
          ? { groupSubtype: listRow.groupSubtype ?? "channel" }
          : {}),
        ...(p.conversationKind === "direct" && listRow?.kind === "direct"
          ? { peerUserId: listRow.peerUserId, peerAvatarUrl: listRow.peerAvatarUrl }
          : {}),
      });
      setPlatformMenu("messages");
      if (isTauri()) {
        try {
          const win = getCurrentWindow();
          await win.unminimize();
          await win.setFocus();
        } catch {
          /* permissao ou SO */
        }
      }
    })();
  }, [endActiveCallSessionForSwitch]);

  const handleEndActiveCallSession = useCallback(async () => {
    await endActiveCallSessionForSwitch();
  }, [endActiveCallSessionForSwitch]);

  const friendPeerIds = useMemo(
    () => new Set(chatFriendsRows.map((r) => r.peer.id)),
    [chatFriendsRows],
  );

  const groupMembersBase =
    selectedConversation?.kind === "group"
      ? groupMembersByConversationId[selectedConversation.id] ?? []
      : [];

  const groupMembers = useMemo((): Array<GroupMemberRow & { isFriend: boolean }> => {
    return groupMembersBase.map((m) => ({
      ...m,
      isFriend: friendPeerIds.has(m.id),
    }));
  }, [groupMembersBase, friendPeerIds]);

  /** Peer da conversa directa: estado local ou linha da lista (ex.: após atender chamada sem `peerUserId` no estado). */
  const directThreadPeerUserId = useMemo((): string | null => {
    if (!selectedConversation || selectedConversation.kind !== "direct") return null;
    if (!isChatApiConversationId(selectedConversation.id)) return null;
    if (selectedConversation.peerUserId) return selectedConversation.peerUserId;
    const row = chatConversationList.find((c) => c.id === selectedConversation.id);
    return row?.kind === "direct" ? row.peerUserId : null;
  }, [selectedConversation, chatConversationList]);

  /** Bolinha no cabeçalho: tempo real ou lista de amigos (API inclui offline = invisível). */
  const directChatPeerPresence = useMemo((): PresenceStatus | null => {
    if (!directThreadPeerUserId) return null;
    return (
      peerPresenceLive[directThreadPeerUserId] ??
      chatFriendsRows.find((r) => r.peer.id === directThreadPeerUserId)?.peer.presenceStatus ??
      "invisible"
    );
  }, [directThreadPeerUserId, peerPresenceLive, chatFriendsRows]);

  /** Avatar na thread: contacto (direct) ou grupo (API). */
  const chatThreadAvatarUrl = useMemo((): string | null => {
    if (!selectedConversation || !isChatApiConversationId(selectedConversation.id)) return null;
    const row = chatConversationList.find((c) => c.id === selectedConversation.id);
    if (selectedConversation.kind === "direct") {
      return (
        selectedConversation.peerAvatarUrl ??
        (row?.kind === "direct" ? row.peerAvatarUrl : null) ??
        null
      );
    }
    if (selectedConversation.kind === "group") {
      return (
        selectedConversation.groupAvatarUrl ??
        (row?.kind === "group" ? row.avatarUrl : null) ??
        null
      );
    }
    return null;
  }, [selectedConversation, chatConversationList]);

  const conversationMessages: ChatMessage[] = useMemo(() => {
    if (!selectedConversation?.id) return [];
    const id = selectedConversation.id;
    let base: ChatMessage[];
    const cached = conversationMessagesById[id];
    if (cached) base = cached;
    else if (isChatApiConversationId(id)) base = [];
    else base = getMockConversationMessages(id);
    if (selectedConversation.kind === "direct" && isChatApiConversationId(id)) {
      return applyOutgoingReceipts(base, peerLastReadAtByConversationId[id] ?? null);
    }
    return base;
  }, [
    selectedConversation?.id,
    selectedConversation?.kind,
    conversationMessagesById,
    peerLastReadAtByConversationId,
  ]);

  const showThreadSkeleton = useMemo(() => {
    if (!selectedConversation?.id) return false;
    if (!isChatApiConversationId(selectedConversation.id)) return false;
    return (
      threadMessagesLoading &&
      (conversationMessagesById[selectedConversation.id]?.length ?? 0) === 0
    );
  }, [selectedConversation?.id, threadMessagesLoading, conversationMessagesById]);

  /** Skeleton por cima da lista até o scroll inicial (lista monta por baixo para medir/virtualizar). */
  const threadScrollSettling = useMemo(() => {
    const conversationId = selectedConversation?.id ?? null;
    if (!conversationId) return false;
    return (
      threadScrollReadyConversationId !== conversationId &&
      conversationMessages.length > 0
    );
  }, [selectedConversation?.id, threadScrollReadyConversationId, conversationMessages.length]);

  const handleThreadScrollSettled = useCallback(() => {
    const conversationId = selectedConversationRef.current?.id ?? null;
    if (!conversationId) return;
    setThreadScrollReadyConversationId(conversationId);
  }, []);

  useEffect(() => {
    if (!selectedConversation?.id) {
      setThreadScrollReadyConversationId(null);
    }
  }, [selectedConversation?.id]);

  useEffect(() => {
    if (!selectedConversation?.id) return;
    if (conversationMessages.length > 0) return;
    if (threadMessagesLoading) return;
    setThreadScrollReadyConversationId(selectedConversation.id);
  }, [
    selectedConversation?.id,
    conversationMessages.length,
    threadMessagesLoading,
  ]);

  /** Tela de ligação só sobre o painel da conversa (não cobre sidebars nem título da app). */
  const showCallOverlayInThread = useMemo(
    () =>
      activeCallSession != null &&
      platformMenu === "messages" &&
      selectedConversation?.id === activeCallSession.conversationId,
    [activeCallSession, platformMenu, selectedConversation?.id],
  );

  const showFullCallOverlay = useMemo(
    () => showCallOverlayInThread && !callMinimizedForChat,
    [showCallOverlayInThread, callMinimizedForChat],
  );

  const directP2pVoiceCallActive = useMemo(
    () =>
      activeCallSession != null &&
      activeCallSession.conversationKind === "direct" &&
      activeCallSession.roomLayout === "p2p" &&
      (activeCallSession.callRole === "caller" || activeCallSession.callRole === "callee"),
    [activeCallSession],
  );

  const activeGroupRoomConferenceId = useMemo((): string | null => {
    if (
      !activeCallSession ||
      activeCallSession.callSessionType !== "group_room" ||
      activeCallSession.conversationKind !== "group" ||
      activeCallSession.roomLayout !== "conference"
    ) {
      return null;
    }
    return activeCallSession.conversationId;
  }, [activeCallSession]);

  const activeGroupCallConferenceId = useMemo((): string | null => {
    if (
      !activeCallSession ||
      activeCallSession.callSessionType !== "group_call" ||
      activeCallSession.conversationKind !== "group" ||
      activeCallSession.roomLayout !== "conference"
    ) {
      return null;
    }
    return activeCallSession.conversationId;
  }, [activeCallSession]);

  const groupConferenceMediaActive = useMemo(
    () => Boolean(activeGroupRoomConferenceId || activeGroupCallConferenceId),
    [activeGroupCallConferenceId, activeGroupRoomConferenceId],
  );

  const activeCallPeerUserId = useMemo((): string | null => {
    if (!activeCallSession || activeCallSession.conversationKind !== "direct") return null;
    if (!isChatApiConversationId(activeCallSession.conversationId)) return null;
    const selectedPeer =
      selectedConversation?.id === activeCallSession.conversationId &&
      selectedConversation.kind === "direct"
        ? (selectedConversation.peerUserId ?? null)
        : null;
    if (selectedPeer) return selectedPeer;
    const row = chatConversationList.find((c) => c.id === activeCallSession.conversationId);
    return row?.kind === "direct" ? row.peerUserId : null;
  }, [activeCallSession, selectedConversation, chatConversationList]);

  const activeCallPeerPresence = useMemo((): PresenceStatus | null => {
    if (!activeCallPeerUserId) return null;
    return (
      peerPresenceLive[activeCallPeerUserId] ??
      chatFriendsRows.find((r) => r.peer.id === activeCallPeerUserId)?.peer.presenceStatus ??
      "invisible"
    );
  }, [activeCallPeerUserId, peerPresenceLive, chatFriendsRows]);

  useEffect(() => {
    if (!activeGroupRoomConferenceId) return;
    setGroupRemoteSpeakingByUserId({});
    setGroupRemoteMicMutedByUserId({});
    setGroupRemoteCameraOffByUserId({});
    const conversationId = activeGroupRoomConferenceId;
    void emitGroupAudioRoomJoin({ conversationId })
      .then((res) => {
        if (!res?.ok || !Array.isArray(res.participants)) return;
        const participants = res.participants;
        setActiveCallSession((prev) => {
          if (
            !prev ||
            prev.conversationId !== conversationId ||
            prev.conversationKind !== "group" ||
            prev.roomLayout !== "conference"
          ) {
            return prev;
          }
          return {
            ...prev,
            roomParticipants: participants.map((participant) => ({
              id: participant.userId,
              name: participant.displayName,
              role: participant.role,
              isYou: sessionUserRef.current?.id === participant.userId,
              avatarUrl: participant.avatarUrl ?? null,
            })),
          };
        });
      })
      .catch(() => undefined);
    return () => {
      emitGroupAudioRoomLeave({ conversationId });
    };
  }, [activeGroupRoomConferenceId]);

  useEffect(() => {
    if (!activeGroupCallConferenceId) return;
    setGroupRemoteSpeakingByUserId({});
    setGroupRemoteMicMutedByUserId({});
    setGroupRemoteCameraOffByUserId({});
    const conversationId = activeGroupCallConferenceId;
    void emitCallConferenceJoin({ conversationId })
      .then((res) => {
        if (!res?.ok || !Array.isArray(res.participants)) return;
        const participants = res.participants;
        setActiveCallSession((prev) => {
          if (
            !prev ||
            prev.conversationId !== conversationId ||
            prev.callSessionType !== "group_call" ||
            prev.conversationKind !== "group" ||
            prev.roomLayout !== "conference"
          ) {
            return prev;
          }
          return {
            ...prev,
            roomParticipants: participants.map((participant) => ({
              id: participant.userId,
              name: participant.displayName,
              role: participant.role,
              isYou: sessionUserRef.current?.id === participant.userId,
              avatarUrl: participant.avatarUrl ?? null,
            })),
          };
        });
      })
      .catch(() => undefined);
    return () => {
      emitCallConferenceLeave({ conversationId });
    };
  }, [activeGroupCallConferenceId]);

  useEffect(() => {
    if (!directP2pVoiceCallActive || !activeCallPeerUserId) return;
    if (activeCallPeerPresence !== "invisible") return;
    setActiveCallSession(null);
  }, [directP2pVoiceCallActive, activeCallPeerUserId, activeCallPeerPresence]);

  const voiceAudio = useDirectVoiceCallAudio({
    conversationId:
      directP2pVoiceCallActive && activeCallSession ? activeCallSession.conversationId : null,
    callRole:
      directP2pVoiceCallActive && activeCallSession ? activeCallSession.callRole ?? null : null,
    enabled: directP2pVoiceCallActive,
    micMuted: callMicMuted,
    micDeviceEpoch,
    callCameraOff,
    cameraDeviceEpoch,
    peerRemoteCameraOff: directP2pVoiceCallActive ? peerRemoteCameraOff : false,
  });

  const groupCallMedia = useGroupCallMedia({
    conversationId:
      groupConferenceMediaActive
        ? (activeGroupCallConferenceId ?? activeGroupRoomConferenceId)
        : null,
    enabled: groupConferenceMediaActive,
    micMuted: callMicMuted,
    micDeviceEpoch,
    callCameraOff,
    cameraDeviceEpoch,
  });

  voiceWebRtcHandlerRef.current = directP2pVoiceCallActive
    ? voiceAudio.onWebRtcSignal
    : () => {};
  voiceMediasoupProducerRef.current = directP2pVoiceCallActive
    ? voiceAudio.onMediasoupNewProducer
    : groupConferenceMediaActive
      ? groupCallMedia.onMediasoupNewProducer
      : () => {};
  voiceMediasoupProducerClosedRef.current = directP2pVoiceCallActive
    ? voiceAudio.onMediasoupProducerClosed
    : groupConferenceMediaActive
      ? groupCallMedia.onMediasoupProducerClosed
      : () => {};

  useEffect(() => {
    if (!activeCallSession) {
      setCallMinimizedForChat(false);
      setCallMicMuted(false);
      setMicDeviceEpoch(0);
      setCallCameraOff(true);
      setCameraDeviceEpoch(0);
      setPeerRemoteSpeaking(false);
      setPeerRemoteMicMuted(false);
      setPeerRemoteCameraOff(false);
      setGroupRemoteSpeakingByUserId({});
      setGroupRemoteMicMutedByUserId({});
      setGroupRemoteCameraOffByUserId({});
    }
  }, [activeCallSession]);

  useEffect(() => {
    void loadCallLogs();
  }, [activeCallSession?.conversationId, loadCallLogs]);

  useEffect(() => {
    const currentPresence = sessionUserRef.current?.presenceStatus ?? "online";
    if (activeCallSession) {
      if (presenceBeforeAutoCallRef.current == null && currentPresence !== "on_call") {
        presenceBeforeAutoCallRef.current = currentPresence;
        writeStoredAutoCallPresence(currentPresence);
      }
      if (currentPresence !== "on_call") {
        void syncPresenceWhileInCall("on_call");
      }
      return;
    }
    if (presenceBeforeAutoCallRef.current != null || readStoredAutoCallPresence() != null) {
      if (
        presenceBeforeAutoCallRef.current != null &&
        currentPresence === presenceBeforeAutoCallRef.current
      ) {
        presenceBeforeAutoCallRef.current = null;
        writeStoredAutoCallPresence(null);
        return;
      }
      void restorePresenceAfterAutoCall();
    }
  }, [activeCallSession, restorePresenceAfterAutoCall, syncPresenceWhileInCall]);

  useEffect(() => {
    if (!sessionUser) return;
    if (activeCallSession) return;
    const stored = readStoredAutoCallPresence();
    if (sessionUser.presenceStatus !== "on_call") {
      presenceBeforeAutoCallRef.current = null;
      writeStoredAutoCallPresence(null);
      return;
    }
    void restorePresenceAfterAutoCall(stored ?? "online");
  }, [activeCallSession, restorePresenceAfterAutoCall, sessionUser]);

  useEffect(() => {
    const restoreOnClose = () => {
      const previousPresence = presenceBeforeAutoCallRef.current ?? readStoredAutoCallPresence();
      const token = getAccessToken();
      if (!previousPresence || !token) return;
      writeStoredAutoCallPresence(null);
      try {
        void fetch(`${apiOrigin()}/api/v1/auth/me/presence`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: previousPresence }),
          keepalive: true,
        });
      } catch {
        /* ignore on close */
      }
    };

    window.addEventListener("pagehide", restoreOnClose);
    window.addEventListener("beforeunload", restoreOnClose);
    return () => {
      window.removeEventListener("pagehide", restoreOnClose);
      window.removeEventListener("beforeunload", restoreOnClose);
    };
  }, []);

  useEffect(() => {
    if (!activeCallSession?.conversationId) return;
    if (!directP2pVoiceCallActive && !groupConferenceMediaActive) return;
    emitVoiceCallMicMuted({
      conversationId: activeCallSession.conversationId,
      micMuted: callMicMuted,
    });
  }, [directP2pVoiceCallActive, groupConferenceMediaActive, activeCallSession?.conversationId, callMicMuted]);

  useEffect(() => {
    if (!activeCallSession?.conversationId) return;
    if (!directP2pVoiceCallActive && !groupConferenceMediaActive) return;
    emitVoiceCallCameraOff({
      conversationId: activeCallSession.conversationId,
      cameraOff: callCameraOff,
    });
  }, [directP2pVoiceCallActive, groupConferenceMediaActive, activeCallSession?.conversationId, callCameraOff]);

  useEffect(() => {
    if (!selectedConversation) return;
    if (selectedConversation.kind !== "direct" && selectedConversation.kind !== "group") return;
    if (!isChatApiConversationId(selectedConversation.id)) {
      setThreadMessagesLoading(false);
      return;
    }
    const uid = sessionUser?.id;
    if (!uid) return;
    const convId = selectedConversation.id;
    const hasCache = (conversationMessagesById[convId]?.length ?? 0) > 0;
    if (hasCache) {
      setThreadMessagesLoading(false);
    } else {
      setThreadMessagesLoading(true);
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await getChatMessagesRequest(convId);
        if (cancelled) return;
        setPeerLastReadAtByConversationId((prev) => ({
          ...prev,
          [convId]: res.peerLastReadAt ?? null,
        }));
        const mapped = res.messages.map((m) =>
          mapApiMessageToChatMessage(m, uid, selectedConversation.name),
        );
        setConversationMessagesById((prev) => {
          const prevList = prev[convId];
          const merged = mergeServerMessagesWithPendingUploads(mapped, prevList);
          return {
            ...prev,
            [convId]: merged,
          };
        });
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setThreadMessagesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedConversation?.id, selectedConversation?.kind, selectedConversation?.name, sessionUser?.id]);

  useEffect(() => {
    if (!selectedConversation) return;
    if (selectedConversation.kind !== "direct" && selectedConversation.kind !== "group") return;
    if (!isChatApiConversationId(selectedConversation.id)) return;
    let cancelled = false;
    void (async () => {
      try {
        await markChatConversationReadRequest(selectedConversation.id);
        if (cancelled) return;
        applyNotificationsReadForConversationRef.current(selectedConversation.id);
        setChatConversationList((prev) =>
          prev.map((c) =>
            c.id === selectedConversation.id ? { ...c, unreadCount: 0 } : c,
          ),
        );
        loadChatConversationsRef.current();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedConversation?.id, selectedConversation?.kind]);

  useEffect(() => {
    if (!selectedConversation || selectedConversation.kind !== "group") return;
    if (!isChatApiConversationId(selectedConversation.id)) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await listGroupMembersRequest(selectedConversation.id);
        if (cancelled) return;
        const rows: GroupMemberRow[] = r.members.map((m) => ({
          id: m.userId,
          name: m.displayName,
          email: m.email,
          role: m.role,
          avatarUrl: m.avatarUrl,
          callStatus: m.callStatus,
        }));
        setGroupMembersByConversationId((prev) => ({
          ...prev,
          [selectedConversation.id]: rows,
        }));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedConversation?.id, selectedConversation?.kind]);

  const addCallExcludeParticipantIds = useMemo(
    () => {
      const ids = new Set(activeCallSession?.roomParticipants.map((p) => p.id) ?? []);
      if (activeCallSession?.callSessionType === "direct") {
        const directRow = chatConversationList.find(
          (row): row is Extract<ChatConversationListItem, { kind: "direct" }> =>
            row.id === activeCallSession.conversationId && row.kind === "direct",
        );
        const directPeerId =
          selectedConversation?.id === activeCallSession.conversationId &&
          selectedConversation.kind === "direct"
            ? (selectedConversation.peerUserId ?? null)
            : (directRow?.peerUserId ?? null);
        if (directPeerId) {
          ids.add(directPeerId);
        }
      }
      return ids;
    },
    [
      activeCallSession?.callSessionType,
      activeCallSession?.conversationId,
      activeCallSession?.roomParticipants,
      chatConversationList,
      selectedConversation,
    ],
  );

  const callParticipantCandidates = useMemo<ShareableContact[]>(
    () =>
      chatFriendsRows.map((row) => ({
        id: row.peer.id,
        name: `${row.peer.firstName} ${row.peer.lastName}`.trim() || row.peer.email,
        kind: "direct",
        subtitle: row.peer.email,
        avatarUrl: row.peer.avatarUrl,
      })),
    [chatFriendsRows],
  );

  /** Total de pessoas no grupo (admin entra na contagem). */
  const groupIntegrantCount = groupMembers.length;

  const mentionFilteredMembers: GroupMentionMember[] = useMemo(() => {
    if (!mentionMenu.open || selectedConversation?.kind !== "group") return [];
    const q = normalizeMentionSearch(mentionMenu.query);
    const myId = sessionUser?.id;
    const virtualAll: GroupMentionMember = {
      id: GROUP_ALL_MENTION_USER_ID,
      name: "todos",
      role: "Notificar todos",
      kind: "group_all",
    };
    const showVirtual = !q || "todos".startsWith(q) || "all".startsWith(q);
    const rest = groupMembers
      .filter((m) => {
        if (myId && m.id === myId) return false;
        if (!q) return true;
        return (
          normalizeMentionSearch(m.name).includes(q) ||
          normalizeMentionSearch(m.role).includes(q)
        );
      })
      .map(({ id, name, role, avatarUrl }) => ({ id, name, role, avatarUrl }));
    return showVirtual ? [virtualAll, ...rest] : rest;
  }, [
    groupMembers,
    mentionMenu.open,
    mentionMenu.query,
    selectedConversation?.kind,
    sessionUser?.id,
  ]);

  const syncMentionMenuFromCursor = useCallback(
    (value: string, selectionStart: number) => {
      if (selectedConversation?.kind !== "group") {
        setMentionMenu((m) => (m.open ? { ...m, open: false } : m));
        return;
      }
      const before = value.slice(0, selectionStart);
      const at = before.lastIndexOf("@");
      if (at === -1) {
        setMentionMenu((m) => (m.open ? { ...m, open: false } : m));
        return;
      }
      if (at > 0) {
        const charBefore = before[at - 1]!;
        if (charBefore !== " " && charBefore !== "\n" && charBefore !== "\t") {
          setMentionMenu((m) => (m.open ? { ...m, open: false } : m));
          return;
        }
      }
      const afterAt = before.slice(at + 1);
      if (/[\s\n]/.test(afterAt)) {
        setMentionMenu((m) => (m.open ? { ...m, open: false } : m));
        return;
      }
      const query = afterAt;
      setMentionMenu((prev) => {
        if (prev.open && prev.atIndex === at && prev.query === query) {
          return prev;
        }
        return { open: true, atIndex: at, query, highlightIndex: 0 };
      });
    },
    [selectedConversation?.kind],
  );

  useEffect(() => {
    setMentionMenu((m) => ({ ...m, open: false }));
  }, [selectedConversation?.id, selectedConversation?.kind]);

  useEffect(() => {
    setReplyingTo(null);
    setForwardModalOpen(false);
    setForwardSource(null);
  }, [selectedConversation?.id]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let bc: BroadcastChannel | undefined;

    void (async () => {
      if (isTauri()) {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<CallAnsweredPayload>(CALL_ANSWERED_EVENT, (e) => {
          applyCallAnsweredFromPayload(e.payload);
        });
      } else {
        bc = new BroadcastChannel(CALL_BROADCAST_CHANNEL);
        bc.onmessage = (ev: MessageEvent) => {
          if (ev.data?.type === "call-answered" && ev.data.payload) {
            applyCallAnsweredFromPayload(ev.data.payload as CallAnsweredPayload);
          }
        };
      }
    })();

    return () => {
      unlisten?.();
      bc?.close();
    };
  }, [applyCallAnsweredFromPayload]);

  const enterGroupAudioRoom = useCallback(() => {
    if (!selectedConversation || selectedConversation.kind !== "group") return;
    setCallMicMuted(false);
    setCallCameraOff(true);
    setActiveCallSession(
      buildActiveCallSession(
        {
          conversationId: selectedConversation.id,
          peerName: selectedConversation.name,
          conversationKind: "group",
          callSessionType: "group_room",
        },
      ),
    );
    setPlatformMenu("messages");
  }, [selectedConversation]);

  const handleConfirmAddCallParticipants = useCallback((picked: ShareableContact[]) => {
    if (picked.length === 0) return;
    const inviteeUserIds = picked.map((contact) => contact.id);
    const currentSession = activeCallSessionRef.current;
    if (!currentSession) return;

    void (async () => {
      try {
        if (currentSession.callSessionType === "direct") {
          if (!isChatApiConversationId(currentSession.conversationId)) {
            throw new Error("Conversa da ligação ainda não está sincronizada.");
          }
          const result = await createGroupCallRequest({
            sourceConversationId: currentSession.conversationId,
            inviteeUserIds,
          });
          await endActiveCallSessionForSwitch();
          setCallMicMuted(false);
          setCallCameraOff(true);
          setActiveCallSession(
            buildActiveCallSession({
              conversationId: result.conversationId,
              peerName: result.title,
              conversationKind: "group",
              callSessionType: "group_call",
              roomLayout: "conference",
              roomParticipants: [
                {
                  id: sessionUserRef.current?.id ?? "__you__",
                  name:
                    sessionUserRef.current != null
                      ? `${sessionUserRef.current.firstName} ${sessionUserRef.current.lastName}`.trim() ||
                        sessionUserRef.current.email
                      : "Você",
                  role: "admin",
                  isYou: true,
                  avatarUrl: sessionUserRef.current?.avatarUrl ?? null,
                },
              ],
            }),
          );
          setSelectedConversation({
            id: result.conversationId,
            name: result.title,
            kind: "group",
            groupSubtype: "call",
          });
          setPlatformMenu("messages");
          return;
        }

        if (currentSession.callSessionType === "group_call") {
          if (!isChatApiConversationId(currentSession.conversationId)) {
            throw new Error("Ligação em grupo inválida.");
          }
          await inviteParticipantsToGroupCallRequest(currentSession.conversationId, inviteeUserIds);
        }
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Não foi possível adicionar as pessoas na chamada agora.";
        setVoiceCallInviteError(message);
      }
    })();
  }, [endActiveCallSessionForSwitch]);

  const startDirectVoiceCall = useCallback(async () => {
    if (!selectedConversation || selectedConversation.kind !== "direct") return;
    setVoiceCallInviteError(null);
    if (!isChatApiConversationId(selectedConversation.id)) {
      setVoiceCallInviteError("Esta conversa ainda não está na API; não é possível ligar.");
      return;
    }
    try {
      await voiceCallInviteRequest(selectedConversation.id);
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : "Não foi possível notificar o contacto. Tente novamente.";
      setVoiceCallInviteError(msg);
      return;
    }
    void openCallWindow(
      selectedConversation.name,
      isDark ? "dark" : "light",
      selectedConversation.id,
      selectedConversation.kind,
      "direct",
      selectedConversation.peerAvatarUrl,
    );
  }, [selectedConversation, isDark]);

  useEffect(() => {
    if (!mentionMenu.open || mentionFilteredMembers.length === 0) return;
    const max = mentionFilteredMembers.length - 1;
    setMentionMenu((m) => {
      if (!m.open || m.highlightIndex <= max) return m;
      return { ...m, highlightIndex: max };
    });
  }, [mentionFilteredMembers.length, mentionMenu.open]);

  const resizeMessageInput = useCallback(() => {
    const textarea = messageInputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const nextHeight = Math.min(textarea.scrollHeight, MESSAGE_INPUT_MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > MESSAGE_INPUT_MAX_HEIGHT ? "auto" : "hidden";
    setMessageInputExpanded(nextHeight > 28);
  }, []);

  useEffect(() => {
    resizeMessageInput();
  }, [messageDraft, resizeMessageInput, selectedConversation]);

  const handleReplyToMessage = useCallback((message: ChatMessage) => {
    setReplyingTo(message);
  }, []);

  /** Focar o campo após o menu Radix fechar e o estado “Respondendo” renderizar. */
  useEffect(() => {
    if (replyingTo == null) return;
    const focusDraft = () => {
      messageInputRef.current?.focus({ preventScroll: true });
    };
    const t0 = window.setTimeout(focusDraft, 0);
    const t1 = window.setTimeout(focusDraft, 50);
    const t2 = window.setTimeout(focusDraft, 120);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [replyingTo?.id]);

  const handleForwardMessage = useCallback((message: ChatMessage) => {
    setForwardSource(message);
    setForwardModalOpen(true);
  }, []);

  const handleForwardConversationPick = useCallback(
    async (target: ConversationPickerItem) => {
      if (!selectedConversation || !forwardSource) return;
      const sourceName = selectedConversation.name;
      const targetConvId = target.id;
      setForwardSendError(null);

      const forwarderDisplayName =
        sessionUserRef.current != null
          ? `${sessionUserRef.current.firstName} ${sessionUserRef.current.lastName}`.trim() ||
            sessionUserRef.current.email
          : "Utilizador";

      if (isChatApiConversationId(targetConvId)) {
        const me = sessionUserRef.current;
        if (!me) {
          setForwardSendError("Sessão inválida.");
          return;
        }
        const row = chatConversationList.find((c) => c.id === targetConvId);
        if (row?.kind === "direct" && row.friendshipBlocked) {
          setForwardSendError("Não é possível encaminhar para uma conversa bloqueada.");
          return;
        }
        let body: ReturnType<typeof buildForwardSendBody>;
        try {
          body = buildForwardSendBody(forwardSource, sourceName, forwarderDisplayName);
        } catch (e) {
          const code = e instanceof Error ? e.message : "";
          if (code === "forward_deleted") {
            setForwardSendError("Não é possível encaminhar uma mensagem apagada.");
          } else if (code === "forward_no_document_url") {
            setForwardSendError("Não é possível encaminhar este ficheiro.");
          } else {
            setForwardSendError("Não foi possível preparar o encaminhamento.");
          }
          return;
        }
        try {
          const res = await sendChatMessageRequest(targetConvId, body);
          const mapped = mapApiMessageToChatMessage(res.message, me.id, target.name);
          mapped.outgoingReceipt = res.deliveredToPeer ? "delivered" : "sent";
          setConversationMessagesById((prev) => ({
            ...prev,
            [targetConvId]: [...(prev[targetConvId] ?? []), mapped],
          }));
          void loadChatConversations();
          setForwardModalOpen(false);
          setForwardSource(null);
          setForwardToastDescription(`Mensagem encaminhada para ${target.name}.`);
          setForwardSentToast(true);
        } catch {
          setForwardSendError("Não foi possível encaminhar a mensagem.");
        }
        return;
      }

      const newMsg = createForwardedChatMessage(
        forwardSource,
        targetConvId,
        sourceName,
        forwarderDisplayName,
      );
      setConversationMessagesById((prev) => {
        const base = prev[targetConvId] ?? getMockConversationMessages(targetConvId);
        return { ...prev, [targetConvId]: [...base, newMsg] };
      });
      setForwardModalOpen(false);
      setForwardSource(null);
      setForwardToastDescription(`Mensagem encaminhada para ${target.name}.`);
      setForwardSentToast(true);
    },
    [forwardSource, selectedConversation, chatConversationList, loadChatConversations],
  );

  const handleResendFailedMessage = useCallback(
    async (message: ChatMessage) => {
      if (
        (!message.sendFailed && !message.queuedOffline) ||
        !isChatApiConversationId(message.conversationId)
      ) {
        return;
      }
      const convId = message.conversationId;
      const me = sessionUserRef.current;
      if (!me) return;

      if (message.queuedOffline) {
        outboxRemove(message.id);
      }

      const listRow = chatConversationListRef.current.find((c) => c.id === convId);
      const peerName = listRow
        ? chatConversationTitle(listRow)
        : selectedConversationRef.current?.id === convId
          ? (selectedConversationRef.current?.name ?? "Contato")
          : "Contato";

      setConversationMessagesById((prev) => ({
        ...prev,
        [convId]: (prev[convId] ?? []).map((m) =>
          m.id === message.id
            ? { ...m, sendFailed: false, queuedOffline: false, outgoingReceipt: undefined }
            : m,
        ),
      }));

      try {
        const payload: Record<string, unknown> | undefined = message.replyTo
          ? {
              replyTo: {
                id: message.replyTo.id,
                snippet: message.replyTo.snippet,
                authorLabel: message.replyTo.authorLabel,
              },
            }
          : undefined;
        const res = await sendChatMessageRequest(convId, {
          kind: "text",
          text: message.text,
          ...(payload ? { payload } : {}),
        });
        const mapped = mapApiMessageToChatMessage(res.message, me.id, peerName);
        mapped.outgoingReceipt = res.deliveredToPeer ? "delivered" : "sent";
        setConversationMessagesById((prev) => ({
          ...prev,
          [convId]: (prev[convId] ?? []).map((m) => (m.id === message.id ? mapped : m)),
        }));
        void loadChatConversations();
      } catch {
        const requeue =
          message.id.startsWith("pending-") && getFeatureFlag("offlineOutbox");
        if (requeue) {
          outboxAdd({
            tempId: message.id,
            conversationId: convId,
            text: message.text,
            ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          });
        }
        setConversationMessagesById((prev) => ({
          ...prev,
          [convId]: (prev[convId] ?? []).map((m) =>
            m.id === message.id
              ? { ...m, sendFailed: true, queuedOffline: requeue ? true : false }
              : m,
          ),
        }));
      }
    },
    [loadChatConversations],
  );

  const flushOfflineOutbox = useCallback(async () => {
    if (!getFeatureFlag("offlineOutbox")) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const entries = outboxRead();
    if (entries.length === 0) return;
    const me = sessionUserRef.current;
    if (!me) return;
    for (const e of entries) {
      const listRow = chatConversationListRef.current.find((c) => c.id === e.conversationId);
      const peerName = listRow ? chatConversationTitle(listRow) : "Contato";
      try {
        const payload: Record<string, unknown> | undefined = e.replyTo
          ? { replyTo: e.replyTo }
          : undefined;
        const res = await sendChatMessageRequest(e.conversationId, {
          kind: "text",
          text: e.text,
          ...(payload ? { payload } : {}),
        });
        outboxRemove(e.tempId);
        const mapped = mapApiMessageToChatMessage(res.message, me.id, peerName);
        mapped.outgoingReceipt = res.deliveredToPeer ? "delivered" : "sent";
        setConversationMessagesById((prev) => ({
          ...prev,
          [e.conversationId]: (prev[e.conversationId] ?? []).map((m) =>
            m.id === e.tempId ? mapped : m,
          ),
        }));
        void loadChatConversations();
      } catch {
        /* mantém na fila */
      }
    }
  }, [loadChatConversations]);

  useEffect(() => {
    const onOnline = () => {
      void flushOfflineOutbox();
    };
    window.addEventListener("online", onOnline);
    if (typeof navigator !== "undefined" && navigator.onLine) {
      void flushOfflineOutbox();
    }
    return () => window.removeEventListener("online", onOnline);
  }, [flushOfflineOutbox]);

  const outboxRestoredRef = useRef(false);
  useEffect(() => {
    if (authView !== "platform" || !sessionUser) {
      outboxRestoredRef.current = false;
      return;
    }
    if (!getFeatureFlag("offlineOutbox")) return;
    if (outboxRestoredRef.current) return;
    outboxRestoredRef.current = true;
    const entries = outboxRead();
    if (entries.length === 0) return;
    setConversationMessagesById((prev) => {
      const next = { ...prev };
      for (const e of entries) {
        const list = next[e.conversationId] ?? [];
        if (list.some((m) => m.id === e.tempId)) continue;
        next[e.conversationId] = [
          ...list,
          {
            id: e.tempId,
            conversationId: e.conversationId,
            sentAt: new Date().toISOString(),
            text: e.text,
            outgoing: true,
            queuedOffline: true,
            ...(e.replyTo ? { replyTo: e.replyTo } : {}),
          },
        ];
      }
      return next;
    });
  }, [authView, sessionUser?.id]);

  const handleUndoDeleteForMe = useCallback(() => {
    if (!deleteUndo) return;
    const { message, index, convId } = deleteUndo;
    setConversationMessagesById((prev) => {
      const list = [...(prev[convId] ?? [])];
      const i = Math.min(Math.max(0, index), list.length);
      list.splice(i, 0, message);
      return { ...prev, [convId]: list };
    });
    setDeleteUndo(null);
  }, [deleteUndo]);

  const handleSendMessage = async () => {
    if (!messageDraft.trim() || !selectedConversation) return;
    if (directChatComposerLock.locked) return;
    let text = messageDraft.trim();
    if (selectedConversation.kind === "group") {
      const members = groupMembersByConversationId[selectedConversation.id] ?? [];
      text = serializeGroupMentionsForApi(text, members);
    }
    const replyTarget = replyingTo;
    setMessageDraft("");
    setReplyingTo(null);
    setMentionMenu((m) => ({ ...m, open: false }));

    const me = sessionUserRef.current;
    if (me && isChatApiConversationId(selectedConversation.id)) {
      const convId = selectedConversation.id;
      const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const replyToRef = replyTarget
        ? {
            id: replyTarget.id,
            snippet: getMessageSnippet(replyTarget),
            authorLabel: authorLabelForReply(replyTarget, selectedConversation),
          }
        : undefined;
      const offlineQueued =
        typeof navigator !== "undefined" &&
        !navigator.onLine &&
        getFeatureFlag("offlineOutbox");
      if (offlineQueued) {
        outboxAdd({
          tempId,
          conversationId: convId,
          text,
          ...(replyToRef ? { replyTo: replyToRef } : {}),
        });
      }
      const optimistic: ChatMessage = {
        id: tempId,
        conversationId: convId,
        sentAt: new Date().toISOString(),
        text,
        outgoing: true,
        ...(offlineQueued ? { queuedOffline: true } : {}),
        ...(replyToRef ? { replyTo: replyToRef } : {}),
      };
      setConversationMessagesById((prev) => {
        const base = prev[convId] ?? [];
        return { ...prev, [convId]: [...base, optimistic] };
      });
      if (offlineQueued) {
        queueMicrotask(() => resizeMessageInput());
        return;
      }
      try {
        const payload: Record<string, unknown> | undefined = replyToRef
          ? {
              replyTo: replyToRef,
            }
          : undefined;
        const res = await sendChatMessageRequest(convId, {
          kind: "text",
          text,
          ...(payload ? { payload } : {}),
        });
        const mapped = mapApiMessageToChatMessage(res.message, me.id, selectedConversation.name);
        mapped.outgoingReceipt = res.deliveredToPeer ? "delivered" : "sent";
        setConversationMessagesById((prev) => {
          const base = prev[convId] ?? [];
          return { ...prev, [convId]: base.map((m) => (m.id === tempId ? mapped : m)) };
        });
        void loadChatConversations();
      } catch {
        setConversationMessagesById((prev) => {
          const base = prev[convId] ?? [];
          return {
            ...prev,
            [convId]: base.map((m) => (m.id === tempId ? { ...m, sendFailed: true } : m)),
          };
        });
      }
      queueMicrotask(() => resizeMessageInput());
      return;
    }

    const newMsg: ChatMessage = {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      conversationId: selectedConversation.id,
      sentAt: new Date().toISOString(),
      text,
      outgoing: true,
      ...(replyTarget
        ? {
            replyTo: {
              id: replyTarget.id,
              snippet: getMessageSnippet(replyTarget),
              authorLabel: authorLabelForReply(replyTarget, selectedConversation),
            },
          }
        : {}),
    };

    setConversationMessagesById((prev) => {
      const id = selectedConversation.id;
      const base = prev[id] ?? getMockConversationMessages(id);
      return { ...prev, [id]: [...base, newMsg] };
    });

    queueMicrotask(() => resizeMessageInput());
  };

  const handleDeleteMessageForMe = useCallback((message: ChatMessage) => {
    let undoIdx = -1;
    setConversationMessagesById((prev) => {
      const id = message.conversationId;
      const list = prev[id] ?? getMockConversationMessages(id);
      undoIdx = list.findIndex((m) => m.id === message.id);
      return { ...prev, [id]: list.filter((m) => m.id !== message.id) };
    });
    if (getFeatureFlag("undoDeleteForMe") && undoIdx >= 0) {
      queueMicrotask(() =>
        setDeleteUndo({
          message: { ...message },
          index: undoIdx,
          convId: message.conversationId,
        }),
      );
    } else if (!getFeatureFlag("undoDeleteForMe")) {
      setDeleteUndo(null);
    }
  }, []);

  const handleDeleteMessageForEveryone = useCallback(
    async (message: ChatMessage) => {
      if (!isChatApiConversationId(message.conversationId)) {
        handleDeleteMessageForMe(message);
        return;
      }
      try {
        await deleteChatMessageForEveryoneRequest(message.conversationId, message.id);
        setConversationMessagesById((prev) => {
          const id = message.conversationId;
          const list = prev[id] ?? [];
          return { ...prev, [id]: list.filter((m) => m.id !== message.id) };
        });
        loadChatConversationsRef.current();
      } catch {
        /* ignore */
      }
    },
    [handleDeleteMessageForMe],
  );

  const pickGroupMention = useCallback(
    (member: GroupMentionMember) => {
      const ta = messageInputRef.current;
      if (!ta || !mentionMenu.open) return;
      const atIndex = mentionMenu.atIndex;
      const end = ta.selectionStart;
      const draft = ta.value;
      const before = draft.slice(0, atIndex);
      const after = draft.slice(end);
      const token = `@${member.name} `;
      const next = before + token + after;
      const pos = before.length + token.length;
      setMessageDraft(next);
      setMentionMenu({ open: false, atIndex: 0, query: "", highlightIndex: 0 });
      queueMicrotask(() => {
        const el = messageInputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(pos, pos);
        resizeMessageInput();
      });
    },
    [mentionMenu.open, mentionMenu.atIndex, resizeMessageInput],
  );

  const handleMessagePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = event.clipboardData?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type.startsWith("image/")) {
          event.preventDefault();
          const v = validateAttachmentForSlot(file, "image");
          if (!v.ok) {
            setAttachmentTypeRejectMessage(v.message);
            return;
          }
          const objectUrl = URL.createObjectURL(file);
          setPendingMedia((prev) => {
            if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
            return { kind: "image", file, objectUrl };
          });
          return;
        }
      }
      if (selectedConversation?.kind !== "group") return;
      const pasted = event.clipboardData?.getData("text/plain") ?? "";
      if (!/@\[/.test(pasted)) return;
      event.preventDefault();
      const ta = messageInputRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const draftNow = ta.value;
      const before = draftNow.slice(0, start);
      const after = draftNow.slice(end);
      const inserted = prettifyCanonicalMentionsInDraft(pasted);
      const merged = before + inserted + after;
      const newPos = before.length + inserted.length;
      setMessageDraft(merged);
      queueMicrotask(() => {
        const el = messageInputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(newPos, newPos);
        resizeMessageInput();
        syncMentionMenuFromCursor(merged, newPos);
      });
    },
    [resizeMessageInput, selectedConversation?.kind, syncMentionMenuFromCursor],
  );

  const handleMessageDraftChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    let value = event.target.value;
    let sel = event.target.selectionStart;
    if (selectedConversation?.kind === "group" && /@\[/.test(value)) {
      const { text, cursor } = prettifyCanonicalMentionsInDraftAtCursor(value, sel);
      value = text;
      sel = cursor;
    }
    setMessageDraft(value);
    syncMentionMenuFromCursor(value, sel);
    queueMicrotask(() => {
      const ta = messageInputRef.current;
      if (!ta || ta.value !== value) return;
      if (ta.selectionStart !== sel || ta.selectionEnd !== sel) {
        ta.setSelectionRange(sel, sel);
      }
    });
  };

  const handleMessageSelect = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    const ta = event.currentTarget;
    syncMentionMenuFromCursor(ta.value, ta.selectionStart);
  };

  const handleMessageKeyUp = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      const ta = event.currentTarget;
      syncMentionMenuFromCursor(ta.value, ta.selectionStart);
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (!mentionMenu.open) {
        const ta = event.currentTarget;
        syncMentionMenuFromCursor(ta.value, ta.selectionStart);
      }
    }
  };

  const handleMessageKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionMenu.open) {
      if (event.key === "ArrowDown" && mentionFilteredMembers.length > 0) {
        event.preventDefault();
        setMentionMenu((m) =>
          m.open
            ? {
                ...m,
                highlightIndex: Math.min(
                  m.highlightIndex + 1,
                  mentionFilteredMembers.length - 1,
                ),
              }
            : m,
        );
        return;
      }
      if (event.key === "ArrowUp" && mentionFilteredMembers.length > 0) {
        event.preventDefault();
        setMentionMenu((m) =>
          m.open ? { ...m, highlightIndex: Math.max(0, m.highlightIndex - 1) } : m,
        );
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionMenu((m) => ({ ...m, open: false }));
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const pick = mentionFilteredMembers[mentionMenu.highlightIndex];
        if (pick) pickGroupMention(pick);
        else setMentionMenu((m) => ({ ...m, open: false }));
        return;
      }
    }

    if (event.key !== "Enter") return;
    if (event.shiftKey) return;
    event.preventDefault();
    void handleSendMessage();
  };

  const handleEmojiInsert = (emoji: string) => {
    setMessageDraft((current) => current + emoji);
    queueMicrotask(() => messageInputRef.current?.focus());
  };

  const clearPendingMedia = useCallback(() => {
    setPendingMedia((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  }, []);

  const clearPendingDocument = useCallback(() => {
    setPendingDocument((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  }, []);

  const clearContactShareAttachment = useCallback(() => {
    setContactShareAttachment(null);
  }, []);

  const handleImageAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const v = validateAttachmentForSlot(file, "image");
    if (!v.ok) {
      setAttachmentTypeRejectMessage(v.message);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPendingMedia((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return { kind: "image", file, objectUrl };
    });
  };

  const handleVideoAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const v = validateAttachmentForSlot(file, "video");
    if (!v.ok) {
      setAttachmentTypeRejectMessage(v.message);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPendingMedia((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return { kind: "video", file, objectUrl };
    });
  };

  const handleAudioAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const v = validateAttachmentForSlot(file, "audio");
    if (!v.ok) {
      setAttachmentTypeRejectMessage(v.message);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPendingMedia((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return { kind: "audio", file, objectUrl };
    });
  };

  const handleDocumentAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const v = validateDocumentAttachment(file);
    if (!v.ok) {
      setAttachmentTypeRejectMessage(v.message);
      return;
    }
    const objectUrl = isPdfAttachment(file) ? URL.createObjectURL(file) : null;
    setPendingDocument((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return { file, objectUrl };
    });
  };

  const handleComposerDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/")) {
      const v = validateAttachmentForSlot(file, "image");
      if (!v.ok) {
        setAttachmentTypeRejectMessage(v.message);
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      setPendingMedia((prev) => {
        if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
        return { kind: "image", file, objectUrl };
      });
      return;
    }
    if (file.type.startsWith("video/")) {
      const v = validateAttachmentForSlot(file, "video");
      if (!v.ok) {
        setAttachmentTypeRejectMessage(v.message);
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      setPendingMedia((prev) => {
        if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
        return { kind: "video", file, objectUrl };
      });
    }
  }, []);

  const handleAttachmentSelect = (option: AttachmentMenuOption) => {
    if (option === "imagem") {
      setAttachmentMenuOpen(false);
      queueMicrotask(() => imageAttachmentInputRef.current?.click());
      return;
    }
    if (option === "video") {
      setAttachmentMenuOpen(false);
      queueMicrotask(() => videoAttachmentInputRef.current?.click());
      return;
    }
    if (option === "audio") {
      setAttachmentMenuOpen(false);
      queueMicrotask(() => audioAttachmentInputRef.current?.click());
      return;
    }
    if (option === "documento") {
      setAttachmentMenuOpen(false);
      queueMicrotask(() => documentAttachmentInputRef.current?.click());
      return;
    }
    if (option === "contato") {
      setAttachmentMenuOpen(false);
      setContactShareAttachment({ step: "list" });
      return;
    }
  };

  const togglePreviewPlayback = () => {
    const el = previewAudioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const handleSendVoiceMessage = () => {
    const conv = selectedConversation;
    if (conv && isChatApiConversationId(conv.id)) {
      voiceRecorder.sendPreview(async (blob, mimeType) => {
        const ext = mimeType.includes("webm")
          ? "webm"
          : mimeType.includes("mp4")
            ? "m4a"
            : "ogg";
        const f = new File([blob], `voice.${ext}`, { type: mimeType });
        await sendApiChatAttachment(conv.id, conv.name, f, f.name, "audio", "");
        setVoiceSentToast(true);
      });
      return;
    }
    voiceRecorder.sendPreview();
    setVoiceSentToast(true);
  };

  useEffect(() => {
    if (voiceRecorder.phase !== "preview") {
      setPreviewPlaying(false);
      setPreviewAudioTime({ current: 0, duration: 0 });
    }
  }, [voiceRecorder.phase]);

  const openConversationFromContacts = useCallback(
    async (peer: ContactPeer) => {
      const name = `${peer.firstName} ${peer.lastName}`.trim() || peer.email;
      setPlatformMenu("messages");
      try {
        const r = await ensureDirectConversationRequest(peer.id);
        setSelectedConversation({
          id: r.conversationId,
          name,
          kind: "direct",
          peerUserId: peer.id,
          peerAvatarUrl: peer.avatarUrl,
        });
        await loadChatConversations();
      } catch {
        /* ignore */
      }
    },
    [loadChatConversations],
  );

  applyNotificationsReadForConversationRef.current = (conversationId: string) => {
    setNotifications((prev) => {
      let delta = 0;
      const next = prev.map((n) => {
        if (
          n.kind === "chat_message" &&
          !n.read &&
          n.data.conversationId === conversationId
        ) {
          delta++;
          return { ...n, read: true };
        }
        return n;
      });
      if (delta > 0) {
        setNotificationsUnread((u) => Math.max(0, u - delta));
      }
      return next;
    });
  };

  notificationHandlerRef.current = (n: AppNotificationItem) => {
    const seenBefore = processedNotificationIdsRef.current.has(n.id);
    if (!seenBefore) {
      processedNotificationIdsRef.current.add(n.id);
    }
    setNotifications((prev) => {
      const idx = prev.findIndex((x) => x.id === n.id);
      if (idx >= 0) {
        return prev.map((x, i) => (i === idx ? n : x));
      }
      return [n, ...prev].slice(0, 50);
    });
    const isFreshRow = !seenBefore;
    const ps = sessionUser?.presenceStatus ?? "online";
    /** Som de mensagem vem só de `onChatMessage` (aberta + silenciar). Aqui: pedidos de amizade, etc. */
    if (
      isFreshRow &&
      !n.read &&
      (ps === "online" || ps === "busy" || ps === "on_call") &&
      n.kind !== "chat_message"
    ) {
      playNotificationChime();
    }
    if (isFreshRow) {
      const skipNativeForMutedChat =
        n.kind === "chat_message" &&
        isConversationMutedForNotifications(
          n.data.conversationId,
          conversationMutedByIdRef.current,
          chatConversationListRef.current,
        );
      if (!skipNativeForMutedChat) {
        void showNativeNotification({
          title: n.title?.trim() || "SyncYou",
          body: n.body?.trim() || "",
        });
      }
    }
    if (isFreshRow && !n.read) {
      setNotificationsUnread((u) => u + 1);
    }
    if (n.kind === "friend_request" && isFreshRow) {
      setContactsIncomingCount((c) => c + 1);
    }
  };

  const handleNotificationNavigate = useCallback(async (n: AppNotificationItem) => {
    try {
      if (!n.read) {
        await markNotificationRead(n.id);
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
        setNotificationsUnread((u) => Math.max(0, u - 1));
      }
    } catch {
      /* ignore */
    }
    if (n.kind === "friend_request") {
      setPlatformMenu("contacts");
      setContactsSection("requests");
      setSelectedConversation(null);
    }
    if (n.kind === "chat_message") {
      const { conversationId, actor } = n.data;
      const row = chatConversationListRef.current.find((item) => item.id === conversationId);
      setPlatformMenu("messages");
      if (row?.kind === "group") {
        setSelectedConversation({
          id: row.id,
          name: row.title,
          kind: "group",
          groupSubtype: row.groupSubtype ?? "channel",
          ...(row.avatarUrl ? { groupAvatarUrl: row.avatarUrl } : {}),
        });
      } else if (row?.kind === "direct") {
        setSelectedConversation({
          id: row.id,
          name: row.peerName,
          kind: "direct",
          peerUserId: row.peerUserId,
          peerAvatarUrl: row.peerAvatarUrl,
        });
      } else {
        const name = `${actor.firstName} ${actor.lastName}`.trim() || "Contato";
        setSelectedConversation({
          id: conversationId,
          name,
          kind: "direct",
          peerUserId: actor.id,
          peerAvatarUrl: actor.avatarUrl,
        });
      }
      setMessagesScrollToBottomKey((k) => k + 1);
    }
  }, []);

  const handleMarkAllNotificationsRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((x) => ({ ...x, read: true })));
      setNotificationsUnread(0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (authView !== "platform" || !sessionUser) return;
    let cancelled = false;
    setNotificationsLoading(true);
    setChatListInitialLoading(true);
    void (async () => {
      try {
        const [notif, reqs, blockedRes, friendsRes, callsRes] = await Promise.all([
          listNotificationsRequest(),
          listContactsRequests(),
          listContactsBlocked(),
          listContactsFriends(),
          listCallLogsRequest(),
        ]);
        if (cancelled) return;
        notif.items.forEach((i) => processedNotificationIdsRef.current.add(i.id));
        setNotifications((prev) => {
          const merged = new Map(notif.items.map((i) => [i.id, i]));
          for (const p of prev) {
            if (!merged.has(p.id)) merged.set(p.id, p);
          }
          return [...merged.values()]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 50);
        });
        setNotificationsUnread(notif.unreadCount);
        setContactsIncomingCount(reqs.incoming.length);
        setContactsBlockedCount(blockedRes.blocked.length);
        setContactsFriendsCount(friendsRes.friends.length);
        setChatFriendsRows(friendsRes.friends);
        setCallLogs(callsRes.calls);
        setContactOutgoingRequestPeerIds(new Set(reqs.outgoing.map((x) => x.peer.id)));
        try {
          const chats = await listChatConversationsRequest({ days: 7 });
          if (!cancelled) {
            setChatConversationList(chats.conversations);
            setChatListHasMore(chats.hasMore);
            chatListNextCursorRef.current = chats.nextCursorEnd;
            chatListHasMoreRef.current = chats.hasMore;
          }
        } catch {
          if (!cancelled) {
            setChatConversationList([]);
            setChatListHasMore(false);
            chatListNextCursorRef.current = null;
            chatListHasMoreRef.current = false;
          }
        }
      } catch {
        if (!cancelled) {
          setNotifications([]);
          setNotificationsUnread(0);
          setContactsBlockedCount(0);
          setContactsFriendsCount(0);
          setChatFriendsRows([]);
          setCallLogs([]);
          setChatConversationList([]);
          setContactOutgoingRequestPeerIds(new Set());
        }
      } finally {
        if (!cancelled) {
          setNotificationsLoading(false);
          setChatListInitialLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authView, sessionUser?.id]);

  const friendshipUpdateRef = useRef<() => void>(() => {});
  friendshipUpdateRef.current = () => {
    setContactsRemoteRefreshKey((k) => k + 1);
    void Promise.all([listContactsFriends(), listContactsBlocked(), listContactsRequests()])
      .then(([f, b, r]) => {
        setContactsFriendsCount(f.friends.length);
        setContactsBlockedCount(b.blocked.length);
        setContactsIncomingCount(r.incoming.length);
        setChatFriendsRows(f.friends);
        setContactOutgoingRequestPeerIds(new Set(r.outgoing.map((x) => x.peer.id)));
      })
      .catch(() => {
        /* ignore */
      });
    loadChatConversationsRef.current();
  };

  const sendFriendRequestToPeer = useCallback(async (userId: string) => {
    try {
      await inviteContactByUserId(userId);
      friendshipUpdateRef.current();
      setFriendRequestFeedback({
        variant: "success",
        message: "Pedido de amizade enviado.",
      });
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : "Não foi possível enviar o pedido de amizade.";
      setFriendRequestFeedback({ variant: "error", message: msg });
    }
  }, []);

  const groupMentionsForChat: GroupMentionHandlers | null = useMemo(() => {
    if (selectedConversation?.kind !== "group") return null;
    return {
      currentUserId: sessionUser?.id ?? null,
      isPeerFriend: (userId: string) => friendPeerIds.has(userId),
      hasOutgoingFriendRequest: (userId: string) => contactOutgoingRequestPeerIds.has(userId),
      onAddFriend: (userId: string) => {
        void sendFriendRequestToPeer(userId);
      },
      onChat: async (userId: string, displayName: string) => {
        setPlatformMenu("messages");
        await startDirectChat(userId, displayName);
      },
      onViewContact: (_userId: string) => {
        setPlatformMenu("contacts");
        setContactsSection("friends");
      },
    };
  }, [
    selectedConversation?.kind,
    sessionUser?.id,
    friendPeerIds,
    contactOutgoingRequestPeerIds,
    sendFriendRequestToPeer,
    startDirectChat,
  ]);

  const refreshChatFriendsForNewChat = useCallback(() => {
    void listContactsFriends()
      .then((r) => setChatFriendsRows(r.friends))
      .catch(() => {
        /* ignore */
      });
  }, []);

  useEffect(() => {
    if (authView !== "platform") return;
    void syncWindowAttentionRef();
    const bump = () => void syncWindowAttentionRef();
    document.addEventListener("visibilitychange", bump);
    window.addEventListener("focus", bump);
    window.addEventListener("blur", bump);
    return () => {
      document.removeEventListener("visibilitychange", bump);
      window.removeEventListener("focus", bump);
      window.removeEventListener("blur", bump);
    };
  }, [authView, syncWindowAttentionRef]);

  useEffect(() => {
    if (authView !== "platform") {
      emitChatFocus(null);
      return;
    }
    if (
      platformMenu === "messages" &&
      selectedConversation &&
      isChatApiConversationId(selectedConversation.id)
    ) {
      emitChatFocus(selectedConversation.id);
    } else {
      emitChatFocus(null);
    }
  }, [authView, platformMenu, selectedConversation?.id]);

  useEffect(() => {
    if (authView !== "platform") return;
    return bindSessionSocket(() => void handleLogoutRef.current(), {
      onSocketDisconnected: () => {
        const cur = activeCallSessionRef.current;
        if (
          cur &&
          cur.conversationKind === "direct" &&
          cur.roomLayout === "p2p"
        ) {
          setActiveCallSession(null);
        }
      },
      onNotification: (payload) => {
        const n = payload as AppNotificationItem;
        notificationHandlerRef.current(n);
      },
      onFriendshipUpdate: () => {
        friendshipUpdateRef.current();
      },
      onPeerPresence: (payload) => {
        const p = payload as { peerUserId?: string; presenceStatus?: PresenceStatus };
        const peerId = typeof p.peerUserId === "string" ? p.peerUserId : "";
        if (!peerId) return;
        const s = p.presenceStatus;
        if (s !== "online" && s !== "away" && s !== "busy" && s !== "invisible" && s !== "on_call") return;
        setPeerPresenceLive((prev) => ({ ...prev, [peerId]: s }));
      },
      onChatMessage: (payload) => {
        const p = payload as {
          conversationId?: string;
          message?: ChatMessageApi;
          /** Definido pelo servidor: preferência «silenciar» do destinatário (evita som com lista desactualizada). */
          muted?: boolean;
        };
        const cid = p.conversationId;
        const msg = p.message;
        if (!cid || !msg) return;
        const me = sessionUserRef.current;
        if (!me) return;
        const sel = selectedConversationRef.current;
        const onMessagesPanel = platformMenuRef.current === "messages";
        const viewingThisConversation =
          onMessagesPanel && sel != null && sel.id === cid;
        const ps = sessionUserRef.current?.presenceStatus ?? "online";
        const row = chatConversationListRef.current.find((c) => c.id === cid);
        const isMuted =
          p.muted === true ||
          isConversationMutedForNotifications(
            cid,
            conversationMutedByIdRef.current,
            chatConversationListRef.current,
          );
        const allowChimeByPresence = ps === "online" || ps === "busy" || ps === "on_call";
        const playIncomingChime = () => {
          if (msg.senderId === me.id) return;
          if (!allowChimeByPresence || isMuted) return;
          /** Só toca se esta conversa não estiver aberta; silenciada: mapa + lista. */
          if (viewingThisConversation) return;
          playNotificationChime();
        };
        playIncomingChime();
        const peerName = row ? chatConversationTitle(row) : "Contato";
        const mapped = mapApiMessageToChatMessage(msg, me.id, peerName);
        setConversationMessagesById((prev) => {
          const existing = prev[cid] ?? [];
          if (existing.some((m) => m.id === mapped.id)) return prev;
          return { ...prev, [cid]: [...existing, mapped] };
        });
        loadChatConversationsRef.current();
        if (sel && sel.id === cid) {
          void markChatConversationReadRequest(cid).then(() => {
            applyNotificationsReadForConversationRef.current(cid);
            setChatConversationList((prev) =>
              prev.map((c) => (c.id === cid ? { ...c, unreadCount: 0 } : c)),
            );
            loadChatConversationsRef.current();
          });
        }
      },
      onChatRead: (payload) => {
        const p = payload as { conversationId?: string; lastReadAt?: string };
        if (!p.conversationId || !p.lastReadAt) return;
        setPeerLastReadAtByConversationId((prev) => ({
          ...prev,
          [p.conversationId!]: p.lastReadAt!,
        }));
      },
      onChatConversationCreated: (payload) => {
        const p = payload as { conversation?: ChatConversationListItem };
        const row = p.conversation;
        if (!row || row.kind !== "group") return;
        setChatConversationList((prev) => {
          if (prev.some((c) => c.id === row.id)) {
            return prev.map((c) => (c.id === row.id ? row : c));
          }
          const next = [...prev, row];
          next.sort((a, b) => {
            const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
            const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
            return tb - ta;
          });
          return next;
        });
      },
      onIncomingCall: (payload) => {
        const p = payload as {
          callerUserId?: string;
          callerName?: string;
          callerAvatarUrl?: string | null;
          conversationId?: string;
          conversationKind?: string;
          callSessionType?: string;
        };
        const me = sessionUserRef.current;
        if (!me || p.callerUserId === me.id) return;
        if (typeof p.callerName !== "string" || typeof p.conversationId !== "string") return;
        const kind = p.conversationKind === "group" ? "group" : "direct";
        const callSessionType =
          p.callSessionType === "group_call"
            ? "group_call"
            : p.callSessionType === "group_room"
              ? "group_room"
              : "direct";
        void showNativeNotification({
          title: "Chamada de voz",
          body: `${p.callerName} está a ligar`,
        });
        void openIncomingCallWindow(
          p.callerName,
          isDarkRef.current ? "dark" : "light",
          p.conversationId,
          kind,
          callSessionType,
          typeof p.callerAvatarUrl === "string" ? p.callerAvatarUrl : null,
        );
      },
      onVoiceCallAnswered: (payload) => {
        const p = payload as CallAnsweredPayload;
        if (
          typeof p.conversationId !== "string" ||
          typeof p.peerName !== "string" ||
          (p.conversationKind !== "direct" && p.conversationKind !== "group")
        ) {
          return;
        }
        applyCallAnsweredFromPayload(p);
      },
      onVoiceCallSessionEnded: (payload) => {
        const p = payload as { conversationId?: string };
        if (typeof p.conversationId !== "string") return;
        const cur = activeCallSessionRef.current;
        if (cur && cur.conversationId === p.conversationId) {
          setActiveCallSession(null);
        }
      },
      onVoiceCallWebRtcSignal: (payload) => {
        voiceWebRtcHandlerRef.current(payload as VoiceCallWebRtcSignalPayload);
      },
      onMediasoupNewProducer: (payload) => {
        voiceMediasoupProducerRef.current(payload as MediasoupNewProducerPayload);
      },
      onMediasoupProducerClosed: (payload) => {
        voiceMediasoupProducerClosedRef.current(
          payload as import("@/lib/session-socket").MediasoupClosedProducerPayload,
        );
      },
      onGroupAudioRoomParticipants: (payload: GroupAudioRoomParticipantsPayload) => {
        setActiveCallSession((prev) => {
          if (
            !prev ||
            prev.conversationId !== payload.conversationId ||
            prev.callSessionType !== "group_room" ||
            prev.conversationKind !== "group" ||
            prev.roomLayout !== "conference"
          ) {
            return prev;
          }
          return {
            ...prev,
            roomParticipants: payload.participants.map((participant) => ({
              id: participant.userId,
              name: participant.displayName,
              role: participant.role,
              isYou: sessionUserRef.current?.id === participant.userId,
              avatarUrl: participant.avatarUrl ?? null,
            })),
          };
        });
      },
      onCallConferenceParticipants: (payload: CallConferenceParticipantsPayload) => {
        setActiveCallSession((prev) => {
          if (
            !prev ||
            prev.conversationId !== payload.conversationId ||
            prev.callSessionType !== "group_call" ||
            prev.conversationKind !== "group" ||
            prev.roomLayout !== "conference"
          ) {
            return prev;
          }
          return {
            ...prev,
            roomParticipants: payload.participants.map((participant) => ({
              id: participant.userId,
              name: participant.displayName,
              role: participant.role,
              isYou: sessionUserRef.current?.id === participant.userId,
              avatarUrl: participant.avatarUrl ?? null,
            })),
          };
        });
      },
      onVoiceCallVoiceActivity: (payload: VoiceCallVoiceActivityPayload) => {
        const me = sessionUserRef.current;
        if (!me || payload.fromUserId === me.id) return;
        const cur = activeCallSessionRef.current;
        if (!cur || cur.conversationId !== payload.conversationId) return;
        if (cur.conversationKind === "direct" && cur.roomLayout === "p2p") {
          setPeerRemoteSpeaking(payload.speaking);
          return;
        }
        if (cur.conversationKind === "group" && cur.roomLayout === "conference") {
          setGroupRemoteSpeakingByUserId((prev) => ({
            ...prev,
            [payload.fromUserId]: payload.speaking,
          }));
        }
      },
      onVoiceCallMicMuted: (payload: VoiceCallMicMutedPayload) => {
        const me = sessionUserRef.current;
        if (!me || payload.fromUserId === me.id) return;
        const cur = activeCallSessionRef.current;
        if (!cur || cur.conversationId !== payload.conversationId) return;
        if (cur.conversationKind === "direct" && cur.roomLayout === "p2p") {
          setPeerRemoteMicMuted(payload.micMuted);
          return;
        }
        if (cur.conversationKind === "group" && cur.roomLayout === "conference") {
          setGroupRemoteMicMutedByUserId((prev) => ({
            ...prev,
            [payload.fromUserId]: payload.micMuted,
          }));
        }
      },
      onVoiceCallCameraOff: (payload: VoiceCallCameraOffPayload) => {
        const me = sessionUserRef.current;
        if (!me || payload.fromUserId === me.id) return;
        const cur = activeCallSessionRef.current;
        if (!cur || cur.conversationId !== payload.conversationId) return;
        if (cur.conversationKind === "direct" && cur.roomLayout === "p2p") {
          setPeerRemoteCameraOff(payload.cameraOff);
          return;
        }
        if (cur.conversationKind === "group" && cur.roomLayout === "conference") {
          setGroupRemoteCameraOffByUserId((prev) => ({
            ...prev,
            [payload.fromUserId]: payload.cameraOff,
          }));
        }
      },
      onChatMessageDeletedForEveryone: (payload) => {
        const p = payload as {
          conversationId?: string;
          messageId?: string;
          message?: ChatMessageApi;
        };
        const cid = p.conversationId;
        const mid = p.messageId;
        if (!cid || !mid) return;
        const me = sessionUserRef.current;
        if (!me) return;
        const rowForDel = chatConversationListRef.current.find((c) => c.id === cid);
        const peerName = rowForDel ? chatConversationTitle(rowForDel) : "Contato";
        if (p.message) {
          const mapped = mapApiMessageToChatMessage(p.message, me.id, peerName);
          setConversationMessagesById((prev) => {
            const list = prev[cid] ?? [];
            const idx = list.findIndex((m) => m.id === mid);
            if (idx === -1) {
              return { ...prev, [cid]: [...list, mapped] };
            }
            const next = [...list];
            next[idx] = mapped;
            return { ...prev, [cid]: next };
          });
        } else {
          setConversationMessagesById((prev) => {
            const list = prev[cid] ?? [];
            return { ...prev, [cid]: list.filter((m) => m.id !== mid) };
          });
        }
        loadChatConversationsRef.current();
      },
    });
  }, [authView, applyCallAnsweredFromPayload]);

  if (authView === "platform") {
    const platformTitle =
      platformMenu === "messages"
        ? "Mensagens"
        : platformMenu === "contacts"
          ? "Contatos"
          : "Definições";

    return (
      <main
        data-theme={theme}
        className={`flex h-screen w-screen flex-col overflow-hidden ${isDark ? "bg-zinc-950 text-zinc-100" : "bg-zinc-100 text-zinc-900"}`}
      >
        {/* Não usar `hidden` (display:none): WebKit/Tauri não reproduz áudio remoto nesse caso. */}
        <audio
          ref={voiceAudio.remoteAudioRef}
          className="pointer-events-none fixed top-0 left-0 h-px w-px overflow-hidden opacity-0"
          playsInline
          autoPlay
          aria-hidden
        />
        <WindowTitleBar
          isDark={isDark}
          onToggleTheme={toggleTheme}
          beforeThemeToggle={
            <>
              <PresenceStatusSelect
                isDark={isDark}
                value={sessionUser?.presenceStatus ?? "online"}
                disabled={userMeLoading || !sessionUser}
                onSelect={async (status) => {
                  const previousPresence =
                    sessionUserRef.current?.presenceStatus ?? "online";
                  setSessionUser((prev) =>
                    prev ? { ...prev, presenceStatus: status } : null,
                  );
                  try {
                    const u = await updatePresenceRequest(status);
                    setSessionUser((prev) =>
                      prev
                        ? {
                            ...prev,
                            ...u,
                            avatarUrl: bustAvatarCache(u.avatarUrl),
                            hasPassword: u.hasPassword ?? false,
                            phoneWhatsapp: u.phoneWhatsapp ?? null,
                            socialDiscord: u.socialDiscord ?? null,
                            socialLinkedin: u.socialLinkedin ?? null,
                            socialYoutube: u.socialYoutube ?? null,
                            socialInstagram: u.socialInstagram ?? null,
                            socialFacebook: u.socialFacebook ?? null,
                            websiteUrl: u.websiteUrl ?? null,
                            accountDisabledAt: u.accountDisabledAt ?? null,
                            twoFactorEnabled: u.twoFactorEnabled ?? false,
                            lastSessionIp: u.lastSessionIp ?? null,
                            lastSessionCity: u.lastSessionCity ?? null,
                            lastSessionLatitude: u.lastSessionLatitude ?? null,
                            lastSessionLongitude: u.lastSessionLongitude ?? null,
                            lastSessionAt: u.lastSessionAt ?? null,
                            presenceStatus: u.presenceStatus ?? status,
                          }
                        : null,
                    );
                  } catch {
                    setSessionUser((prev) =>
                      prev ? { ...prev, presenceStatus: previousPresence } : null,
                    );
                  }
                }}
              />
              <NotificationsDropdown
                isDark={isDark}
                items={notifications.filter((n) => !n.read)}
                unreadCount={notificationsUnread}
                loading={notificationsLoading}
                onNotificationClick={handleNotificationNavigate}
                onMarkAllRead={handleMarkAllNotificationsRead}
              />
            </>
          }
          title={platformTitle}
        />
        <section className="flex min-h-0 flex-1 w-full overflow-hidden">
          <Tooltip.Provider delayDuration={120}>
            <aside
              className={`flex w-16 select-none flex-col items-center gap-3 border-r py-4 ${
                isDark ? "border-zinc-800 bg-zinc-900" : "border-zinc-300 bg-white"
              }`}
            >
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    aria-label="Mensagens"
                    onClick={() => {
                      setPlatformMenu("messages");
                    }}
                    className={getPlatformButtonClass(platformMenu === "messages")}
                  >
                    <MessageSquare size={18} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="right"
                    sideOffset={10}
                    className={`rounded-md px-2 py-1 text-xs shadow-lg ${
                      isDark ? "bg-zinc-800 text-zinc-100" : "bg-zinc-900 text-white"
                    }`}
                  >
                    Mensagens
                    <Tooltip.Arrow className={isDark ? "fill-zinc-800" : "fill-zinc-900"} />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>

              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    aria-label="Contatos"
                    onClick={() => {
                      setPlatformMenu("contacts");
                      setSelectedConversation(null);
                    }}
                    className={`relative ${getPlatformButtonClass(platformMenu === "contacts")}`}
                  >
                    <BookUser size={18} />
                    {contactsIncomingCount > 0 ? (
                      <span
                        className={`pointer-events-none absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ${
                          isDark ? "ring-zinc-900" : "ring-white"
                        }`}
                        aria-hidden
                      />
                    ) : null}
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="right"
                    sideOffset={10}
                    className={`rounded-md px-2 py-1 text-xs shadow-lg ${
                      isDark ? "bg-zinc-800 text-zinc-100" : "bg-zinc-900 text-white"
                    }`}
                  >
                    Contatos
                    <Tooltip.Arrow className={isDark ? "fill-zinc-800" : "fill-zinc-900"} />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>

              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    aria-label="Configuracoes"
                    onClick={() => {
                      setPlatformMenu("settings");
                      setSelectedConversation(null);
                      setSettingsSection("account");
                    }}
                    className={`mt-auto ${getPlatformButtonClass(platformMenu === "settings")}`}
                  >
                    <Settings size={18} />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="right"
                    sideOffset={10}
                    className={`rounded-md px-2 py-1 text-xs shadow-lg ${
                      isDark ? "bg-zinc-800 text-zinc-100" : "bg-zinc-900 text-white"
                    }`}
                  >
                    Configuracoes
                    <Tooltip.Arrow className={isDark ? "fill-zinc-800" : "fill-zinc-900"} />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </aside>
          </Tooltip.Provider>

          <aside
            className={`flex min-h-0 w-80 flex-col select-none border-r ${
              isDark ? "border-zinc-800 bg-zinc-900" : "border-zinc-300 bg-white"
            }`}
          >
            {platformMenu === "messages" ? (
              <MessagesSidebarContent
                isDark={isDark}
                conversationFlags={conversationFlags}
                onConversationFlagsChange={(id, flags) => updateConversationFlag(id, () => flags)}
                onSelectConversation={handleSelectConversation}
                apiChatConversations={chatConversationListForSidebar}
                callLogs={callLogs}
                friendsForNewChat={chatFriendsRows}
                peerPresenceLive={peerPresenceLive}
                onRefreshFriendsForNewChat={refreshChatFriendsForNewChat}
                onRefreshChatList={loadChatConversations}
                onLoadMoreChatConversations={loadMoreChatConversations}
                chatListHasMore={chatListHasMore}
                chatListLoadingMore={chatListLoadingMore}
                chatListSkeleton={chatListInitialLoading && getFeatureFlag("sidebarSkeleton")}
                onStartDirectChat={startDirectChat}
                onAfterClearConversationForMe={handleAfterClearConversationForMe}
                onToggleBlockPeer={handleToggleBlockPeer}
                onApiChatPreferencesOptimistic={applyChatConversationPreferencesLocal}
                pinnedConversationIds={pinnedConversationIds}
                onTogglePinConversation={togglePinConversation}
                mutedUntilByConversationId={mutedUntilByConversationId}
                onMuteConversationPreset={handleMuteConversationPreset}
              />
            ) : platformMenu === "settings" ? (
              <SettingsSidebarContent
                isDark={isDark}
                user={sessionUser}
                userLoading={userMeLoading}
                section={settingsSection}
                onSectionChange={setSettingsSection}
                onLogout={() => void handleLogout()}
                onAvatarFileChosen={handleSettingsAvatarFile}
                avatarUploading={isAvatarUploading}
              />
            ) : platformMenu === "contacts" ? (
              <ContactsSidebarContent
                isDark={isDark}
                section={contactsSection}
                onSectionChange={setContactsSection}
                friendsCount={contactsFriendsCount}
                incomingRequestCount={contactsIncomingCount}
                blockedCount={contactsBlockedCount}
              />
            ) : null}
          </aside>

          <section
            className={`${isDark ? "bg-zinc-950" : "bg-zinc-50"} flex min-h-0 flex-1 flex-col`}
          >
            {platformMenu === "settings" ? (
              <SettingsMainPanel
                isDark={isDark}
                section={settingsSection}
                accountPanel={
                  sessionUser ? (
                    <AccountSettingsPanel
                      isDark={isDark}
                      user={sessionUser}
                      onUserUpdated={(u) => setSessionUser(u)}
                      onAvatarFileChosen={handleSettingsAvatarFile}
                      avatarUploading={isAvatarUploading}
                      onAfterDeactivate={() => void handleLogout()}
                      onAfterDelete={() => void handleLogout()}
                    />
                  ) : null
                }
                securityPanel={
                  sessionUser ? (
                    <SecuritySettingsPanel
                      isDark={isDark}
                      user={sessionUser}
                      onUserUpdated={(u) => setSessionUser(u)}
                    />
                  ) : null
                }
                sessionsPanel={
                  sessionUser ? (
                    <SessionsSettingsPanel isDark={isDark} onLogout={() => void handleLogout()} />
                  ) : null
                }
              />
            ) : platformMenu === "messages" ? (
              selectedConversation ? (
                <div className="flex h-full min-h-0 flex-1 flex-col">
                  <header
                    className={`flex h-14 shrink-0 items-center justify-between border-b px-4 ${
                      isDark ? "border-zinc-800 bg-zinc-900" : "border-zinc-200 bg-white"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="relative shrink-0">
                        <button
                          type="button"
                          onClick={() => setShowConversationInfoModal(true)}
                          className="flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-emerald-600 text-[11px] font-semibold text-white transition hover:bg-emerald-500"
                          aria-label="Abrir detalhes da conversa"
                        >
                          {chatThreadAvatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={chatThreadAvatarUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            getInitials(selectedConversation.name)
                          )}
                        </button>
                        {selectedConversation.kind === "direct" && directChatPeerPresence != null ? (
                          <PeerPresenceDot
                            presenceStatus={directChatPeerPresence}
                            isDark={isDark}
                            size="md"
                            className="z-[1]"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold">{selectedConversation.name}</h2>
                        {activeCallSession &&
                        selectedConversation.id === activeCallSession.conversationId ? (
                          <p
                            className={`truncate text-xs tabular-nums ${
                              isDark ? "text-zinc-400" : "text-zinc-600"
                            }`}
                          >
                            Chamada em andamento ·{" "}
                            {String(Math.floor(callElapsedSec / 60)).padStart(2, "0")}:
                            {String(callElapsedSec % 60).padStart(2, "0")}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedConversation.kind === "group" ? (
                        <>
                          {(!activeCallSession ||
                            activeCallSession.callSessionType !== "group_room" ||
                            activeCallSession.conversationKind !== "group" ||
                            activeCallSession.roomLayout !== "conference" ||
                            selectedConversation.id !== activeCallSession.conversationId) ? (
                            <button
                              type="button"
                              aria-label="Entrar na sala de audio do grupo"
                              title="Entrar na sala de audio"
                              onClick={enterGroupAudioRoom}
                              className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                                isDark
                                  ? "border-emerald-700/80 bg-emerald-950/50 text-emerald-300 hover:bg-emerald-900/60"
                                  : "border-emerald-400 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                              }`}
                            >
                              <Headphones size={16} />
                            </button>
                          ) : null}
                          {activeCallSession &&
                          activeCallSession.callSessionType === "group_call" &&
                          activeCallSession.conversationKind === "group" &&
                          activeCallSession.roomLayout === "conference" &&
                          selectedConversation.id === activeCallSession.conversationId ? (
                            <button
                              type="button"
                              aria-label="Adicionar pessoas na chamada em grupo"
                              title="Adicionar participantes"
                              onClick={() => setAddCallParticipantsOpen(true)}
                              className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                                isDark
                                  ? "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                                  : "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                              }`}
                            >
                              <UserPlus size={16} />
                            </button>
                          ) : null}
                          {activeCallSession &&
                          activeCallSession.conversationKind === "group" &&
                          activeCallSession.roomLayout === "conference" &&
                          selectedConversation.id === activeCallSession.conversationId ? (
                            <button
                              type="button"
                              aria-label="Abrir chat na conversa da sala"
                              title="Chat"
                              aria-pressed={callMinimizedForChat}
                              onClick={() => setCallMinimizedForChat((v) => !v)}
                              className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                                callMinimizedForChat
                                  ? isDark
                                    ? "border-emerald-500/70 bg-emerald-700/30 text-emerald-200 ring-1 ring-emerald-500/50"
                                    : "border-emerald-500 bg-emerald-100 text-emerald-800 ring-1 ring-emerald-400/60"
                                  : isDark
                                    ? "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                                    : "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                              }`}
                            >
                              <MessageSquare size={16} />
                            </button>
                          ) : null}
                        </>
                      ) : (
                        activeCallSession &&
                        selectedConversation.id === activeCallSession.conversationId ? (
                          <>
                            <button
                              type="button"
                              aria-label="Adicionar pessoas na chamada"
                              title="Adicionar participantes"
                              onClick={() => setAddCallParticipantsOpen(true)}
                              className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                                isDark
                                  ? "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                                  : "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                              }`}
                            >
                              <UserPlus size={16} />
                            </button>
                            <button
                              type="button"
                              aria-label="Abrir chat na conversa (minimizar ligação)"
                              title="Chat"
                              aria-pressed={callMinimizedForChat}
                              onClick={() => setCallMinimizedForChat((v) => !v)}
                              className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                                callMinimizedForChat
                                  ? isDark
                                    ? "border-emerald-500/70 bg-emerald-700/30 text-emerald-200 ring-1 ring-emerald-500/50"
                                    : "border-emerald-500 bg-emerald-100 text-emerald-800 ring-1 ring-emerald-400/60"
                                  : isDark
                                    ? "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                                    : "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                              }`}
                            >
                              <MessageSquare size={16} />
                            </button>
                          </>
                        ) : (
                        <button
                          type="button"
                          aria-label="Ligar (voz)"
                          title="Ligar — notifica o contacto e abre a chamada"
                          onClick={() => void startDirectVoiceCall()}
                          className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                            isDark
                              ? "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                              : "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                          }`}
                        >
                          <PhoneCall size={16} />
                        </button>
                        )
                      )}
                      {(directP2pVoiceCallActive || groupConferenceMediaActive) &&
                      activeCallSession &&
                      selectedConversation.id === activeCallSession.conversationId &&
                      callMinimizedForChat ? (
                        <div
                          className={`ml-1 inline-flex items-center gap-2 rounded-full border px-2 py-1 ${
                            isDark
                              ? "border-zinc-700 bg-zinc-900/80"
                              : "border-zinc-300 bg-white/90"
                          }`}
                        >
                          <CallMicControl
                            isDark={isDark}
                            micMuted={callMicMuted}
                            onToggleMute={() => setCallMicMuted((v) => !v)}
                            ctrlIdle={
                              isDark
                                ? "bg-zinc-800/95 text-zinc-100 hover:bg-zinc-700"
                                : "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50"
                            }
                            ctrlActive={
                              isDark
                                ? "bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/40"
                                : "bg-amber-100 text-amber-900 ring-1 ring-amber-300/80"
                            }
                            size="sm"
                            remoteAudioRef={directP2pVoiceCallActive ? voiceAudio.remoteAudioRef : undefined}
                            onMicDeviceChange={() => setMicDeviceEpoch((e) => e + 1)}
                          />
                          <CallCameraControl
                            isDark={isDark}
                            camOff={callCameraOff}
                            onToggleCamera={() => setCallCameraOff((v) => !v)}
                            ctrlIdle={
                              isDark
                                ? "bg-zinc-800/95 text-zinc-100 hover:bg-zinc-700"
                                : "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50"
                            }
                            ctrlActive={
                              isDark
                                ? "bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/40"
                                : "bg-amber-100 text-amber-900 ring-1 ring-amber-300/80"
                            }
                            size="sm"
                            onCameraDeviceChange={() => setCameraDeviceEpoch((e) => e + 1)}
                          />
                          <button
                            type="button"
                            aria-label={
                              (directP2pVoiceCallActive
                                ? voiceAudio.screenSharingLocal
                                : groupCallMedia.screenSharingLocal)
                                ? "Parar compartilhamento"
                                : "Compartilhar tela"
                            }
                            aria-pressed={
                              directP2pVoiceCallActive
                                ? voiceAudio.screenSharingLocal
                                : groupCallMedia.screenSharingLocal
                            }
                            onClick={() =>
                              void (directP2pVoiceCallActive
                                ? voiceAudio.toggleScreenShare()
                                : groupCallMedia.toggleScreenShare())
                            }
                            className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                              (directP2pVoiceCallActive
                                ? voiceAudio.screenSharingLocal
                                : groupCallMedia.screenSharingLocal)
                                ? isDark
                                  ? "bg-emerald-600/30 text-emerald-200 ring-1 ring-emerald-400/40"
                                  : "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300/80"
                                : isDark
                                  ? "bg-zinc-800/95 text-zinc-100 hover:bg-zinc-700"
                                  : "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50"
                            }`}
                          >
                            <MonitorUp size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label="Encerrar ligacao"
                            onClick={() => void handleEndActiveCallSession()}
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-red-500 to-red-700 text-white shadow-md shadow-red-900/30 transition hover:from-red-400 hover:to-red-600"
                          >
                            <PhoneOff size={16} />
                          </button>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        aria-label="Fotos desta conversa"
                        title="Galeria de fotos"
                        onClick={() => setGalleryOpen(true)}
                        className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                          isDark
                            ? "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                            : "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                        }`}
                      >
                        <ImageIcon size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Pesquisar na conversa"
                        title="Pesquisar (/)"
                        onClick={() => setConversationSearchOpen(true)}
                        className={`flex h-9 w-9 items-center justify-center rounded-full border ${
                          isDark
                            ? "border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                            : "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                        }`}
                      >
                        <Search size={16} />
                      </button>
                    </div>
                  </header>
                  <div className="relative min-h-0 flex-1 flex flex-col">
                    {showFullCallOverlay && activeCallSession ? (
                      <div className="pointer-events-auto absolute inset-0 z-[210] flex min-h-0 flex-col">
                        <ActiveCallOverlay
                          isDark={isDark}
                          peerName={activeCallSession.peerName}
                          peerAvatarUrl={
                            activeCallSession.roomLayout === "p2p" &&
                            activeCallSession.conversationKind === "direct"
                              ? chatThreadAvatarUrl
                              : null
                          }
                          roomLayout={activeCallSession.roomLayout}
                          roomParticipants={activeCallSession.roomParticipants}
                          onEndCall={() => void handleEndActiveCallSession()}
                          micMuted={
                            directP2pVoiceCallActive || groupConferenceMediaActive
                              ? callMicMuted
                              : undefined
                          }
                          onMicMutedChange={
                            directP2pVoiceCallActive || groupConferenceMediaActive
                              ? setCallMicMuted
                              : undefined
                          }
                          peerRemoteSpeaking={
                            directP2pVoiceCallActive ? peerRemoteSpeaking : false
                          }
                          peerRemoteMicMuted={
                            directP2pVoiceCallActive ? peerRemoteMicMuted : false
                          }
                          peerRemoteCameraOff={
                            directP2pVoiceCallActive ? peerRemoteCameraOff : false
                          }
                          remoteAudioRef={
                            directP2pVoiceCallActive ? voiceAudio.remoteAudioRef : undefined
                          }
                          onMicDeviceChange={
                            directP2pVoiceCallActive || groupConferenceMediaActive
                              ? () => setMicDeviceEpoch((e) => e + 1)
                              : undefined
                          }
                          directCallVideo={directP2pVoiceCallActive}
                          camOff={callCameraOff}
                          onCamOffChange={setCallCameraOff}
                          mainStageVideoRef={
                            directP2pVoiceCallActive ? voiceAudio.mainStageVideoRef : undefined
                          }
                          pipTopVideoRef={
                            directP2pVoiceCallActive ? voiceAudio.pipTopVideoRef : undefined
                          }
                          pipBottomVideoRef={
                            directP2pVoiceCallActive ? voiceAudio.pipBottomVideoRef : undefined
                          }
                          remoteCameraStream={
                            directP2pVoiceCallActive ? voiceAudio.remoteCameraStream : undefined
                          }
                          remoteScreenStream={
                            directP2pVoiceCallActive ? voiceAudio.remoteScreenStream : undefined
                          }
                          localCameraStream={
                            directP2pVoiceCallActive
                              ? voiceAudio.localCameraStream
                              : groupConferenceMediaActive
                                ? groupCallMedia.localCameraStream
                                : undefined
                          }
                          localScreenStream={
                            directP2pVoiceCallActive
                              ? voiceAudio.localScreenStream
                              : groupConferenceMediaActive
                                ? groupCallMedia.localScreenStream
                                : undefined
                          }
                          participantMediaById={
                            groupConferenceMediaActive
                              ? {
                                  ...groupCallMedia.participantMediaById,
                                  ...(sessionUser?.id
                                    ? {
                                        [sessionUser.id]: {
                                          cameraStream: groupCallMedia.localCameraStream,
                                          screenStream: groupCallMedia.localScreenStream,
                                        },
                                      }
                                    : {}),
                                }
                              : undefined
                          }
                          participantSpeakingById={
                            groupConferenceMediaActive
                              ? {
                                  ...(sessionUser?.id
            ? { [sessionUser.id]: groupCallMedia.localSpeaking }
                                    : {}),
                                  ...groupRemoteSpeakingByUserId,
                                }
                              : undefined
                          }
                          participantMicMutedById={
                            groupConferenceMediaActive
                              ? {
                                  ...(sessionUser?.id ? { [sessionUser.id]: callMicMuted } : {}),
                                  ...groupRemoteMicMutedByUserId,
                                }
                              : undefined
                          }
                          participantCameraOffById={
                            groupConferenceMediaActive
                              ? {
                                  ...(sessionUser?.id ? { [sessionUser.id]: callCameraOff } : {}),
                                  ...groupRemoteCameraOffByUserId,
                                }
                              : undefined
                          }
                          mainStageSelection={
                            directP2pVoiceCallActive ? voiceAudio.mainStageSelection : undefined
                          }
                          onMainStageSelectionChange={
                            directP2pVoiceCallActive
                              ? voiceAudio.setMainStageSelection
                              : undefined
                          }
                          mainStagePinnedTarget={
                            directP2pVoiceCallActive
                              ? voiceAudio.mainStagePinnedTarget
                              : undefined
                          }
                          onMainStagePinnedChange={
                            directP2pVoiceCallActive
                              ? voiceAudio.setMainStagePinnedTarget
                              : undefined
                          }
                          screenSharing={
                            directP2pVoiceCallActive
                              ? voiceAudio.screenSharingLocal
                              : groupConferenceMediaActive
                                ? groupCallMedia.screenSharingLocal
                                : undefined
                          }
                          onScreenShareToggle={
                            directP2pVoiceCallActive
                              ? () => void voiceAudio.toggleScreenShare()
                              : groupConferenceMediaActive
                                ? () => void groupCallMedia.toggleScreenShare()
                                : undefined
                          }
                          onCameraDeviceChange={
                            directP2pVoiceCallActive || groupConferenceMediaActive
                              ? () => setCameraDeviceEpoch((e) => e + 1)
                              : undefined
                          }
                        />
                      </div>
                    ) : null}
                    {showCallOverlayInThread &&
                    callMinimizedForChat &&
                    activeCallSession &&
                    !directP2pVoiceCallActive &&
                    !groupConferenceMediaActive ? (
                      <ActiveCallMinimizedBar
                        isDark={isDark}
                        peerName={activeCallSession.peerName}
                        roomLayout={activeCallSession.roomLayout}
                        roomParticipants={activeCallSession.roomParticipants}
                        onAddPeople={() => setAddCallParticipantsOpen(true)}
                        onExpandCall={() => setCallMinimizedForChat(false)}
                        onEndCall={() => void handleEndActiveCallSession()}
                        micMuted={
                          directP2pVoiceCallActive || groupConferenceMediaActive
                            ? callMicMuted
                            : undefined
                        }
                        onMicMutedChange={
                          directP2pVoiceCallActive || groupConferenceMediaActive
                            ? setCallMicMuted
                            : undefined
                        }
                        peerRemoteMicMuted={
                          directP2pVoiceCallActive ? peerRemoteMicMuted : false
                        }
                        remoteAudioRef={
                          directP2pVoiceCallActive ? voiceAudio.remoteAudioRef : undefined
                        }
                        onMicDeviceChange={
                          directP2pVoiceCallActive || groupConferenceMediaActive
                            ? () => setMicDeviceEpoch((e) => e + 1)
                            : undefined
                        }
                        directCallVideo={directP2pVoiceCallActive}
                        camOff={callCameraOff}
                        onCamOffChange={setCallCameraOff}
                        screenSharing={
                          directP2pVoiceCallActive
                            ? voiceAudio.screenSharingLocal
                            : groupConferenceMediaActive
                              ? groupCallMedia.screenSharingLocal
                              : undefined
                        }
                        onScreenShareToggle={
                          directP2pVoiceCallActive
                            ? () => void voiceAudio.toggleScreenShare()
                            : groupConferenceMediaActive
                              ? () => void groupCallMedia.toggleScreenShare()
                              : undefined
                        }
                        onCameraDeviceChange={
                          directP2pVoiceCallActive || groupConferenceMediaActive
                            ? () => setCameraDeviceEpoch((e) => e + 1)
                            : undefined
                        }
                      />
                    ) : null}
                    <div
                      className={`relative min-h-0 flex-1 flex flex-col ${showFullCallOverlay ? "pointer-events-none" : ""}`}
                      aria-hidden={showFullCallOverlay || undefined}
                    >
                    <ConversationMessageList
                      key={`${selectedConversation.id}:${showThreadSkeleton ? "loading" : "ready"}`}
                      isDark={isDark}
                      conversationId={selectedConversation.id}
                      conversationKind={selectedConversation.kind}
                      messages={conversationMessages}
                      loadingSkeleton={showThreadSkeleton}
                      scrollSettlingOverlay={threadScrollSettling}
                      onInitialScrollSettled={handleThreadScrollSettled}
                      scrollToBottomKey={messagesScrollToBottomKey}
                      onReply={handleReplyToMessage}
                      onForward={handleForwardMessage}
                      onDeleteForMe={handleDeleteMessageForMe}
                      onDeleteForEveryone={handleDeleteMessageForEveryone}
                      onFavoriteSticker={handleFavoriteSticker}
                      onResendFailedMessage={handleResendFailedMessage}
                      groupMentions={groupMentionsForChat}
                      jumpToMessageRequest={
                        mentionJump &&
                        mentionJump.conversationId === selectedConversation.id &&
                        mentionJumpRequestKey > 0
                          ? {
                              messageId: mentionJump.messageId,
                              requestKey: mentionJumpRequestKey,
                            }
                          : null
                      }
                      onJumpToMessageHandled={handleMentionJumpHandled}
                      searchJumpRequest={searchJump}
                      onSearchJumpHandled={handleSearchJumpHandled}
                    />
                    {selectedConversation.kind === "group" &&
                    mentionJump &&
                    mentionJump.conversationId === selectedConversation.id ? (
                      <button
                        type="button"
                        aria-label="Ir para a mensagem em que foste mencionado"
                        title="Ver menção"
                        onClick={handleMentionJumpClick}
                        className={`pointer-events-auto absolute right-4 bottom-4 z-20 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border shadow-lg transition ${
                          isDark
                            ? "border-sky-600/80 bg-sky-950/90 text-sky-300 hover:bg-sky-900/80"
                            : "border-sky-400 bg-white text-sky-800 hover:bg-sky-50"
                        }`}
                      >
                        <AtSign size={20} />
                      </button>
                    ) : null}
                    </div>
                  <footer
                    className={`shrink-0 border-t px-3 py-2 ${
                      isDark ? "border-zinc-800 bg-zinc-900" : "border-zinc-200 bg-white"
                    }`}
                  >
                    <input
                      ref={imageAttachmentInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageAttachmentChange}
                    />
                    <input
                      ref={videoAttachmentInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={handleVideoAttachmentChange}
                    />
                    <input
                      ref={audioAttachmentInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={handleAudioAttachmentChange}
                    />
                    <input
                      ref={documentAttachmentInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rtf,.odt,.ods,.odp,application/pdf"
                      className="hidden"
                      onChange={handleDocumentAttachmentChange}
                    />
                    <div className="flex w-full min-w-0 flex-col gap-2">
                      {!showFullCallOverlay &&
                      replyingTo &&
                      selectedConversation &&
                      voiceRecorder.phase === "idle" &&
                      !pendingDocument &&
                      !pendingMedia &&
                      !contactShareAttachment ? (
                        <div
                          className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${
                            isDark
                              ? "border-emerald-500/35 bg-emerald-950/25"
                              : "border-emerald-200 bg-emerald-50"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-[10px] font-bold tracking-wide uppercase ${
                                isDark ? "text-emerald-400" : "text-emerald-700"
                              }`}
                            >
                              Respondendo
                            </p>
                            <p
                              className={`text-xs font-semibold ${
                                isDark ? "text-zinc-100" : "text-zinc-900"
                              }`}
                            >
                              {authorLabelForReply(replyingTo, selectedConversation)}
                            </p>
                            <p
                              className={`mt-0.5 line-clamp-2 text-xs ${
                                isDark ? "text-zinc-400" : "text-zinc-600"
                              }`}
                            >
                              {getMessageSnippet(replyingTo)}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label="Cancelar resposta"
                            onClick={() => setReplyingTo(null)}
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                              isDark
                                ? "text-zinc-400 hover:bg-zinc-800"
                                : "text-zinc-600 hover:bg-zinc-200"
                            }`}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : null}
                      {!showFullCallOverlay && pendingDocument && selectedConversation ? (
                        <DocumentAttachmentPreview
                          isDark={isDark}
                          file={pendingDocument.file}
                          pdfObjectUrl={pendingDocument.objectUrl}
                          onCancel={clearPendingDocument}
                          onSent={async (info) => {
                            const doc = pendingDocument;
                            const conv = selectedConversation;
                            if (!doc || !conv) return;
                            clearPendingDocument();
                            if (isChatApiConversationId(conv.id)) {
                              await sendApiChatAttachment(
                                conv.id,
                                conv.name,
                                doc.file,
                                doc.file.name,
                                "document",
                                info.caption,
                              );
                            }
                            setMediaSentToast(true);
                          }}
                        />
                      ) : !showFullCallOverlay && pendingMedia && selectedConversation ? (
                        <MediaAttachmentPreview
                          isDark={isDark}
                          kind={pendingMedia.kind}
                          file={pendingMedia.file}
                          objectUrl={pendingMedia.objectUrl}
                          onCancel={clearPendingMedia}
                          onSent={async (info) => {
                            const pm = pendingMedia;
                            const conv = selectedConversation;
                            if (!pm || !conv) return;
                            clearPendingMedia();
                            if (isChatApiConversationId(conv.id)) {
                              if (info.video) {
                                await sendApiChatAttachment(
                                  conv.id,
                                  conv.name,
                                  info.video.originalFile,
                                  info.video.originalFile.name,
                                  "video",
                                  info.caption,
                                  {
                                    trimStartSec: info.video.trimStartSec,
                                    trimEndSec: info.video.trimEndSec,
                                  },
                                );
                              } else {
                                await sendApiChatAttachment(
                                  conv.id,
                                  conv.name,
                                  pm.file,
                                  pm.file.name,
                                  pm.kind === "audio" ? "audio" : "image",
                                  info.caption,
                                );
                              }
                            }
                            setMediaSentToast(true);
                          }}
                        />
                      ) : !showFullCallOverlay && contactShareAttachment ? (
                        <ContactShareAttachment
                          isDark={isDark}
                          step={contactShareAttachment.step === "list" ? "list" : "preview"}
                          contacts={MOCK_SHAREABLE_CONTACTS}
                          selected={
                            contactShareAttachment.step === "preview"
                              ? contactShareAttachment.contact
                              : null
                          }
                          onPickContact={(c) => setContactShareAttachment({ step: "preview", contact: c })}
                          onBackFromPreview={() => setContactShareAttachment({ step: "list" })}
                          onCancel={clearContactShareAttachment}
                          onSend={() => {
                            clearContactShareAttachment();
                            setContactShareSentToast(true);
                          }}
                        />
                      ) : voiceRecorder.phase === "idle" ? (
                        <>
                          {directChatComposerLock.hint ? (
                            <div
                              className={`mb-1 rounded-lg border px-3 py-2 text-xs ${
                                isDark
                                  ? "border-amber-600/50 bg-amber-950/40 text-amber-100"
                                  : "border-amber-200 bg-amber-50 text-amber-900"
                              }`}
                            >
                              {directChatComposerLock.hint}
                            </div>
                          ) : null}
                          <div
                            className={`flex w-full min-w-0 items-end gap-2 ${
                              directChatComposerLock.locked ? "pointer-events-none opacity-50" : ""
                            }`}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onDrop={handleComposerDrop}
                          >
                          <MessageEmojiPicker
                            isDark={isDark}
                            open={emojiPickerOpen}
                            onOpenChange={setEmojiPickerOpen}
                            onEmojiSelect={handleEmojiInsert}
                            onSendSticker={handleSendStickerFromPicker}
                            onResendSticker={handleResendStickerFromUrl}
                            prepareStickerImage={prepareStickerImageForCompose}
                            onGifFile={handleGifFileFromEmojiPicker}
                            canSendMedia={
                              !!selectedConversation &&
                              isChatApiConversationId(selectedConversation.id) &&
                              !directChatComposerLock.locked
                            }
                          >
                            <button
                              type="button"
                              aria-label="Selecionar emoji"
                              aria-expanded={emojiPickerOpen}
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${
                                emojiPickerOpen
                                  ? isDark
                                    ? "border-emerald-500 bg-zinc-800 text-emerald-400"
                                    : "border-emerald-500 bg-emerald-50 text-emerald-700"
                                  : isDark
                                    ? "border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                                    : "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                              }`}
                            >
                              <Smile size={17} />
                            </button>
                          </MessageEmojiPicker>

                          <MessageAttachmentMenu
                            isDark={isDark}
                            onSelect={handleAttachmentSelect}
                            focusAfterCloseRef={messageInputRef}
                            open={attachmentMenuOpen}
                            onOpenChange={setAttachmentMenuOpen}
                          >
                            <button
                              type="button"
                              aria-label="Anexar"
                              aria-haspopup="menu"
                              aria-expanded={attachmentMenuOpen}
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition outline-none ring-0 ring-offset-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${
                                attachmentMenuOpen
                                  ? isDark
                                    ? "border-emerald-500 bg-zinc-800 text-emerald-400"
                                    : "border-emerald-500 bg-emerald-50 text-emerald-700"
                                  : isDark
                                    ? "border-zinc-700 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                                    : "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                              }`}
                            >
                              <Paperclip size={17} />
                            </button>
                          </MessageAttachmentMenu>

                          <div
                            className={`relative flex min-h-10 flex-1 items-center gap-2 border px-4 py-2 shadow-sm transition-[border-radius] ${
                              messageInputExpanded ? "rounded-[26px]" : "rounded-[999px]"
                            } ${
                              isDark
                                ? "border-zinc-700 bg-zinc-800/95"
                                : "border-zinc-200 bg-white"
                            }`}
                          >
                            {mentionMenu.open &&
                            selectedConversation?.kind === "group" &&
                            voiceRecorder.phase === "idle" ? (
                              <div className="absolute right-0 bottom-full left-0 z-[230] mb-1 flex justify-start">
                                <GroupMentionPopover
                                  isDark={isDark}
                                  members={mentionFilteredMembers}
                                  highlightedIndex={mentionMenu.highlightIndex}
                                  onHighlightIndexChange={(index) =>
                                    setMentionMenu((m) => (m.open ? { ...m, highlightIndex: index } : m))
                                  }
                                  onPick={pickGroupMention}
                                />
                              </div>
                            ) : null}
                            <textarea
                              ref={messageInputRef}
                              value={messageDraft}
                              onChange={handleMessageDraftChange}
                              onPaste={handleMessagePaste}
                              onSelect={handleMessageSelect}
                              onKeyUp={handleMessageKeyUp}
                              onKeyDown={handleMessageKeyDown}
                              rows={1}
                              disabled={directChatComposerLock.locked}
                              placeholder={
                                selectedConversation?.kind === "group"
                                  ? "Digite sua mensagem... (@ menciona integrante)"
                                  : "Digite sua mensagem... (Enter envia, Shift+Enter nova linha)"
                              }
                              className={`min-h-5 flex-1 resize-none bg-transparent px-0.5 py-0.5 text-sm leading-5 outline-none ${
                                isDark
                                  ? "text-zinc-100 placeholder:text-zinc-500"
                                  : "text-zinc-900 placeholder:text-zinc-400"
                              }`}
                            />
                            <button
                              type="button"
                              onClick={() => void voiceRecorder.startRecording()}
                              aria-label="Gravar audio"
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                                isDark
                                  ? "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
                                  : "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
                              }`}
                            >
                              <Mic size={15} />
                            </button>
                          </div>
                        </div>
                        </>
                      ) : voiceRecorder.phase === "recording" ? (
                        <div className="flex w-full min-w-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => voiceRecorder.cancelRecording()}
                            className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold ${
                              isDark
                                ? "border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                                : "border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
                            }`}
                          >
                            Cancelar
                          </button>
                          <div
                            className={`relative flex min-h-10 min-w-0 flex-1 items-center overflow-hidden rounded-2xl border px-2 py-2 ${
                              isDark ? "border-red-500/40 bg-zinc-800/80" : "border-red-200 bg-red-50/80"
                            }`}
                          >
                            <div className={`absolute right-0 left-0 h-px ${isDark ? "bg-zinc-700/80" : "bg-zinc-300"}`} />
                            <div className="relative z-10 flex h-10 w-full min-w-0 items-end gap-0.5 overflow-hidden">
                              {voiceRecorder.recordingDisplayBars.map((h, index) => (
                                <div
                                  key={index}
                                  className="flex min-h-0 min-w-0 flex-1 items-end justify-center"
                                >
                                  <span
                                    className={`rounded-full ${
                                      isDark ? "bg-emerald-400/95" : "bg-emerald-600/95"
                                    }`}
                                    style={{
                                      width: "min(100%, 3px)",
                                      height: `${Math.max(3, h * 24)}px`,
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 font-mono text-sm tabular-nums ${
                              isDark ? "text-red-300" : "text-red-700"
                            }`}
                          >
                            {formatVoiceDuration(voiceRecorder.recordingMs)}
                          </span>
                          <button
                            type="button"
                            onClick={() => voiceRecorder.finishRecording()}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                          >
                            <Square size={14} fill="currentColor" />
                            Concluir
                          </button>
                        </div>
                      ) : voiceRecorder.phase === "preview" ? (
                        <div className="flex w-full min-w-0 flex-col gap-2">
                          <audio
                            ref={previewAudioRef}
                            src={voiceRecorder.previewUrl ?? undefined}
                            className="hidden"
                            onLoadedMetadata={(event) => {
                              const a = event.currentTarget;
                              setPreviewAudioTime({
                                current: a.currentTime * 1000,
                                duration: Number.isFinite(a.duration) ? a.duration * 1000 : 0,
                              });
                            }}
                            onTimeUpdate={(event) => {
                              const a = event.currentTarget;
                              setPreviewAudioTime({
                                current: a.currentTime * 1000,
                                duration: Number.isFinite(a.duration) ? a.duration * 1000 : 0,
                              });
                            }}
                            onPlay={() => setPreviewPlaying(true)}
                            onPause={() => setPreviewPlaying(false)}
                            onEnded={() => {
                              setPreviewPlaying(false);
                              setPreviewAudioTime((t) => ({ ...t, current: 0 }));
                            }}
                          />
                          <div className="flex w-full min-w-0 items-center gap-2">
                            <button
                              type="button"
                              onClick={() => voiceRecorder.cancelRecording()}
                              className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold ${
                                isDark
                                  ? "border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                                  : "border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
                              }`}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={togglePreviewPlayback}
                              aria-label={previewPlaying ? "Pausar preview" : "Ouvir preview"}
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
                                isDark
                                  ? "border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                                  : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100"
                              }`}
                            >
                              {previewPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                            </button>
                            <div
                              className={`relative flex min-h-10 min-w-0 flex-1 items-center overflow-hidden rounded-2xl border px-2 py-2 ${
                                isDark ? "border-zinc-600 bg-zinc-800/90" : "border-zinc-300 bg-zinc-100"
                              }`}
                            >
                              <div className={`absolute right-0 left-0 h-px ${isDark ? "bg-zinc-600" : "bg-zinc-300"}`} />
                              <div className="relative z-10 flex h-10 w-full min-w-0 items-end gap-0.5 overflow-hidden">
                                {(() => {
                                  const waveProgress =
                                    previewAudioTime.duration > 0
                                      ? Math.min(1, previewAudioTime.current / previewAudioTime.duration)
                                      : 0;
                                  return (voiceRecorder.previewDisplayBars ?? []).map((h, index) => {
                                  const t = (index + 0.5) / WAVE_DISPLAY_BARS;
                                  const isPlayed = t <= waveProgress;
                                  return (
                                    <div
                                      key={index}
                                      className="flex min-h-0 min-w-0 flex-1 items-end justify-center"
                                    >
                                      <span
                                        className={`rounded-full ${
                                          isPlayed
                                            ? isDark
                                              ? "bg-zinc-300/95"
                                              : "bg-zinc-500/90"
                                            : isDark
                                              ? "bg-zinc-600/90"
                                              : "bg-zinc-300/90"
                                        }`}
                                        style={{
                                          width: "min(100%, 3px)",
                                          height: `${Math.max(3, h * 24)}px`,
                                        }}
                                      />
                                    </div>
                                  );
                                });
                                })()}
                              </div>
                              {previewAudioTime.duration > 0 ? (
                                <div
                                  className="pointer-events-none absolute top-1/2 z-20 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500 shadow-sm ring-2 ring-emerald-300/40"
                                  style={{
                                    left: `${Math.min(100, Math.max(0, (previewAudioTime.current / previewAudioTime.duration) * 100))}%`,
                                  }}
                                />
                              ) : null}
                            </div>
                            <span
                              className={`shrink-0 font-mono text-xs tabular-nums ${
                                isDark ? "text-zinc-400" : "text-zinc-600"
                              }`}
                            >
                              {formatVoiceDuration(previewAudioTime.current)} /{" "}
                              {formatVoiceDuration(previewAudioTime.duration)}
                            </span>
                            <button
                              type="button"
                              onClick={handleSendVoiceMessage}
                              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                            >
                              <SendHorizonal size={14} />
                              Enviar audio
                            </button>
                          </div>
                          <p className={`text-center text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                            Ouvir o audio antes de enviar
          </p>
        </div>
                      ) : null}
                    </div>
                  </footer>
                  </div>

                  <ConversationSearchModal
                    open={conversationSearchOpen}
                    onOpenChange={setConversationSearchOpen}
                    isDark={isDark}
                    messages={conversationMessages}
                    onPickMessage={handleConversationSearchPick}
                  />

                  <ChatCommandPalette
                    open={commandPaletteOpen}
                    onOpenChange={setCommandPaletteOpen}
                    isDark={isDark}
                    canSearch={!!selectedConversation}
                    onAction={handleChatCommandPaletteAction}
                  />

                  <ConversationGalleryModal
                    open={galleryOpen}
                    onOpenChange={setGalleryOpen}
                    isDark={isDark}
                    messages={conversationMessages}
                  />

                  <ForwardMessageModal
                    open={forwardModalOpen}
                    onOpenChange={(open) => {
                      setForwardModalOpen(open);
                      if (!open) {
                        setForwardSource(null);
                        setForwardSendError(null);
                      }
                    }}
                    isDark={isDark}
                    excludeConversationId={selectedConversation.id}
                    options={forwardPickerOptions}
                    onSelectTarget={handleForwardConversationPick}
                  />

                </div>
              ) : (
                <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden p-6 sm:p-8">
                  <div
                    className={`pointer-events-none absolute inset-0 ${
                      isDark
                        ? "bg-[radial-gradient(ellipse_85%_65%_at_50%_-10%,rgba(16,185,129,0.16),transparent_52%),radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(34,197,94,0.08),transparent_45%)]"
                        : "bg-[radial-gradient(ellipse_85%_65%_at_50%_-10%,rgba(16,185,129,0.22),transparent_52%),radial-gradient(ellipse_70%_50%_at_100%_100%,rgba(52,211,153,0.14),transparent_45%)]"
                    }`}
                  />
                  <div className="pointer-events-none absolute -top-8 left-[12%] h-56 w-56 rounded-full bg-emerald-500/25 blur-3xl animate-pulse dark:bg-emerald-500/18" />
                  <div className="pointer-events-none absolute -right-6 bottom-[8%] h-64 w-64 rounded-full bg-teal-400/20 blur-3xl animate-pulse dark:bg-teal-500/12" />
                  <div className="pointer-events-none absolute top-1/2 left-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime-400/12 blur-3xl dark:bg-lime-400/8" />

                  <div
                    className={`relative z-10 w-full max-w-xl space-y-5 rounded-2xl border px-6 py-8 text-center shadow-xl backdrop-blur-md transition-shadow sm:px-8 ${
                      isDark
                        ? "border-emerald-500/25 bg-zinc-900/55 shadow-emerald-950/40 ring-1 ring-emerald-500/10"
                        : "border-emerald-200/80 bg-white/70 shadow-emerald-200/50 ring-1 ring-emerald-300/30"
                    }`}
                  >
                    <div className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-emerald-400/15 via-transparent to-teal-500/10 opacity-90 dark:from-emerald-500/20 dark:to-teal-600/10" aria-hidden />
                    <div className="relative">
                      <h2
                        className={`text-xl font-semibold tracking-tight ${
                          isDark ? "text-emerald-100" : "text-emerald-900"
                        }`}
                      >
                        Bem-vindo ao SyncYou 2
                      </h2>
                      <p className={`mt-3 text-sm leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>
                        Selecione uma conversa para iniciar o atendimento. Enquanto isso, aqui estao
                        alguns recursos da plataforma.
                      </p>
                      <div className="mt-6 grid grid-cols-1 gap-2.5 text-left text-sm sm:grid-cols-2">
                        {[
                          "Conversas em tempo real",
                          "Filtros e favoritos",
                          "Organizacao por grupos",
                          "Atalhos de produtividade",
                        ].map((label) => (
                          <div
                            key={label}
                            className={`rounded-xl border px-3 py-2.5 backdrop-blur-sm transition-colors ${
                              isDark
                                ? "border-emerald-500/20 bg-zinc-800/60 hover:border-emerald-500/30"
                                : "border-emerald-200/70 bg-white/50 hover:border-emerald-300/90"
                            }`}
                          >
                            {label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            ) : platformMenu === "contacts" ? (
              <ContactsMainPanel
                isDark={isDark}
                section={contactsSection}
                remoteRefreshKey={contactsRemoteRefreshKey}
                peerPresenceLive={peerPresenceLive}
                onOpenConversation={openConversationFromContacts}
                onIncomingRequestCount={setContactsIncomingCount}
                onBlockedCountChange={setContactsBlockedCount}
                onFriendsCountChange={setContactsFriendsCount}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm opacity-70">
                Area em construcao
              </div>
            )}
          </section>
        </section>

        {showConversationInfoModal && selectedConversation ? (
          <ConversationInfoModal
            isDark={isDark}
            open={showConversationInfoModal}
            onClose={() => setShowConversationInfoModal(false)}
            selectedConversation={selectedConversation}
            sessionUserId={sessionUser?.id ?? null}
            isApiChat={isChatApiConversationId(selectedConversation.id)}
            groupDescriptionFromList={groupDescriptionFromList}
            chatThreadAvatarUrl={chatThreadAvatarUrl}
            getInitials={getInitials}
            groupMembers={groupMembers}
            peerPresenceLive={peerPresenceLive}
            contactOutgoingRequestPeerIds={contactOutgoingRequestPeerIds}
            onSendFriendRequest={sendFriendRequestToPeer}
            onRefreshMembers={refreshGroupMembersList}
            onRefreshChatList={loadChatConversations}
            onDownloadFile={handleDownloadWithDialog}
            directPeerProfile={directPeerProfile}
            favorite={getConversationFlag(selectedConversation.id).favorite}
            blocked={getConversationFlag(selectedConversation.id).blocked}
            blockedByPeer={
              getConversationFlag(selectedConversation.id).blocked &&
              !getConversationFlag(selectedConversation.id).blockedByMe
            }
            onToggleFavorite={handleConversationInfoToggleFavorite}
            onToggleBlock={handleConversationInfoToggleBlock}
            friendsForPicker={chatFriendsRows}
            onAfterDeleteGroup={() => {
              setSelectedConversation(null);
              setShowConversationInfoModal(false);
            }}
          />
        ) : null}

        <NotificationAlert
          type="alerta"
          title="Arquivo nao permitido neste anexo"
          description={attachmentTypeRejectMessage ?? ""}
          visible={attachmentTypeRejectMessage !== null}
          durationMs={4200}
          theme={isDark ? "dark" : "light"}
          onClose={() => setAttachmentTypeRejectMessage(null)}
        />

        <NotificationAlert
          type="error"
          title="Microfone"
          description={voiceRecorder.errorMessage ?? ""}
          visible={voiceRecorder.errorMessage !== null}
          durationMs={3200}
          theme={isDark ? "dark" : "light"}
          onClose={() => voiceRecorder.setErrorMessage(null)}
        />

        <NotificationAlert
          type="sucesso"
          title="Audio enviado"
          description="A mensagem de voz foi enviada na conversa."
          visible={voiceSentToast}
          durationMs={2200}
          theme={isDark ? "dark" : "light"}
          onClose={() => setVoiceSentToast(false)}
        />

        <NotificationAlert
          type="sucesso"
          title="Anexo enviado"
          description="O ficheiro foi carregado e enviado na conversa."
          visible={mediaSentToast}
          durationMs={2200}
          theme={isDark ? "dark" : "light"}
          onClose={() => setMediaSentToast(false)}
        />

        <NotificationAlert
          type="sucesso"
          title="Contato pronto"
          description="O cartao de contato sera enviado quando o backend estiver pronto."
          visible={contactShareSentToast}
          durationMs={2200}
          theme={isDark ? "dark" : "light"}
          onClose={() => setContactShareSentToast(false)}
        />

        <NotificationAlert
          type="sucesso"
          title="Encaminhada"
          description={forwardToastDescription}
          visible={forwardSentToast}
          durationMs={2600}
          theme={isDark ? "dark" : "light"}
          onClose={() => setForwardSentToast(false)}
        />

        <NotificationAlert
          type="info"
          title="Mensagem removida"
          description="Só para você neste dispositivo."
          visible={deleteUndo !== null && getFeatureFlag("undoDeleteForMe")}
          durationMs={8200}
          theme={isDark ? "dark" : "light"}
          actionLabel="Desfazer"
          onAction={handleUndoDeleteForMe}
          onClose={() => setDeleteUndo(null)}
        />

        <NotificationAlert
          type="error"
          title="Encaminhar"
          description={forwardSendError ?? ""}
          visible={forwardSendError !== null}
          durationMs={4200}
          theme={isDark ? "dark" : "light"}
          onClose={() => setForwardSendError(null)}
        />

        <NotificationAlert
          type="error"
          title="Chamada"
          description={voiceCallInviteError ?? ""}
          visible={voiceCallInviteError !== null}
          durationMs={4200}
          theme={isDark ? "dark" : "light"}
          onClose={() => setVoiceCallInviteError(null)}
        />

        <NotificationAlert
          type={friendRequestFeedback?.variant === "error" ? "error" : "sucesso"}
          title={friendRequestFeedback?.variant === "error" ? "Pedido de amizade" : "Pedido enviado"}
          description={friendRequestFeedback?.message ?? ""}
          visible={friendRequestFeedback !== null}
          durationMs={3200}
          theme={isDark ? "dark" : "light"}
          onClose={() => setFriendRequestFeedback(null)}
        />

        {activeCallSession ? (
          <AddCallParticipantsModal
            open={addCallParticipantsOpen}
            onOpenChange={setAddCallParticipantsOpen}
            isDark={isDark}
            candidates={callParticipantCandidates}
            excludeParticipantIds={addCallExcludeParticipantIds}
            onConfirm={handleConfirmAddCallParticipants}
          />
        ) : null}

        {showPhotoCropModal && cropSource && (
          <PhotoCropModal
            isDark={isDark}
            imageSrc={cropSource}
            crop={crop}
            zoom={zoom}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            onClose={() => {
              setShowPhotoCropModal(false);
              setCropSource(null);
              setPhotoCropPurpose("register");
            }}
            onCancel={() => {
              setShowPhotoCropModal(false);
              setCropSource(null);
              setPhotoCropPurpose("register");
            }}
            onApply={handleApplyPhotoCrop}
            applyDisabled={isAvatarUploading && photoCropPurpose === "settings"}
            applyLabel={
              isAvatarUploading && photoCropPurpose === "settings" ? "A guardar…" : "Aplicar"
            }
            idSuffix="-plat"
          />
        )}
      </main>
    );
  }

  if (authView === "splash") {
    return (
      <main
        data-theme={theme}
        className={`relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden transition-colors ${
          isDark ? "bg-zinc-950 text-zinc-100" : "bg-emerald-50 text-emerald-950"
        }`}
      >
        <div
          className={`pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full blur-3xl ${
            isDark ? "bg-emerald-600/20" : "bg-emerald-400/50"
          }`}
        />
        <div
          className={`pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full blur-3xl ${
            isDark ? "bg-emerald-500/15" : "bg-emerald-300/45"
          }`}
        />

        <div className="relative z-10 flex flex-col items-center px-8">
          <div className="relative flex items-center justify-center">
            <div
              className={`splash-ring-animate absolute -inset-3 rounded-[1.75rem] bg-emerald-500/30 ${
                isDark ? "blur-md" : "blur-sm"
              }`}
            />
            <div
              className={`splash-logo-animate relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl shadow-2xl ${
                isDark ? "shadow-emerald-500/30" : "shadow-emerald-600/35"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- splash brand mark */}
              <img
                src={isDark ? "/simbulo-ligth.svg" : "/simbulo-dark.svg"}
                alt=""
                width={96}
                height={96}
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>
          </div>

          <p
            className={`splash-tagline-animate mt-10 text-center text-xs font-semibold uppercase tracking-[0.35em] ${
              isDark ? "text-emerald-400/95" : "text-emerald-700/90"
            }`}
          >
            SyncYou
          </p>
          <p
            className={`splash-tagline-animate mt-3 max-w-[260px] text-center text-sm leading-relaxed ${
              isDark ? "text-zinc-400" : "text-emerald-900/65"
            }`}
          >
            Comunicação segura, na sua mão.
          </p>

          {(splashUpdaterPhase === "checking" ||
            splashUpdaterPhase === "downloading" ||
            splashUpdaterPhase === "installing") && (
            <p
              className={`splash-tagline-animate mt-6 max-w-[280px] text-center text-xs leading-snug ${
                isDark ? "text-zinc-500" : "text-emerald-800/70"
              }`}
            >
              {splashUpdaterPhase === "checking" && "A verificar atualizações…"}
              {splashUpdaterPhase === "downloading" &&
                (splashUpdaterVersion
                  ? splashUpdaterPercent != null
                    ? `A transferir versão ${splashUpdaterVersion} — ${splashUpdaterPercent}%`
                    : `A transferir versão ${splashUpdaterVersion} — ${formatTransferMb(splashUpdaterBytes)}`
                  : "A transferir atualização…")}
              {splashUpdaterPhase === "installing" &&
                (splashUpdaterVersion
                  ? `A instalar versão ${splashUpdaterVersion}…`
                  : "A instalar atualização…")}
            </p>
          )}

          <div
            className={`splash-tagline-animate mt-4 h-1.5 w-52 overflow-hidden rounded-full ${
              isDark ? "bg-zinc-800" : "bg-emerald-200/90"
            }`}
          >
            {splashUpdaterPhase === "downloading" && splashUpdaterPercent != null ? (
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-150 ease-out"
                style={{ width: `${splashUpdaterPercent}%` }}
              />
            ) : splashUpdaterPhase === "downloading" && splashUpdaterPercent == null ? (
              <div className="splash-shimmer-animate h-full w-2/5 rounded-full bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-95" />
            ) : splashUpdaterPhase === "installing" ? (
              <div className="h-full w-full rounded-full bg-emerald-500" />
            ) : (
              <div className="splash-shimmer-animate h-full w-2/5 rounded-full bg-gradient-to-r from-transparent via-emerald-500 to-transparent opacity-95" />
            )}
          </div>
        </div>
      </main>
    );
  }

  const authScreenTitle =
    authView === "register"
      ? "Cadastro"
      : authView === "forgot"
        ? "Redefinir senha"
        : "Login";
  const isDesktopAuthShell = isTauri();
  const authPanelClass = isDesktopAuthShell
    ? "contents"
    : authView === "register"
      ? `relative z-10 w-full max-w-3xl rounded-[32px] border p-6 shadow-2xl backdrop-blur ${
          isDark
            ? "border-zinc-700/80 bg-zinc-900/92 text-zinc-100 shadow-black/30"
            : "border-emerald-200 bg-white/92 text-emerald-950 shadow-emerald-200/70"
        }`
      : `relative z-10 w-full max-w-[460px] rounded-[32px] border p-6 shadow-2xl backdrop-blur ${
          isDark
            ? "border-zinc-700/80 bg-zinc-900/92 text-zinc-100 shadow-black/30"
            : "border-emerald-200 bg-white/92 text-emerald-950 shadow-emerald-200/70"
        }`;

  return (
    <main
      data-theme={theme}
      className={`flex min-h-screen w-full min-w-0 max-w-full flex-col overflow-hidden transition-colors ${
        isDark ? "bg-zinc-950" : "bg-emerald-50"
      }`}
    >
      {isDesktopAuthShell ? (
        <WindowTitleBar
          isDark={isDark}
          onToggleTheme={toggleTheme}
          title={authScreenTitle}
          symbolOnly={authView === "login"}
          hideSymbol={authView === "login"}
          showMaximize={authView !== "login"}
        />
      ) : null}
      <section
        className={`relative isolate flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-6 py-6 ${
          isDark ? "bg-zinc-900 text-zinc-100" : "bg-emerald-50 text-emerald-950"
        } ${isDesktopAuthShell ? "" : "items-center justify-center"}`}
      >
        <div
          className={`pointer-events-none absolute -top-16 -left-10 h-44 w-44 rounded-full blur-3xl ${
            isDark ? "bg-emerald-700/25" : "bg-emerald-400/40"
          } animate-pulse`}
        />
        <div
          className={`pointer-events-none absolute -right-14 bottom-20 h-56 w-56 rounded-full blur-3xl ${
            isDark ? "bg-emerald-500/20" : "bg-emerald-300/50"
          } animate-pulse`}
        />
        {!isDesktopAuthShell ? (
          <>
            <div
              className={`pointer-events-none absolute top-[14%] left-1/2 h-72 w-72 -translate-x-[62%] rounded-full blur-3xl ${
                isDark ? "bg-emerald-500/18" : "bg-emerald-400/35"
              }`}
            />
            <div
              className={`pointer-events-none absolute right-[12%] bottom-[16%] h-80 w-80 rounded-full blur-3xl ${
                isDark ? "bg-lime-400/12" : "bg-emerald-300/30"
              }`}
            />
            <div
              className={`pointer-events-none absolute inset-0 ${
                isDark
                  ? "bg-[radial-gradient(circle_at_30%_24%,rgba(16,185,129,0.14),transparent_24%),radial-gradient(circle_at_72%_74%,rgba(34,197,94,0.10),transparent_28%)]"
                  : "bg-[radial-gradient(circle_at_30%_24%,rgba(16,185,129,0.18),transparent_24%),radial-gradient(circle_at_72%_74%,rgba(34,197,94,0.12),transparent_28%)]"
              }`}
            />
          </>
        ) : null}

        <div className={authPanelClass}>
        {authView === "login" ? (
          <>
          <form
            onSubmit={handleSubmit}
            onPointerDownCapture={requestLoginGeoOnUserInteraction}
            className={`relative z-10 flex flex-1 flex-col ${isDesktopAuthShell ? "" : "min-h-[520px]"}`}
          >
            <div className="mb-6 flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- logo em public */}
              <img
                src={isDark ? "/logo-ligth.svg" : "/logo-dark.svg"}
                alt="SyncYou"
                width={280}
                height={94}
                className="h-auto w-full max-w-[260px] object-contain"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="voce@exemplo.com"
                className={`w-full rounded-md border px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${
                  isDark
                    ? "border-zinc-700 bg-zinc-800 placeholder:text-zinc-500 focus:ring-emerald-500"
                    : "border-emerald-300 bg-white placeholder:text-emerald-400 focus:ring-emerald-400"
                }`}
                required
              />
            </div>

            <div className="mt-3 space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                Senha
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="********"
                  className={`w-full rounded-md border px-3 py-2.5 pr-11 text-sm outline-none transition focus:ring-2 ${
                    isDark
                      ? "border-zinc-700 bg-zinc-800 placeholder:text-zinc-500 focus:ring-emerald-500"
                      : "border-emerald-300 bg-white placeholder:text-emerald-400 focus:ring-emerald-400"
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className={`absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer transition ${
                    isDark ? "text-zinc-400 hover:text-zinc-200" : "text-emerald-600 hover:text-emerald-800"
                  }`}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={goToForgotPassword}
                  className={`cursor-pointer text-xs font-medium underline transition ${
                    isDark ? "text-zinc-300 hover:text-zinc-100" : "text-emerald-700 hover:text-emerald-900"
                  }`}
                >
                  Esqueceu a senha?
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <button
                type="submit"
                disabled={isLoginLoading}
                className="w-full cursor-pointer rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
              >
                Entrar
              </button>

              <button
                type="button"
                onClick={goToRegister}
                disabled={isLoginLoading}
                className={`w-full cursor-pointer rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
                  isDark
                    ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700"
                    : "border-emerald-300 bg-emerald-100 hover:bg-emerald-200"
                }`}
              >
                Cadastrar
              </button>
            </div>

            <div className="my-4 flex min-w-0 items-center gap-3">
              <div className={`h-px min-w-0 flex-1 ${isDark ? "bg-zinc-700" : "bg-emerald-300"}`} />
              <span className={`shrink-0 text-xs ${isDark ? "text-zinc-400" : "text-emerald-700/80"}`}>
                OU
              </span>
              <div className={`h-px min-w-0 flex-1 ${isDark ? "bg-zinc-700" : "bg-emerald-300"}`} />
            </div>

            <div className="mt-2 flex items-center justify-center gap-4 pb-4">
              <button
                type="button"
                aria-label="Entrar com Google"
                onClick={() => {
                  void oauthNavigateOrOpen({ provider: "google" });
                }}
                className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border transition ${
                  isDark
                    ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700"
                    : "border-emerald-300 bg-white hover:bg-emerald-100"
                }`}
              >
                <FaGoogle size={18} />
              </button>
              <button
                type="button"
                aria-label="Entrar com Microsoft"
                onClick={() => {
                  void oauthNavigateOrOpen({ provider: "microsoft" });
                }}
                className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border transition ${
                  isDark
                    ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700"
                    : "border-emerald-300 bg-white hover:bg-emerald-100"
                }`}
              >
                <FaMicrosoft size={18} />
              </button>
            </div>
          </form>
          {reactivatePrompt ? (
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="reactivate-dialog-title"
              aria-describedby="reactivate-dialog-desc"
              onClick={(e) => {
                if (e.target === e.currentTarget && !isReactivateLoading) setReactivatePrompt(null);
              }}
            >
              <div
                className={`w-full max-w-md rounded-2xl border p-6 shadow-xl ${
                  isDark ? "border-zinc-600 bg-zinc-900 text-zinc-100" : "border-emerald-200 bg-white text-emerald-950"
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="reactivate-dialog-title" className="text-lg font-semibold">
                  Conta desativada
                </h2>
                <p id="reactivate-dialog-desc" className={`mt-2 text-sm ${isDark ? "text-zinc-300" : "text-emerald-800"}`}>
                  Deseja reativar a conta e continuar? Se cancelar, não será iniciada sessão.
                </p>
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={isReactivateLoading}
                    onClick={() => setReactivatePrompt(null)}
                    className={`cursor-pointer rounded-md border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                      isDark
                        ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700"
                        : "border-emerald-300 bg-emerald-100 hover:bg-emerald-200"
                    }`}
                  >
                    Não, cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isReactivateLoading}
                    onClick={() => void handleReactivateConfirm()}
                    className="cursor-pointer rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                  >
                    {isReactivateLoading ? "A reativar…" : "Sim, reativar e entrar"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {login2faPending ? (
            <div
              className="fixed inset-0 z-[65] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="login-2fa-title"
              onClick={(e) => {
                if (e.target === e.currentTarget && !isLogin2faLoading) {
                  setLogin2faPending(null);
                  setLogin2faDigits(emptyOtp6());
                }
              }}
            >
              <div
                className={`w-full max-w-md rounded-2xl border p-6 shadow-xl ${
                  isDark ? "border-zinc-600 bg-zinc-900 text-zinc-100" : "border-emerald-200 bg-white text-emerald-950"
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="login-2fa-title" className="text-lg font-semibold">
                  Autenticação em dois fatores
                </h2>
                <p className={`mt-2 text-sm ${isDark ? "text-zinc-300" : "text-emerald-800"}`}>
                  Introduza o código de 6 dígitos da sua app autenticadora (Google Authenticator, etc.).
                </p>
                <Otp6Input
                  className="mt-4 flex justify-center gap-1.5 sm:justify-between sm:gap-2"
                  digits={login2faDigits}
                  onDigitsChange={setLogin2faDigits}
                  isDark={isDark}
                  disabled={isLogin2faLoading}
                  autoFocus
                  groupAriaLabel="Código de autenticação de dois fatores"
                />
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={isLogin2faLoading}
                    onClick={() => {
                      setLogin2faPending(null);
                      setLogin2faDigits(emptyOtp6());
                    }}
                    className={`rounded-md border px-4 py-2.5 text-sm font-semibold ${
                      isDark ? "border-zinc-600 bg-zinc-800" : "border-emerald-200 bg-emerald-50"
                    }`}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isLogin2faLoading || login2faDigits.join("").length !== 6}
                    onClick={() => void handleLogin2faConfirm()}
                    className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {isLogin2faLoading ? "A verificar…" : "Continuar"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          </>
        ) : authView === "forgot" ? (
          <div className={`relative z-10 flex flex-1 flex-col ${isDesktopAuthShell ? "" : "min-h-[500px]"}`}>
            {forgotStep === "email" ? (
              <form onSubmit={handleForgotEmailSubmit} className="flex flex-1 flex-col">
                <p className={`mb-4 text-sm ${isDark ? "text-zinc-300" : "text-emerald-800"}`}>
                  Informe seu email para receber o codigo de redefinicao.
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="forgot-email" className="text-sm font-medium">
                    Email
                  </label>
                  <input
                    id="forgot-email"
                    type="email"
                    value={forgotEmail}
                    onChange={(event) => setForgotEmail(event.target.value)}
                    placeholder="voce@exemplo.com"
                    className={`w-full rounded-md border px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${
                      isDark
                        ? "border-zinc-700 bg-zinc-800 placeholder:text-zinc-500 focus:ring-emerald-500"
                        : "border-emerald-300 bg-white placeholder:text-emerald-400 focus:ring-emerald-400"
                    }`}
                    required
                  />
                </div>
                <div className="mt-auto grid grid-cols-2 gap-3 pb-3">
                  <button
                    type="button"
                    onClick={goToLogin}
                    className={`w-full cursor-pointer rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
                      isDark
                        ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700"
                        : "border-emerald-300 bg-emerald-100 hover:bg-emerald-200"
                    }`}
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={isForgotSending}
                    className="w-full cursor-pointer rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                  >
                    Enviar codigo
                  </button>
                </div>
              </form>
            ) : forgotStep === "otp" ? (
              <form onSubmit={handleVerifyOtp} className="flex flex-1 flex-col">
                <p className={`mb-4 text-sm ${isDark ? "text-zinc-300" : "text-emerald-800"}`}>
                  Digite o codigo OTP de 6 digitos enviado para seu email.
                </p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    Codigo OTP
                  </label>
                  <Otp6Input
                    digits={forgotOtpDigits}
                    onDigitsChange={setForgotOtpDigits}
                    isDark={isDark}
                    disabled={isVerifyOtpLoading}
                    autoFocus
                    groupAriaLabel="Código de verificação por email"
                  />
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendSeconds > 0}
                    className={`cursor-pointer text-xs font-medium underline ${
                      resendSeconds > 0 ? "opacity-50" : "opacity-100"
                    } ${isDark ? "text-zinc-300 hover:text-zinc-100" : "text-emerald-700 hover:text-emerald-900"}`}
                  >
                    {resendSeconds > 0 ? `Reenviar em ${resendSeconds}s` : "Reenviar codigo"}
                  </button>
                </div>
                <div className="mt-auto grid grid-cols-2 gap-3 pb-3">
                  <button
                    type="button"
                    onClick={goToLogin}
                    className={`w-full cursor-pointer rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
                      isDark
                        ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700"
                        : "border-emerald-300 bg-emerald-100 hover:bg-emerald-200"
                    }`}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={
                      forgotOtpDigits.join("").length !== 6 || isVerifyOtpLoading
                    }
                    className="w-full cursor-pointer rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Verificar
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="flex flex-1 flex-col">
                <p className={`mb-4 text-sm ${isDark ? "text-zinc-300" : "text-emerald-800"}`}>
                  Defina sua nova senha de acesso.
                </p>
                <div className="space-y-1.5">
                  <label htmlFor="forgot-new-password" className="text-sm font-medium">
                    Nova senha
                  </label>
                  <div className="relative">
                    <input
                      id="forgot-new-password"
                      name="newPassword"
                      type={showForgotNewPassword ? "text" : "password"}
                      value={forgotPassword}
                      onChange={(event) => setForgotPassword(event.target.value)}
                      className={`w-full rounded-md border px-3 py-2.5 pr-11 text-sm outline-none transition focus:ring-2 ${
                        isDark
                          ? "border-zinc-700 bg-zinc-800 placeholder:text-zinc-500 focus:ring-emerald-500"
                          : "border-emerald-300 bg-white placeholder:text-emerald-400 focus:ring-emerald-400"
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotNewPassword((current) => !current)}
                      className={`absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer transition ${
                        isDark ? "text-zinc-400 hover:text-zinc-200" : "text-emerald-600 hover:text-emerald-800"
                      }`}
                    >
                      {showForgotNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className={`h-2 w-full overflow-hidden rounded-full ${isDark ? "bg-zinc-700" : "bg-emerald-200"}`}>
                      <div className={`h-full transition-all ${forgotPasswordStrength.widthClass} ${forgotPasswordStrength.colorClass}`} />
                    </div>
                    <p className={`text-xs ${isDark ? "text-zinc-400" : "text-emerald-700/80"}`}>
                      Forca da senha: {forgotPasswordStrength.label}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  <label htmlFor="forgot-confirm-password" className="text-sm font-medium">
                    Confirmar nova senha
                  </label>
                  <div className="relative">
                    <input
                      id="forgot-confirm-password"
                      name="confirmNewPassword"
                      type={showForgotConfirmPassword ? "text" : "password"}
                      className={`w-full rounded-md border px-3 py-2.5 pr-11 text-sm outline-none transition focus:ring-2 ${
                        isDark
                          ? "border-zinc-700 bg-zinc-800 placeholder:text-zinc-500 focus:ring-emerald-500"
                          : "border-emerald-300 bg-white placeholder:text-emerald-400 focus:ring-emerald-400"
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotConfirmPassword((current) => !current)}
                      className={`absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer transition ${
                        isDark ? "text-zinc-400 hover:text-zinc-200" : "text-emerald-600 hover:text-emerald-800"
                      }`}
                    >
                      {showForgotConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-3 pb-3">
                  <button
                    type="button"
                    onClick={goToLogin}
                    className={`w-full cursor-pointer rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
                      isDark
                        ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700"
                        : "border-emerald-300 bg-emerald-100 hover:bg-emerald-200"
                    }`}
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={isResetPasswordLoading}
                    className="w-full cursor-pointer rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                  >
                    Redefinir senha
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <form
            id="register-form"
            onSubmit={handleRegisterSubmit}
            className="relative z-10 flex flex-1 flex-col"
          >
            <div className="mb-3 flex items-center justify-center">
              <label
                htmlFor="profile-photo"
                className={`flex h-20 w-20 scale-110 cursor-pointer items-center justify-center rounded-full border text-xs font-semibold ${
                  isDark
                    ? "border-zinc-600 bg-zinc-800 text-zinc-300"
                    : "border-emerald-300 bg-white text-emerald-700"
                }`}
                style={photoPreview ? { backgroundImage: `url(${photoPreview})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
              >
                {!photoPreview && <Camera size={20} />}
              </label>
              <input id="profile-photo" type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="first-name" className="text-sm font-medium">
                  Nome
                </label>
                <input
                  id="first-name"
                  name="firstName"
                  type="text"
                  placeholder="Seu nome"
                  className={`w-full rounded-md border px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${
                    isDark
                      ? "border-zinc-700 bg-zinc-800 placeholder:text-zinc-500 focus:ring-emerald-500"
                      : "border-emerald-300 bg-white placeholder:text-emerald-400 focus:ring-emerald-400"
                  }`}
                  required={!registerEmailReadonly}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="last-name" className="text-sm font-medium">
                  Sobrenome
                </label>
                <input
                  id="last-name"
                  name="lastName"
                  type="text"
                  placeholder="Seu sobrenome"
                  className={`w-full rounded-md border px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${
                    isDark
                      ? "border-zinc-700 bg-zinc-800 placeholder:text-zinc-500 focus:ring-emerald-500"
                      : "border-emerald-300 bg-white placeholder:text-emerald-400 focus:ring-emerald-400"
                  }`}
                  required={!registerEmailReadonly}
                />
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              <label htmlFor="register-email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="register-email"
                name="email"
                type="email"
                placeholder="voce@exemplo.com"
                value={registerEmail}
                onChange={(event) => {
                  if (!registerEmailReadonly) {
                    setRegisterEmail(event.target.value);
                  }
                }}
                readOnly={registerEmailReadonly}
                className={`w-full rounded-md border px-3 py-2.5 text-sm outline-none transition focus:ring-2 ${
                  isDark
                    ? "border-zinc-700 bg-zinc-800 placeholder:text-zinc-500 focus:ring-emerald-500"
                    : "border-emerald-300 bg-white placeholder:text-emerald-400 focus:ring-emerald-400"
                } ${registerEmailReadonly ? "cursor-not-allowed opacity-90" : ""}`}
                required
              />
              {registerEmailReadonly ? (
                <p className={`text-xs ${isDark ? "text-zinc-400" : "text-emerald-800/90"}`}>
                  Utilize Google ou Microsoft para criar a conta. O email deve ser o mesmo na
                  conta do provedor.
                </p>
              ) : null}
            </div>

            {!registerEmailReadonly ? (
              <>
            <div className="mt-3 space-y-1.5">
              <label htmlFor="register-password" className="text-sm font-medium">
                Senha
              </label>
              <div className="relative">
                <input
                  id="register-password"
                  name="password"
                  type={showRegisterPassword ? "text" : "password"}
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  className={`w-full rounded-md border px-3 py-2.5 pr-11 text-sm outline-none transition focus:ring-2 ${
                    isDark
                      ? "border-zinc-700 bg-zinc-800 placeholder:text-zinc-500 focus:ring-emerald-500"
                      : "border-emerald-300 bg-white placeholder:text-emerald-400 focus:ring-emerald-400"
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowRegisterPassword((current) => !current)}
                  aria-label={showRegisterPassword ? "Ocultar senha" : "Mostrar senha"}
                  className={`absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer transition ${
                    isDark ? "text-zinc-400 hover:text-zinc-200" : "text-emerald-600 hover:text-emerald-800"
                  }`}
                >
                  {showRegisterPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="mt-2 space-y-1">
                <div className={`h-2 w-full overflow-hidden rounded-full ${isDark ? "bg-zinc-700" : "bg-emerald-200"}`}>
                  <div className={`h-full transition-all ${passwordStrength.widthClass} ${passwordStrength.colorClass}`} />
                </div>
                <p className={`text-xs ${isDark ? "text-zinc-400" : "text-emerald-700/80"}`}>
                  Forca da senha: {passwordStrength.label}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              <label htmlFor="confirm-password" className="text-sm font-medium">
                Confirmar senha
              </label>
              <div className="relative">
                <input
                  id="confirm-password"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  className={`w-full rounded-md border px-3 py-2.5 pr-11 text-sm outline-none transition focus:ring-2 ${
                    isDark
                      ? "border-zinc-700 bg-zinc-800 placeholder:text-zinc-500 focus:ring-emerald-500"
                      : "border-emerald-300 bg-white placeholder:text-emerald-400 focus:ring-emerald-400"
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  aria-label={showConfirmPassword ? "Ocultar senha" : "Mostrar senha"}
                  className={`absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer transition ${
                    isDark ? "text-zinc-400 hover:text-zinc-200" : "text-emerald-600 hover:text-emerald-800"
                  }`}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
              </>
            ) : null}

            <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs">
              <input type="checkbox" required className="mt-0.5 h-4 w-4 cursor-pointer accent-emerald-600" />
              <span>
                Eu aceito os{" "}
                <button
                  type="button"
                  onClick={() => openLegalModal("termos")}
                  className="cursor-pointer underline"
                >
                  Termos de Uso
                </button>{" "}
                e a{" "}
                <button
                  type="button"
                  onClick={() => openLegalModal("politica")}
                  className="cursor-pointer underline"
                >
                  Politica de Privacidade
                </button>
                .
              </span>
            </label>

            {registerEmailReadonly ? (
              <>
                <div className="my-4 flex min-w-0 items-center gap-3">
                  <div className={`h-px min-w-0 flex-1 ${isDark ? "bg-zinc-700" : "bg-emerald-300"}`} />
                  <span className={`shrink-0 text-xs ${isDark ? "text-zinc-400" : "text-emerald-700/80"}`}>
                    OU
                  </span>
                  <div className={`h-px min-w-0 flex-1 ${isDark ? "bg-zinc-700" : "bg-emerald-300"}`} />
                </div>
                <div className="flex items-center justify-center gap-4 pb-2">
                  <button
                    type="button"
                    aria-label="Continuar com Google"
                    onClick={() => {
                      const form = document.getElementById("register-form");
                      if (!(form instanceof HTMLFormElement)) return;
                      if (!form.checkValidity()) {
                        form.reportValidity();
                        return;
                      }
                      void oauthNavigateOrOpen({
                        provider: "google",
                        email: registerEmail,
                      });
                    }}
                    className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border transition ${
                      isDark
                        ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700"
                        : "border-emerald-300 bg-white hover:bg-emerald-100"
                    }`}
                  >
                    <FaGoogle size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="Continuar com Microsoft"
                    onClick={() => {
                      const form = document.getElementById("register-form");
                      if (!(form instanceof HTMLFormElement)) return;
                      if (!form.checkValidity()) {
                        form.reportValidity();
                        return;
                      }
                      void oauthNavigateOrOpen({
                        provider: "microsoft",
                        email: registerEmail,
                      });
                    }}
                    className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border transition ${
                      isDark
                        ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700"
                        : "border-emerald-300 bg-white hover:bg-emerald-100"
                    }`}
                  >
                    <FaMicrosoft size={18} />
                  </button>
                </div>
              </>
            ) : null}

            <div
              className={`mt-6 grid gap-3 pb-3 ${registerEmailReadonly ? "grid-cols-1" : "grid-cols-2"}`}
            >
              <button
                type="button"
                onClick={goToLogin}
                disabled={isRegisterLoading}
                className={`w-full cursor-pointer rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
                  isDark
                    ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700"
                    : "border-emerald-300 bg-emerald-100 hover:bg-emerald-200"
                }`}
              >
                Cancelar cadastro
              </button>
              {!registerEmailReadonly ? (
                <button
                  type="submit"
                  disabled={isRegisterLoading}
                  className="w-full cursor-pointer rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                >
                  Criar conta
                </button>
              ) : null}
            </div>
          </form>
        )}
        </div>

      </section>

      {showLegalModal && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/50 p-4">
          <div
            className={`w-full max-w-2xl rounded-xl border shadow-xl ${
              isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-emerald-300 bg-white text-emerald-950"
            }`}
          >
            <div className={`flex items-center justify-between border-b px-4 py-3 ${isDark ? "border-zinc-700" : "border-emerald-200"}`}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <button
                  type="button"
                  onClick={() => setLegalTab("termos")}
                  className={`cursor-pointer rounded-md px-2 py-1 ${legalTab === "termos" ? "bg-emerald-600 text-white" : ""}`}
                >
                  Termos
                </button>
                <button
                  type="button"
                  onClick={() => setLegalTab("politica")}
                  className={`cursor-pointer rounded-md px-2 py-1 ${legalTab === "politica" ? "bg-emerald-600 text-white" : ""}`}
                >
                  Politica
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowLegalModal(false)}
                aria-label="Fechar modal"
                className="cursor-pointer rounded-md p-1 hover:bg-zinc-200/20"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto px-4 py-4 text-sm leading-6">
              {legalLoading ? (
                <p className="flex items-center gap-2 text-sm">
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  A carregar documentos...
                </p>
              ) : legalFetchFailed || !legalBundle ? (
                <p>
                  Nao foi possivel carregar os termos e a politica. Confirme que a API esta a correr em
                  NEXT_PUBLIC_API_BASE e tente novamente.
                </p>
              ) : legalTab === "termos" ? (
                <>
                  <h2 className="text-base font-semibold">{legalBundle.terms.title}</h2>
                  <p className="text-xs opacity-70">
                    Versao {legalBundle.terms.versionLabel} ·{" "}
                    {new Date(legalBundle.terms.publishedAt).toLocaleDateString("pt-BR")}
                  </p>
                  {legalBundle.terms.content
                    .split(/\n\n+/)
                    .map((paragraph) => paragraph.trim())
                    .filter(Boolean)
                    .map((paragraph, idx) => (
                      <p key={`t-${idx}`}>{paragraph}</p>
                    ))}
                </>
              ) : (
                <>
                  <h2 className="text-base font-semibold">{legalBundle.privacy.title}</h2>
                  <p className="text-xs opacity-70">
                    Versao {legalBundle.privacy.versionLabel} ·{" "}
                    {new Date(legalBundle.privacy.publishedAt).toLocaleDateString("pt-BR")}
                  </p>
                  {legalBundle.privacy.content
                    .split(/\n\n+/)
                    .map((paragraph) => paragraph.trim())
                    .filter(Boolean)
                    .map((paragraph, idx) => (
                      <p key={`p-${idx}`}>{paragraph}</p>
                    ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showPhotoCropModal && cropSource && (
        <PhotoCropModal
          isDark={isDark}
          imageSrc={cropSource}
          crop={crop}
          zoom={zoom}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          onClose={() => {
            setShowPhotoCropModal(false);
            setCropSource(null);
            setPhotoCropPurpose("register");
          }}
          onCancel={() => {
            setShowPhotoCropModal(false);
            setCropSource(null);
            setPhotoCropPurpose("register");
          }}
          onApply={handleApplyPhotoCrop}
          applyDisabled={isAvatarUploading && photoCropPurpose === "settings"}
          applyLabel={
            isAvatarUploading && photoCropPurpose === "settings" ? "A guardar…" : "Aplicar"
          }
          idSuffix="-reg"
        />
      )}

      <NotificationAlert
        type="error"
        title="Algo correu mal"
        description={authError ?? ""}
        visible={!!authError}
        durationMs={5200}
        theme={isDark ? "dark" : "light"}
        onClose={() => setAuthError(null)}
      />

      <NotificationAlert
        type="sucesso"
        title="Login realizado"
        description="Carregando sua plataforma..."
        visible={showLoginSuccessAlert}
        durationMs={2000}
        theme={isDark ? "dark" : "light"}
        onClose={() => setShowLoginSuccessAlert(false)}
      />

      <NotificationAlert
        type="sucesso"
        title="Conta criada"
        description={registerSuccessMessage}
        visible={showRegisterSuccessAlert}
        durationMs={2000}
        theme={isDark ? "dark" : "light"}
        onClose={() => setShowRegisterSuccessAlert(false)}
      />

      <NotificationAlert
        type="sucesso"
        title="Download concluido"
        description="Arquivo salvo no local escolhido."
        visible={showDownloadSuccessAlert}
        durationMs={2200}
        theme={isDark ? "dark" : "light"}
        onClose={() => setShowDownloadSuccessAlert(false)}
      />

      <NotificationAlert
        type="error"
        title="Falha no download"
        description="Nao foi possivel baixar o arquivo."
        visible={showDownloadErrorAlert}
        durationMs={2600}
        theme={isDark ? "dark" : "light"}
        onClose={() => setShowDownloadErrorAlert(false)}
      />

      <NotificationAlert
        type="sucesso"
        title="Foto atualizada"
        description="A sua foto de perfil foi guardada."
        visible={showAvatarSuccessAlert}
        durationMs={2200}
        theme={isDark ? "dark" : "light"}
        onClose={() => setShowAvatarSuccessAlert(false)}
      />

      <NotificationAlert
        type="error"
        title="Foto de perfil"
        description={avatarUploadError ?? ""}
        visible={!!avatarUploadError}
        durationMs={5200}
        theme={isDark ? "dark" : "light"}
        onClose={() => setAvatarUploadError(null)}
      />

      {isRegisterLoading && (
        <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
          <LoaderCircle size={48} className="animate-spin text-emerald-400" />
          <p className="text-sm font-semibold text-white">Criando sua conta...</p>
        </div>
      )}

      {isLoginLoading && (
        <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
          <LoaderCircle size={48} className="animate-spin text-emerald-400" />
          <p className="text-sm font-semibold text-white">Entrando na plataforma...</p>
        </div>
      )}

      {isDownloadingAsset && (
        <div className="fixed inset-0 z-[96] flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-sm">
          <LoaderCircle size={42} className="animate-spin text-emerald-400" />
          <p className="text-sm font-semibold text-white">Baixando em segundo plano...</p>
        </div>
      )}
    </main>
  );
}
