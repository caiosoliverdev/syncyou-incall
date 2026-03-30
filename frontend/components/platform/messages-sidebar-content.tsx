"use client";

import {
  AtSign,
  BellOff,
  BookMarked,
  BookmarkCheck,
  CheckCheck,
  ContactRound,
  Eraser,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Lock,
  LockOpen,
  MessageCircleMore,
  Mic,
  Phone,
  Search,
  Trash2,
  UsersRound,
  Video,
  LogOut,
  Pin,
  PinOff,
} from "lucide-react";
import { MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  clearChatConversationForMeRequest,
  createGroupConversationRequest,
  leaveGroupConversationRequest,
  patchChatConversationPreferencesRequest,
  type CallLogListItem,
  type ChatConversationListItem,
  type ContactFriendRow,
  type PresenceStatus,
} from "@/lib/api";
import { isChatApiConversationId } from "@/lib/chat-map";
import { prettifyCanonicalMentionsInDraft } from "@/lib/group-mention";
import { NewConversationPopover } from "@/components/platform/new-conversation-popover";
import { CreateGroupWizardModal } from "@/components/platform/create-group-wizard-modal";

type MessageTab = "conversas" | "grupos" | "ligacoes";
type ConversationItem = {
  id: string;
  name: string;
  kind: "direct" | "group";
  groupSubtype?: "channel" | "call" | null;
  /** Presente em conversas directas vindas da API. */
  peerUserId?: string;
  peerAvatarUrl?: string | null;
  /** Grupo: foto do grupo (API). */
  groupAvatarUrl?: string | null;
  favorite: boolean;
  blocked: boolean;
  muted: boolean;
  lastMessageAt: string;
  unreadCount: number;
  unreadDot: boolean;
  lastMessageType: "texto" | "arquivo" | "imagem" | "audio" | "video" | "contato";
  lastMessagePreview: string;
  lastMessageSender?: string;
  /** Conversa API: amizade bloqueada (ninguém pode enviar). */
  friendshipBlocked?: boolean;
  /** Se bloqueado: eu bloqueei o outro. */
  blockedByMe?: boolean;
  /** Grupo: há menção ao utilizador em mensagem não lida. */
  hasUnreadMention?: boolean;
  unreadMentionMessageId?: string | null;
};

type CallHistoryItem = {
  id: string;
  conversationId: string;
  title: string;
  kind: "direct" | "group";
  groupSubtype?: "channel" | "call" | null;
  avatarUrl?: string | null;
  peerUserId?: string | null;
  muted: boolean;
  unreadCount: number;
  status: "ringing" | "ongoing" | "missed" | "completed";
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  missedAt: string | null;
  durationSeconds: number | null;
};

export type SelectedConversation = {
  id: string;
  name: string;
  kind: "direct" | "group";
  groupSubtype?: "channel" | "call" | null;
  peerUserId?: string;
  peerAvatarUrl?: string | null;
  groupAvatarUrl?: string | null;
  /** Grupo: ao abrir, id da mensagem com menção não lida (para saltar). */
  scrollToMessageIdOnOpen?: string | null;
};

function mapApiLastType(t: string): ConversationItem["lastMessageType"] {
  const lower = t.toLowerCase();
  if (lower === "arquivo" || lower === "document") return "arquivo";
  if (lower === "imagem" || lower === "image") return "imagem";
  if (lower === "video") return "video";
  if (lower === "audio") return "audio";
  if (lower === "contato" || lower === "contact") return "contato";
  return "texto";
}

interface MessagesSidebarContentProps {
  isDark: boolean;
  onSelectConversation?: (conversation: SelectedConversation) => void;
  conversationFlags?: Record<string, { blocked: boolean; favorite: boolean }>;
  onConversationFlagsChange?: (conversationId: string, flags: { blocked: boolean; favorite: boolean }) => void;
  /** Lista de conversas vindas da API (direct + grupos). */
  apiChatConversations?: ChatConversationListItem[];
  callLogs?: CallLogListItem[];
  friendsForNewChat?: ContactFriendRow[];
  onRefreshChatList?: () => void | Promise<void>;
  /** Carrega conversas mais antigas (janela de 7 dias anterior). */
  onLoadMoreChatConversations?: () => void | Promise<void>;
  chatListHasMore?: boolean;
  chatListLoadingMore?: boolean;
  /** Primeira carga da lista (placeholders). */
  chatListSkeleton?: boolean;
  /** Garante conversa directa e abre no painel (Nova conversa / Contatos). */
  onStartDirectChat?: (peerUserId: string, displayName: string) => Promise<void>;
  onAfterClearConversationForMe?: (conversationId: string) => void;
  /** Presença em tempo real (socket); para fallback usa-se `friendsForNewChat`. */
  peerPresenceLive?: Record<string, PresenceStatus>;
  /** Ao abrir "Nova conversa", recarrega a lista de amigos. */
  onRefreshFriendsForNewChat?: () => void;
  /** Bloquear/desbloquear contacto (persiste na API). `nextBlocked`: estado desejado após a acção. */
  onToggleBlockPeer?: (peerUserId: string, nextBlocked: boolean) => Promise<void>;
  /** Actualização optimista antes do PATCH (evita som de mensagem com lista ainda desactualizada). */
  onApiChatPreferencesOptimistic?: (
    conversationId: string,
    prefs: { muted?: boolean; favorite?: boolean },
  ) => void;
  /** Fixar conversas no topo da lista (local). */
  pinnedConversationIds?: string[];
  onTogglePinConversation?: (conversationId: string) => void;
  /** Silêncio temporário até timestamp (ms); expira no cliente. */
  mutedUntilByConversationId?: Record<string, number>;
  onMuteConversationPreset?: (
    conversationId: string,
    preset: "8h" | "tomorrow" | "forever" | "off",
  ) => void | Promise<void>;
}

export function MessagesSidebarContent({
  isDark,
  onSelectConversation,
  conversationFlags,
  onConversationFlagsChange,
  apiChatConversations,
  callLogs = [],
  friendsForNewChat,
  onRefreshChatList,
  onLoadMoreChatConversations,
  chatListHasMore = false,
  chatListLoadingMore = false,
  chatListSkeleton = false,
  onStartDirectChat,
  onAfterClearConversationForMe,
  peerPresenceLive,
  onRefreshFriendsForNewChat,
  onToggleBlockPeer,
  onApiChatPreferencesOptimistic,
  pinnedConversationIds = [],
  onTogglePinConversation,
  mutedUntilByConversationId = {},
  onMuteConversationPreset,
}: MessagesSidebarContentProps) {
  const [activeTab, setActiveTab] = useState<MessageTab>("conversas");
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    conversationId: string;
  } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [leaveGroupConfirmId, setLeaveGroupConfirmId] = useState<string | null>(null);

  const listScrollRef = useRef<HTMLDivElement>(null);
  const handleListScroll = useCallback(() => {
    const el = listScrollRef.current;
    if (!el || !chatListHasMore || chatListLoadingMore || !onLoadMoreChatConversations) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < 120) {
      void onLoadMoreChatConversations();
    }
  }, [chatListHasMore, chatListLoadingMore, onLoadMoreChatConversations]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [contextMenu]);

  const apiMapped: ConversationItem[] = useMemo(
    () =>
      (apiChatConversations ?? []).map((r) => {
        if (r.kind === "direct") {
          return {
            id: r.id,
            name: r.peerName,
            kind: "direct" as const,
            peerUserId: r.peerUserId,
            peerAvatarUrl: r.peerAvatarUrl,
            favorite: r.favorite ?? false,
            blocked: r.friendshipBlocked ?? false,
            friendshipBlocked: r.friendshipBlocked ?? false,
            blockedByMe: r.blockedByMe ?? false,
            muted: r.muted ?? false,
            lastMessageAt: r.lastMessageAt ?? new Date().toISOString(),
            unreadCount: r.unreadCount,
            unreadDot: false,
            lastMessageType: mapApiLastType(r.lastMessageType),
            lastMessagePreview: r.lastMessagePreview,
          };
        }
        return {
          id: r.id,
          name: r.title,
          kind: "group" as const,
          groupSubtype: r.groupSubtype ?? "channel",
          groupAvatarUrl: r.avatarUrl,
          favorite: r.favorite ?? false,
          blocked: false,
          muted: r.muted ?? false,
          lastMessageAt: r.lastMessageAt ?? new Date().toISOString(),
          unreadCount: r.unreadCount,
          unreadDot: false,
          lastMessageType: mapApiLastType(r.lastMessageType),
          lastMessagePreview: prettifyCanonicalMentionsInDraft(r.lastMessagePreview),
          hasUnreadMention: r.hasUnreadMention === true,
          unreadMentionMessageId: r.unreadMentionMessageId ?? null,
          ...(r.lastMessageSenderName != null && r.lastMessageSenderName !== ""
            ? { lastMessageSender: r.lastMessageSenderName }
            : {}),
        };
      }),
    [apiChatConversations],
  );

  const formatLastMessageDate = (dateString: string) => {
    const now = new Date();
    const messageDate = new Date(dateString);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDay = new Date(
      messageDate.getFullYear(),
      messageDate.getMonth(),
      messageDate.getDate(),
    );
    const diffInDays = Math.floor((today.getTime() - messageDay.getTime()) / 86400000);

    const hh = String(messageDate.getHours()).padStart(2, "0");
    const mm = String(messageDate.getMinutes()).padStart(2, "0");

    if (diffInDays <= 0) return `${hh}:${mm}`;
    if (diffInDays === 1) return "Ontem";
    if (diffInDays === 2) return "Anteontem";
    const dd = String(messageDate.getDate()).padStart(2, "0");
    const mo = String(messageDate.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mo} ${hh}:${mm}`;
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  };

  const presenceForPeer = (peerUserId: string | undefined): PresenceStatus | null => {
    if (!peerUserId) return null;
    return (
      peerPresenceLive?.[peerUserId] ??
      friendsForNewChat?.find((r) => r.peer.id === peerUserId)?.peer.presenceStatus ??
      "invisible"
    );
  };

  const effectiveConversations = useMemo(() => {
    const mockOnly = conversations.filter((c) => c.kind === "group");
    const merged = [...apiMapped, ...mockOnly];
    return merged.map((item): ConversationItem => {
      const externalFlags = conversationFlags?.[item.id];
      if (!externalFlags) return item;
      if (isChatApiConversationId(item.id)) {
        return { ...item, favorite: externalFlags.favorite ?? item.favorite };
      }
      return { ...item, favorite: externalFlags.favorite, blocked: externalFlags.blocked };
    });
  }, [conversations, apiMapped, conversationFlags]);

  const pinnedSet = useMemo(() => new Set(pinnedConversationIds), [pinnedConversationIds]);

  const sortWithPins = useCallback(
    (items: ConversationItem[]) =>
      [...items].sort((a, b) => {
        const pa = pinnedSet.has(a.id) ? 1 : 0;
        const pb = pinnedSet.has(b.id) ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return (
          new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
        );
      }),
    [pinnedSet],
  );

  const directConversations = sortWithPins(
    effectiveConversations.filter((item) => item.kind === "direct"),
  );
  const favoriteConversations = directConversations.filter((item) => item.favorite);
  const normalConversations = directConversations.filter((item) => !item.favorite);
  const groupConversations = sortWithPins(
    effectiveConversations.filter(
      (item) => item.kind === "group" && (item.groupSubtype ?? "channel") !== "call",
    ),
  );
  const favoriteGroupConversations = groupConversations.filter((item) => item.favorite);
  const normalGroupConversations = groupConversations.filter((item) => !item.favorite);
  const callHistory = useMemo<CallHistoryItem[]>(
    () =>
      callLogs.map((item) => {
        const linkedConversation =
          effectiveConversations.find((conversation) => conversation.id === item.conversationId) ?? null;
        return {
          id: item.id,
          conversationId: item.conversationId,
          title: linkedConversation?.name ?? item.title,
          kind: item.conversationKind,
          groupSubtype:
            linkedConversation?.kind === "group"
              ? linkedConversation.groupSubtype ?? item.conversationGroupSubtype ?? null
              : item.conversationGroupSubtype ?? null,
          avatarUrl:
            linkedConversation?.kind === "direct"
              ? linkedConversation.peerAvatarUrl ?? item.avatarUrl
              : linkedConversation?.kind === "group"
                ? linkedConversation.groupAvatarUrl ?? item.avatarUrl
                : item.avatarUrl,
          peerUserId:
            linkedConversation?.kind === "direct"
              ? linkedConversation.peerUserId ?? item.peerUserId ?? null
              : item.peerUserId ?? null,
          muted: linkedConversation?.muted ?? false,
          unreadCount: linkedConversation?.unreadCount ?? 0,
          status: item.status,
          startedAt: item.startedAt,
          answeredAt: item.answeredAt,
          endedAt: item.endedAt,
          missedAt: item.missedAt,
          durationSeconds: item.durationSeconds,
        };
      }),
    [callLogs, effectiveConversations],
  );

  const updateConversation = (id: string, updater: (item: ConversationItem) => ConversationItem) => {
    const item = effectiveConversations.find((c) => c.id === id);
    if (!item) return;
    const next = updater(item);
    if (conversations.some((c) => c.id === id)) {
      setConversations((current) => current.map((c) => (c.id === id ? next : c)));
    }
    if (!isChatApiConversationId(id)) {
      onConversationFlagsChange?.(id, { favorite: next.favorite, blocked: next.blocked });
    }
    setContextMenu(null);
  };

  const removeConversation = (id: string) => {
    setConversations((current) => current.filter((item) => item.id !== id));
    setContextMenu(null);
  };

  const openContextMenu = (event: MouseEvent<HTMLButtonElement>, conversationId: string) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, conversationId });
  };

  const selectConversation = useCallback(
    (item: ConversationItem) => {
      onSelectConversation?.({
        id: item.id,
        name: item.name,
        kind: item.kind,
        ...(item.peerUserId ? { peerUserId: item.peerUserId } : {}),
        ...(item.peerAvatarUrl != null ? { peerAvatarUrl: item.peerAvatarUrl } : {}),
        ...(item.kind === "group" && item.groupAvatarUrl != null
          ? { groupAvatarUrl: item.groupAvatarUrl }
          : {}),
        ...(item.kind === "group" ? { groupSubtype: item.groupSubtype ?? "channel" } : {}),
        ...(item.kind === "group" &&
        item.hasUnreadMention &&
        item.unreadMentionMessageId
          ? { scrollToMessageIdOnOpen: item.unreadMentionMessageId }
          : {}),
      });
    },
    [onSelectConversation],
  );

  const renderConversationCard = (item: ConversationItem) => {
    const showPresenceDot =
      item.kind === "direct" && item.peerUserId && isChatApiConversationId(item.id);
    const peerPresence = showPresenceDot ? presenceForPeer(item.peerUserId) : null;
    const showInCallStatus = item.kind === "direct" && peerPresence === "on_call";
    return (
    <button
      key={item.id}
      type="button"
      onClick={() => selectConversation(item)}
      onContextMenu={(event) => openContextMenu(event, item.id)}
      className={`flex w-full cursor-pointer items-start justify-between rounded-md px-2 py-2 text-left text-sm transition ${
        isDark ? "bg-zinc-800 hover:bg-zinc-700" : "bg-white hover:bg-zinc-100"
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative h-8 w-8 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-emerald-600 text-[11px] font-semibold text-white">
            {item.kind === "direct" && item.peerAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.peerAvatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : item.kind === "group" && item.groupAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.groupAvatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(item.name)
            )}
          </div>
          {peerPresence != null ? (
            <span
              className={`absolute right-0 bottom-0 z-[1] h-2 w-2 rounded-full ring-2 ${
                isDark ? "ring-zinc-800" : "ring-white"
              } ${
                peerPresence === "online"
                  ? "bg-emerald-500"
                  : peerPresence === "away"
                    ? "bg-amber-500"
                    : peerPresence === "busy"
                      ? "bg-red-500"
                      : peerPresence === "on_call"
                        ? "bg-emerald-400"
                      : "bg-zinc-400"
              }`}
              title={
                peerPresence === "online"
                  ? "Online"
                  : peerPresence === "away"
                    ? "Ausente"
                    : peerPresence === "busy"
                      ? "Ocupado"
                      : peerPresence === "on_call"
                        ? "Em ligação"
                      : "Invisível"
              }
              aria-hidden
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1 font-medium">
            <span className="truncate">{item.name}</span>
            {item.kind === "direct" && item.friendshipBlocked ? (
              <Lock size={12} className="shrink-0 opacity-70" aria-label="Bloqueado" />
            ) : null}
          </p>
          {showInCallStatus ? (
            <p
              className={`mt-0.5 flex items-center gap-1 text-[11px] font-medium ${
                isDark ? "text-emerald-300" : "text-emerald-700"
              }`}
            >
              <Phone size={12} className="shrink-0" />
              <span className="truncate">Em chamada</span>
            </p>
          ) : (
            renderLastMessagePreview(item)
          )}
        </div>
      </div>
      <div className="ml-2 flex min-w-[54px] shrink-0 flex-col items-end gap-1">
        <span className="text-[11px] opacity-60">{formatLastMessageDate(item.lastMessageAt)}</span>
        <div className="flex min-h-4 items-center gap-1">
          {item.kind === "group" && item.hasUnreadMention ? (
            <span title="Mencionou-te" className="flex h-4 w-4 items-center justify-center">
              <AtSign size={12} className="text-sky-500" aria-hidden />
            </span>
          ) : null}
          {item.muted ? (
            <span
              title={
                mutedUntilByConversationId[item.id]
                  ? `Silenciado até ${new Date(mutedUntilByConversationId[item.id]!).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : "Silenciado"
              }
            >
              <BellOff
                size={11}
                className={`${isDark ? "text-zinc-400" : "text-zinc-500"}`}
              />
            </span>
          ) : null}
          {item.unreadCount > 0 ? (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-semibold text-white">
              {item.unreadCount}
            </span>
          ) : item.unreadDot ? (
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          ) : (
            <span className="h-2.5 w-2.5" />
          )}
        </div>
      </div>
    </button>
    );
  };

  const contextConversation = contextMenu
    ? effectiveConversations.find((item) => item.id === contextMenu.conversationId) ?? null
    : null;
  const contextIsTemporaryCallGroup =
    contextConversation?.kind === "group" && (contextConversation.groupSubtype ?? "channel") === "call";
  const deleteConversation = deleteConfirmId
    ? effectiveConversations.find((item) => item.id === deleteConfirmId) ?? null
    : null;

  const renderLastMessagePreview = (item: ConversationItem) => {
    const previewText =
      item.kind === "group"
        ? `${item.lastMessageSender ?? "Membro"}: ${item.lastMessagePreview}`
        : item.lastMessageSender
          ? `${item.lastMessageSender}: ${item.lastMessagePreview}`
          : item.lastMessagePreview;
    const baseClass = `mt-0.5 flex items-center gap-1 text-[11px] ${
      isDark ? "text-zinc-400" : "text-zinc-500"
    }`;

    if (item.lastMessageType === "texto") {
      return (
        <p className={`${baseClass} truncate`}>
          {previewText}
        </p>
      );
    }

    if (item.lastMessageType === "arquivo") {
      return (
        <p className={`${baseClass} truncate`}>
          <FileText size={12} className="shrink-0" />
          <span className="truncate">{previewText}</span>
        </p>
      );
    }

    if (item.lastMessageType === "imagem") {
      return (
        <p className={`${baseClass} truncate`}>
          <ImageIcon size={12} className="shrink-0" />
          <span className="truncate">{previewText}</span>
        </p>
      );
    }

    if (item.lastMessageType === "video") {
      return (
        <p className={`${baseClass} truncate`}>
          <Video size={12} className="shrink-0" />
          <span className="truncate">{previewText}</span>
        </p>
      );
    }

    if (item.lastMessageType === "contato") {
      return (
        <p className={`${baseClass} truncate`}>
          <ContactRound size={12} className="shrink-0" />
          <span className="truncate">{previewText}</span>
        </p>
      );
    }

    return (
      <p className={`${baseClass} truncate`}>
        <Mic size={12} className="shrink-0" />
        <span className="truncate">{previewText}</span>
      </p>
    );
  };

  const tabClass = (tab: MessageTab) =>
    `flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition ${
      activeTab === tab
        ? "bg-emerald-600 text-white"
        : isDark
          ? "text-zinc-300 hover:bg-zinc-800"
          : "text-zinc-700 hover:bg-zinc-100"
    }`;

  const formatCallDate = (dateString: string) => {
    const d = new Date(dateString);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} ${hh}:${mi}`;
  };

  const formatCallDuration = (durationSeconds: number | null) => {
    if (durationSeconds == null || durationSeconds <= 0) return "Sem duração";
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  };

  const renderCallHistoryCard = (item: CallHistoryItem) => {
    const statusLabel =
      item.status === "missed"
        ? "Perdida"
        : item.status === "ongoing"
          ? "Em andamento"
          : item.status === "ringing"
            ? "Chamando"
            : "Efetuada";
    const linkedConversation =
      effectiveConversations.find((conversation) => conversation.id === item.conversationId) ?? null;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => {
          if (linkedConversation) {
            selectConversation(linkedConversation);
            return;
          }
          onSelectConversation?.({
            id: item.conversationId,
            name: item.title,
            kind: item.kind,
            ...(item.peerUserId ? { peerUserId: item.peerUserId } : {}),
            ...(item.kind === "direct" && item.avatarUrl ? { peerAvatarUrl: item.avatarUrl } : {}),
            ...(item.kind === "group" && item.avatarUrl ? { groupAvatarUrl: item.avatarUrl } : {}),
            ...(item.kind === "group" ? { groupSubtype: item.groupSubtype ?? "call" } : {}),
          });
        }}
        onContextMenu={(event) => openContextMenu(event, item.conversationId)}
        className={`flex w-full items-start justify-between rounded-md px-2 py-2 text-left text-sm transition ${
          isDark ? "bg-zinc-800 hover:bg-zinc-700" : "bg-white hover:bg-zinc-100"
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-emerald-600 text-[11px] font-semibold text-white">
            {item.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              getInitials(item.title)
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium">{item.title}</p>
            <p className={`mt-0.5 truncate text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              {statusLabel} · {formatCallDuration(item.durationSeconds)}
            </p>
          </div>
        </div>
        <div className="ml-2 flex shrink-0 flex-col items-end gap-1">
          <span className="text-[11px] opacity-60">{formatCallDate(item.startedAt)}</span>
          <div className="flex min-h-4 items-center gap-1">
            {item.muted ? (
              <span
                title={
                  mutedUntilByConversationId[item.conversationId]
                    ? `Silenciado até ${new Date(mutedUntilByConversationId[item.conversationId]!).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`
                    : "Silenciado"
                }
              >
                <BellOff
                  size={11}
                  className={`${isDark ? "text-zinc-400" : "text-zinc-500"}`}
                />
              </span>
            ) : null}
            {item.unreadCount > 0 ? (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] font-semibold text-white">
                {item.unreadCount}
              </span>
            ) : (
              <span className="h-2.5 w-2.5" />
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="relative">
        <Search
          size={16}
          className={`pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 ${
            isDark ? "text-zinc-500" : "text-zinc-400"
          }`}
        />
        <input
          type="text"
          placeholder="Pesquisar"
          className={`w-full rounded-md border py-2 pr-3 pl-8 text-sm outline-none transition focus:ring-2 ${
            isDark
              ? "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:ring-emerald-500"
              : "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400 focus:ring-emerald-400"
          }`}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <NewConversationPopover
          isDark={isDark}
          friends={friendsForNewChat ?? []}
          peerPresenceLive={peerPresenceLive}
          onOpen={onRefreshFriendsForNewChat}
          onSelectFriend={(peer) => {
            const name = `${peer.firstName} ${peer.lastName}`.trim() || peer.email;
            void onStartDirectChat?.(peer.id, name);
          }}
        />
        <button
          type="button"
          onClick={() => setCreateGroupOpen(true)}
          className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-semibold transition ${
            isDark
              ? "border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
              : "border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
          }`}
        >
          <UsersRound size={14} />
          Criar grupo
        </button>
      </div>

      <CreateGroupWizardModal
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        isDark={isDark}
        friends={friendsForNewChat ?? []}
        onSubmit={async (params) => {
          const r = await createGroupConversationRequest(params);
          await onRefreshChatList?.();
          onSelectConversation?.({
            id: r.conversationId,
            name: r.title,
            kind: "group",
            ...(r.avatarUrl ? { groupAvatarUrl: r.avatarUrl } : {}),
          });
        }}
      />

      <div
        className={`mt-4 flex items-center gap-1 rounded-lg p-1 ${
          isDark ? "bg-zinc-800" : "bg-zinc-100"
        }`}
      >
        <button type="button" onClick={() => setActiveTab("conversas")} className={tabClass("conversas")}>
          <ContactRound size={13} />
          Conversas
        </button>
        <button type="button" onClick={() => setActiveTab("grupos")} className={tabClass("grupos")}>
          <UsersRound size={13} />
          Grupos
        </button>
        <button type="button" onClick={() => setActiveTab("ligacoes")} className={tabClass("ligacoes")}>
          <Phone size={13} />
          Ligacoes
        </button>
      </div>

      <div
        ref={listScrollRef}
        onScroll={handleListScroll}
        className={`mt-3 min-h-0 flex-1 overflow-y-auto rounded-lg p-2 ${isDark ? "bg-zinc-900" : "bg-zinc-50"}`}
      >
        {activeTab === "conversas" ? (
          chatListSkeleton ? (
            <div className="space-y-3" aria-busy="true" aria-label="A carregar conversas">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className={`flex animate-pulse gap-3 rounded-lg border p-2.5 ${
                    isDark ? "border-zinc-800 bg-zinc-800/40" : "border-zinc-200 bg-white/80"
                  }`}
                >
                  <div
                    className={`h-12 w-12 shrink-0 rounded-full ${isDark ? "bg-zinc-700" : "bg-zinc-200"}`}
                  />
                  <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                    <div className={`h-3.5 w-2/3 rounded ${isDark ? "bg-zinc-700" : "bg-zinc-200"}`} />
                    <div className={`h-3 w-full rounded ${isDark ? "bg-zinc-700/80" : "bg-zinc-200/90"}`} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div className="space-y-4">
            <div>
              <p
                className={`mb-2 text-[11px] font-semibold uppercase tracking-wider ${
                  isDark ? "text-zinc-400" : "text-zinc-500"
                }`}
              >
                Conversas Favoritas
              </p>
              <div className="space-y-2">
                {favoriteConversations.map((item) => renderConversationCard(item))}
              </div>
            </div>

            <div>
              <p
                className={`mb-2 text-[11px] font-semibold uppercase tracking-wider ${
                  isDark ? "text-zinc-400" : "text-zinc-500"
                }`}
              >
                Conversas
              </p>
              <div className="space-y-2">
                {normalConversations.map((item) => renderConversationCard(item))}
              </div>
            </div>
            {chatListLoadingMore ? (
              <div className="flex justify-center py-3">
                <LoaderCircle
                  className={`h-6 w-6 animate-spin ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
                  aria-hidden
                />
              </div>
            ) : null}
          </div>
          )
        ) : activeTab === "grupos" ? (
          chatListSkeleton ? (
            <div className="space-y-3" aria-busy="true" aria-label="A carregar grupos">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`flex animate-pulse gap-3 rounded-lg border p-2.5 ${
                    isDark ? "border-zinc-800 bg-zinc-800/40" : "border-zinc-200 bg-white/80"
                  }`}
                >
                  <div
                    className={`h-12 w-12 shrink-0 rounded-full ${isDark ? "bg-zinc-700" : "bg-zinc-200"}`}
                  />
                  <div className="min-w-0 flex-1 space-y-2 pt-0.5">
                    <div className={`h-3.5 w-2/3 rounded ${isDark ? "bg-zinc-700" : "bg-zinc-200"}`} />
                    <div className={`h-3 w-full rounded ${isDark ? "bg-zinc-700/80" : "bg-zinc-200/90"}`} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div className="space-y-4">
            <div>
              <p
                className={`mb-2 text-[11px] font-semibold uppercase tracking-wider ${
                  isDark ? "text-zinc-400" : "text-zinc-500"
                }`}
              >
                Grupos Favoritos
              </p>
              <div className="space-y-2">
                {favoriteGroupConversations.map((item) => renderConversationCard(item))}
              </div>
            </div>
            <div>
              <p
                className={`mb-2 text-[11px] font-semibold uppercase tracking-wider ${
                  isDark ? "text-zinc-400" : "text-zinc-500"
                }`}
              >
                Grupos
              </p>
              <div className="space-y-2">
                {normalGroupConversations.map((item) => renderConversationCard(item))}
              </div>
            </div>
            {chatListLoadingMore ? (
              <div className="flex justify-center py-3">
                <LoaderCircle
                  className={`h-6 w-6 animate-spin ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
                  aria-hidden
                />
              </div>
            ) : null}
          </div>
          )
        ) : activeTab === "ligacoes" ? (
          <div className="space-y-2">
            {callHistory.length === 0 ? (
              <div
                className={`rounded-xl border px-4 py-6 text-center text-sm ${
                  isDark ? "border-zinc-800 bg-zinc-900 text-zinc-400" : "border-zinc-200 bg-white text-zinc-500"
                }`}
              >
                Ainda não há ligações registradas.
              </div>
            ) : (
              callHistory.map((item) => renderCallHistoryCard(item))
            )}
          </div>
        ) : null}
      </div>

      {contextMenu ? (
        <div
          className={`fixed z-[230] w-56 rounded-xl border p-1.5 shadow-2xl ${
            isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-zinc-300 bg-white text-zinc-900"
          }`}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
              isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
            }`}
            onClick={() => {
              const id = contextMenu.conversationId;
              onTogglePinConversation?.(id);
              setContextMenu(null);
            }}
          >
            {pinnedSet.has(contextMenu.conversationId) ? (
              <PinOff size={14} />
            ) : (
              <Pin size={14} />
            )}
            {pinnedSet.has(contextMenu.conversationId) ? "Desfixar" : "Fixar no topo"}
          </button>

          <button
            type="button"
            className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
              isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
            }`}
            onClick={() => {
              const id = contextMenu.conversationId;
              const item = effectiveConversations.find((c) => c.id === id);
              if (!item) return;
              if (isChatApiConversationId(id)) {
                const nextFavorite = !item.favorite;
                onApiChatPreferencesOptimistic?.(id, { favorite: nextFavorite });
                void (async () => {
                  try {
                    await patchChatConversationPreferencesRequest(id, { favorite: nextFavorite });
                    await onRefreshChatList?.();
                  } catch {
                    /* ignore */
                  }
                  setContextMenu(null);
                })();
                return;
              }
              updateConversation(id, (i) => ({ ...i, favorite: !i.favorite }));
            }}
          >
            {contextConversation?.favorite ? <BookmarkCheck size={14} /> : <BookMarked size={14} />}
            {contextConversation?.favorite ? "Remover dos favoritos" : "Favoritar"}
          </button>

          {contextConversation && !isChatApiConversationId(contextConversation.id) ? (
            <>
              {contextConversation.unreadCount > 0 ? (
                <button
                  type="button"
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                    isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
                  }`}
                  onClick={() =>
                    updateConversation(contextMenu.conversationId, (item) => ({
                      ...item,
                      unreadCount: 0,
                      unreadDot: false,
                    }))
                  }
                >
                  <CheckCheck size={14} />
                  Marcar como lida
                </button>
              ) : (
                <button
                  type="button"
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                    isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
                  }`}
                  onClick={() =>
                    updateConversation(contextMenu.conversationId, (item) => ({
                      ...item,
                      unreadCount: 0,
                      unreadDot: true,
                    }))
                  }
                >
                  <MessageCircleMore size={14} />
                  Marcar como nao lida
                </button>
              )}

              <button
                type="button"
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                  isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
                }`}
                onClick={() =>
                  updateConversation(contextMenu.conversationId, (item) => ({
                    ...item,
                    unreadCount: 0,
                    unreadDot: false,
                  }))
                }
              >
                <Eraser size={14} />
                Limpar conversa
              </button>
            </>
          ) : null}

          {contextConversation?.kind === "direct" || contextConversation?.kind === "group" ? (
            isChatApiConversationId(contextMenu.conversationId) ? (
              <>
                <button
                  type="button"
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                    isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
                  }`}
                  onClick={() => {
                    const id = contextMenu.conversationId;
                    void onMuteConversationPreset?.(id, "8h");
                    setContextMenu(null);
                  }}
                >
                  <BellOff size={14} />
                  Silenciar 8 horas
                </button>
                <button
                  type="button"
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                    isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
                  }`}
                  onClick={() => {
                    const id = contextMenu.conversationId;
                    void onMuteConversationPreset?.(id, "tomorrow");
                    setContextMenu(null);
                  }}
                >
                  <BellOff size={14} />
                  Silenciar ate amanha (9h)
                </button>
                <button
                  type="button"
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                    isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
                  }`}
                  onClick={() => {
                    const id = contextMenu.conversationId;
                    void onMuteConversationPreset?.(id, "forever");
                    setContextMenu(null);
                  }}
                >
                  <BellOff size={14} />
                  Silenciar sempre
                </button>
                {contextConversation.muted ? (
                  <button
                    type="button"
                    className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                      isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
                    }`}
                    onClick={() => {
                      const id = contextMenu.conversationId;
                      void onMuteConversationPreset?.(id, "off");
                      setContextMenu(null);
                    }}
                  >
                    <BellOff size={14} />
                    Remover silencio
                  </button>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                  isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
                }`}
                onClick={() => {
                  const id = contextMenu.conversationId;
                  const item = effectiveConversations.find((c) => c.id === id);
                  if (!item) return;
                  updateConversation(id, (i) => ({ ...i, muted: !i.muted }));
                }}
              >
                <BellOff size={14} />
                {contextConversation.muted ? "Remover silencio" : "Silenciar"}
              </button>
            )
          ) : null}
          {contextConversation?.kind === "direct" &&
          isChatApiConversationId(contextMenu.conversationId) &&
          contextConversation.peerUserId ? (
            (() => {
              const item = effectiveConversations.find((c) => c.id === contextMenu.conversationId);
              if (!item || item.kind !== "direct") return null;
              const fb = item.friendshipBlocked ?? false;
              const bm = item.blockedByMe ?? false;
              if (fb && !bm) {
                return (
                  <div
                    className={`px-3 py-2 text-xs ${isDark ? "text-zinc-400" : "text-zinc-600"}`}
                  >
                    Este contacto bloqueou-o. Não pode enviar mensagens.
                  </div>
                );
              }
              return (
                <button
                  type="button"
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                    isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
                  }`}
                  onClick={() => {
                    const pid = item.peerUserId;
                    if (!pid) return;
                    void (async () => {
                      try {
                        await onToggleBlockPeer?.(pid, !fb);
                        await onRefreshChatList?.();
                      } catch {
                        /* ignore */
                      }
                      setContextMenu(null);
                    })();
                  }}
                >
                  {fb ? <LockOpen size={14} /> : <Lock size={14} />}
                  {fb ? "Desbloquear" : "Bloquear"}
                </button>
              );
            })()
          ) : contextConversation?.kind === "direct" &&
            !isChatApiConversationId(contextMenu.conversationId) ? (
            <button
              type="button"
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${
                isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
              }`}
              onClick={() =>
                updateConversation(contextMenu.conversationId, (item) => ({
                  ...item,
                  blocked: !item.blocked,
                  unreadCount: 0,
                  unreadDot: false,
                }))
              }
            >
              {contextConversation?.blocked ? <LockOpen size={14} /> : <Lock size={14} />}
              {contextConversation?.blocked ? "Desbloquear" : "Bloquear"}
            </button>
          ) : null}
          <div className={`my-1 h-px ${isDark ? "bg-zinc-700" : "bg-zinc-200"}`} />
          {contextConversation?.kind === "group" && !contextIsTemporaryCallGroup ? (
            <button
              type="button"
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-500 ${
                isDark ? "hover:bg-zinc-800" : "hover:bg-red-50"
              }`}
              onClick={() => {
                setLeaveGroupConfirmId(contextMenu.conversationId);
                setContextMenu(null);
              }}
            >
              <LogOut size={14} />
              Sair do grupo
            </button>
          ) : (
            <button
              type="button"
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-500 ${
                isDark ? "hover:bg-zinc-800" : "hover:bg-red-50"
              }`}
              onClick={() => {
                setDeleteConfirmId(contextMenu.conversationId);
                setContextMenu(null);
              }}
            >
              <Trash2 size={14} />
              Excluir
            </button>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={leaveGroupConfirmId !== null}
        title="Sair do grupo?"
        description="Deixa de ver esta conversa na lista. Os outros membros continuam no grupo."
        confirmText="Sair do grupo"
        cancelText="Cancelar"
        isDark={isDark}
        onCancel={() => setLeaveGroupConfirmId(null)}
        onConfirm={() => {
          const id = leaveGroupConfirmId;
          setLeaveGroupConfirmId(null);
          if (!id) return;
          if (isChatApiConversationId(id)) {
            void (async () => {
              try {
                await leaveGroupConversationRequest(id);
                await onRefreshChatList?.();
                onAfterClearConversationForMe?.(id);
              } catch {
                /* ignore */
              }
            })();
            return;
          }
          removeConversation(id);
          onAfterClearConversationForMe?.(id);
        }}
      />

      <ConfirmDialog
        open={deleteConfirmId !== null}
        title="Excluir conversa?"
        description={
          deleteConfirmId && isChatApiConversationId(deleteConfirmId)
            ? deleteConversation?.kind === "group" && (deleteConversation.groupSubtype ?? "channel") === "call"
              ? "O historico desta ligacao deixa de aparecer para si. Os outros participantes continuam a ver o historico deles."
              : "O historico deixa de aparecer para si. A outra pessoa continua a ver o historico dela. Se voltar a falar com esta pessoa, o seu historico nao e recuperado."
            : "Essa acao nao pode ser desfeita."
        }
        confirmText="Excluir"
        cancelText="Cancelar"
        isDark={isDark}
        onCancel={() => setDeleteConfirmId(null)}
        onConfirm={() => {
          const id = deleteConfirmId;
          setDeleteConfirmId(null);
          if (!id) return;
          if (isChatApiConversationId(id)) {
            void (async () => {
              try {
                await clearChatConversationForMeRequest(id);
                await onRefreshChatList?.();
                onAfterClearConversationForMe?.(id);
              } catch {
                /* ignore */
              }
            })();
            return;
          }
          removeConversation(id);
        }}
      />
    </div>
  );
}
