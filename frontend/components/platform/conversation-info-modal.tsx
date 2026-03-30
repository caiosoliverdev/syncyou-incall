"use client";

import {
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Globe,
  Info,
  LoaderCircle,
  Mail,
  Mic,
  Phone,
  MoreVertical,
  Search,
  Shield,
  Trash2,
  UserPlus,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Area } from "react-easy-crop";
import {
  AttachmentPreviewModal,
  type AttachmentPreviewPayload,
} from "@/components/platform/attachment-preview-modal";
import { ChatAudioPlayer } from "@/components/platform/chat-audio-player";
import { PhotoCropModal } from "@/components/photo-crop-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  FaDiscord,
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaYoutube,
} from "react-icons/fa";
import type { ContactFriendRow, ContactPeer, ConversationMediaPageItem, PresenceStatus } from "@/lib/api";
import {
  addGroupMembersRequest,
  deleteGroupConversationRequest,
  getContactPeerProfileRequest,
  listConversationMediaPageRequest,
  patchGroupDetailsRequest,
  removeGroupMemberRequest,
  setGroupMemberRoleRequest,
  uploadGroupAvatarRequest,
} from "@/lib/api";
import { chatFilePublicUrl } from "@/lib/chat-map";
import { formatGroupRoleLabel, parseGroupRole, type GroupRole } from "@/lib/group-role";
import type { SelectedConversation } from "@/components/platform/messages-sidebar-content";

const MEDIA_PAGE_SIZE = 18;

function guessFileNameFromUrl(url: string, fallback: string): string {
  try {
    const path = new URL(url).pathname.split("/").filter(Boolean).pop();
    if (path && path.includes(".")) return decodeURIComponent(path);
  } catch {
    /* ignore */
  }
  return fallback;
}

function isPdfFileName(name: string): boolean {
  return /\.pdf$/i.test(name);
}

/** Ligação clicável quando o valor parece URL ou domínio; caso contrário só texto. */
function normalizeExternalHref(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(t)) return `https://${t}`;
  return null;
}

function waMeHrefFromPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `https://wa.me/${digits}`;
}

function directPeerHasPublicExtras(p: ContactPeer | null | undefined): boolean {
  if (!p) return false;
  return Boolean(
    p.phoneWhatsapp?.trim() ||
      p.socialDiscord?.trim() ||
      p.socialLinkedin?.trim() ||
      p.socialYoutube?.trim() ||
      p.socialInstagram?.trim() ||
      p.socialFacebook?.trim() ||
      p.websiteUrl?.trim(),
  );
}

function formatMediaSentAtLabel(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

type FotosGridItem =
  | { kind: "image"; id: string; title: string; src: string; sentAt: string }
  | { kind: "video"; id: string; title: string; src: string; posterSrc?: string; sentAt: string };

type ArquivosListItem =
  | { kind: "document"; id: string; name: string; sentAt: string; url: string }
  | { kind: "audio"; id: string; title: string; sentAt: string; src: string };

type GroupMember = {
  id: string;
  name: string;
  email?: string;
  role: string;
  avatarUrl?: string | null;
  isFriend: boolean;
  callStatus?: "active" | "left" | "invited" | "participated" | "missed";
};

type SidebarPage = "integrantes" | "midias" | "informacoes";
type MidiasSub = "fotos-videos" | "arquivos-audios";

async function getCroppedImageFile(imageSrc: string, area: Area): Promise<File | null> {
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
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        resolve(new File([blob], "group-avatar.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  });
}

export type ConversationInfoModalProps = {
  isDark: boolean;
  open: boolean;
  onClose: () => void;
  selectedConversation: SelectedConversation;
  sessionUserId: string | null;
  isApiChat: boolean;
  groupDescriptionFromList: string | null;
  chatThreadAvatarUrl: string | null;
  getInitials: (name: string) => string;
  groupMembers: GroupMember[];
  peerPresenceLive: Record<string, PresenceStatus>;
  contactOutgoingRequestPeerIds: Set<string>;
  onSendFriendRequest: (userId: string) => void;
  onRefreshMembers: () => void;
  onRefreshChatList: () => void;
  onDownloadFile: (url: string, name: string) => void;
  /** Dados públicos do contacto (lista de amigos); null se não estiver na lista. */
  directPeerProfile: ContactPeer | null;
  favorite: boolean;
  blocked: boolean;
  blockedByPeer: boolean;
  onToggleFavorite: () => void;
  onToggleBlock: () => void;
  friendsForPicker: ContactFriendRow[];
  onAfterDeleteGroup?: () => void;
};

export function ConversationInfoModal({
  isDark,
  open,
  onClose,
  selectedConversation,
  sessionUserId,
  isApiChat,
  groupDescriptionFromList,
  chatThreadAvatarUrl,
  getInitials,
  groupMembers,
  peerPresenceLive,
  contactOutgoingRequestPeerIds,
  onSendFriendRequest,
  onRefreshMembers,
  onRefreshChatList,
  onDownloadFile,
  directPeerProfile,
  favorite,
  blocked,
  blockedByPeer,
  onToggleFavorite,
  onToggleBlock,
  friendsForPicker,
  onAfterDeleteGroup,
}: ConversationInfoModalProps) {
  const isGroup = selectedConversation.kind === "group";
  const isCallGroupConversation = isGroup && selectedConversation.groupSubtype === "call";
  const [page, setPage] = useState<SidebarPage>(isGroup ? "integrantes" : "midias");
  const [midiasSub, setMidiasSub] = useState<MidiasSub>("fotos-videos");
  const [memberQuery, setMemberQuery] = useState("");
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreviewPayload | null>(null);
  const closeAttachmentPreview = useCallback(() => setAttachmentPreview(null), []);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [selectedAddIds, setSelectedAddIds] = useState<Set<string>>(new Set());
  const [addMembersBusy, setAddMembersBusy] = useState(false);
  const [groupName, setGroupName] = useState(selectedConversation.name);
  const [groupDesc, setGroupDesc] = useState(groupDescriptionFromList ?? "");
  const [infoSaving, setInfoSaving] = useState(false);
  const [deleteGroupOpen, setDeleteGroupOpen] = useState(false);
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);
  const [showCrop, setShowCrop] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [fotosItems, setFotosItems] = useState<FotosGridItem[]>([]);
  const [fotosNext, setFotosNext] = useState<{ sentAt: string; messageId: string } | null>(null);
  const [fotosHasMore, setFotosHasMore] = useState(false);
  const [fotosLoading, setFotosLoading] = useState(false);
  const [fotosLoadingMore, setFotosLoadingMore] = useState(false);

  const [arquivosItems, setArquivosItems] = useState<ArquivosListItem[]>([]);
  const [arquivosNext, setArquivosNext] = useState<{ sentAt: string; messageId: string } | null>(null);
  const [arquivosHasMore, setArquivosHasMore] = useState(false);
  const [arquivosLoading, setArquivosLoading] = useState(false);
  const [arquivosLoadingMore, setArquivosLoadingMore] = useState(false);

  const midiasScrollRef = useRef<HTMLDivElement>(null);
  const fotosLoadedRef = useRef(false);
  const arquivosLoadedRef = useRef(false);
  const mediaConvKeyRef = useRef<string>("");
  const peerProfilePeerIdRef = useRef<string | null>(null);

  /** Perfil vindo do GET /contacts/peers/:id/profile (dados actuais; a lista de amigos pode estar em cache). */
  const [peerProfileFromApi, setPeerProfileFromApi] = useState<ContactPeer | null>(null);
  const [peerProfileLoading, setPeerProfileLoading] = useState(false);

  const directPeerForDisplay = peerProfileFromApi ?? directPeerProfile;

  const mapFotosItem = useCallback((it: ConversationMediaPageItem): FotosGridItem | null => {
    if (it.kind === "image") {
      return {
        kind: "image",
        id: it.id,
        title: it.title?.trim() || "Imagem",
        src: chatFilePublicUrl(it.path),
        sentAt: formatMediaSentAtLabel(it.sentAt),
      };
    }
    if (it.kind === "video") {
      return {
        kind: "video",
        id: it.id,
        title: it.title?.trim() || "Vídeo",
        src: chatFilePublicUrl(it.path),
        posterSrc: it.posterPath ? chatFilePublicUrl(it.posterPath) : undefined,
        sentAt: formatMediaSentAtLabel(it.sentAt),
      };
    }
    return null;
  }, []);

  const mapArquivosItem = useCallback((it: ConversationMediaPageItem): ArquivosListItem | null => {
    if (it.kind === "document") {
      return {
        kind: "document",
        id: it.id,
        name: it.fileName,
        sentAt: formatMediaSentAtLabel(it.sentAt),
        url: chatFilePublicUrl(it.path),
      };
    }
    if (it.kind === "audio") {
      return {
        kind: "audio",
        id: it.id,
        title: it.title?.trim() || "Áudio",
        sentAt: formatMediaSentAtLabel(it.sentAt),
        src: chatFilePublicUrl(it.path),
      };
    }
    return null;
  }, []);

  const loadFotosFirst = useCallback(async () => {
    if (!isApiChat) return;
    setFotosLoading(true);
    setFotosItems([]);
    setFotosNext(null);
    setFotosHasMore(false);
    try {
      const r = await listConversationMediaPageRequest(selectedConversation.id, {
        tab: "fotos-videos",
        limit: MEDIA_PAGE_SIZE,
      });
      const rows: FotosGridItem[] = [];
      for (const it of r.items) {
        const m = mapFotosItem(it);
        if (m) rows.push(m);
      }
      setFotosItems(rows);
      setFotosNext(r.nextCursor);
      setFotosHasMore(r.hasMore);
    } catch {
      setFotosItems([]);
    } finally {
      setFotosLoading(false);
    }
  }, [isApiChat, selectedConversation.id, mapFotosItem]);

  const loadArquivosFirst = useCallback(async () => {
    if (!isApiChat) return;
    setArquivosLoading(true);
    setArquivosItems([]);
    setArquivosNext(null);
    setArquivosHasMore(false);
    try {
      const r = await listConversationMediaPageRequest(selectedConversation.id, {
        tab: "arquivos-audios",
        limit: MEDIA_PAGE_SIZE,
      });
      const rows: ArquivosListItem[] = [];
      for (const it of r.items) {
        const m = mapArquivosItem(it);
        if (m) rows.push(m);
      }
      setArquivosItems(rows);
      setArquivosNext(r.nextCursor);
      setArquivosHasMore(r.hasMore);
    } catch {
      setArquivosItems([]);
    } finally {
      setArquivosLoading(false);
    }
  }, [isApiChat, selectedConversation.id, mapArquivosItem]);

  const loadFotosMore = useCallback(async () => {
    if (!isApiChat || !fotosNext || !fotosHasMore || fotosLoadingMore) return;
    setFotosLoadingMore(true);
    try {
      const r = await listConversationMediaPageRequest(selectedConversation.id, {
        tab: "fotos-videos",
        limit: MEDIA_PAGE_SIZE,
        cursorSentAt: fotosNext.sentAt,
        cursorMessageId: fotosNext.messageId,
      });
      const rows: FotosGridItem[] = [];
      for (const it of r.items) {
        const m = mapFotosItem(it);
        if (m) rows.push(m);
      }
      setFotosItems((prev) => [...prev, ...rows]);
      setFotosNext(r.nextCursor);
      setFotosHasMore(r.hasMore);
    } catch {
      /* ignore */
    } finally {
      setFotosLoadingMore(false);
    }
  }, [isApiChat, selectedConversation.id, fotosNext, fotosHasMore, fotosLoadingMore, mapFotosItem]);

  const loadArquivosMore = useCallback(async () => {
    if (!isApiChat || !arquivosNext || !arquivosHasMore || arquivosLoadingMore) return;
    setArquivosLoadingMore(true);
    try {
      const r = await listConversationMediaPageRequest(selectedConversation.id, {
        tab: "arquivos-audios",
        limit: MEDIA_PAGE_SIZE,
        cursorSentAt: arquivosNext.sentAt,
        cursorMessageId: arquivosNext.messageId,
      });
      const rows: ArquivosListItem[] = [];
      for (const it of r.items) {
        const m = mapArquivosItem(it);
        if (m) rows.push(m);
      }
      setArquivosItems((prev) => [...prev, ...rows]);
      setArquivosNext(r.nextCursor);
      setArquivosHasMore(r.hasMore);
    } catch {
      /* ignore */
    } finally {
      setArquivosLoadingMore(false);
    }
  }, [isApiChat, selectedConversation.id, arquivosNext, arquivosHasMore, arquivosLoadingMore, mapArquivosItem]);

  const handleMidiasScroll = useCallback(() => {
    const el = midiasScrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (!nearBottom) return;
    if (midiasSub === "fotos-videos") {
      if (fotosHasMore && !fotosLoadingMore) void loadFotosMore();
    } else if (arquivosHasMore && !arquivosLoadingMore) {
      void loadArquivosMore();
    }
  }, [
    midiasSub,
    fotosHasMore,
    fotosLoadingMore,
    arquivosHasMore,
    arquivosLoadingMore,
    loadFotosMore,
    loadArquivosMore,
  ]);

  useEffect(() => {
    if (!open) {
      mediaConvKeyRef.current = "";
    }
    fotosLoadedRef.current = false;
    arquivosLoadedRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!open || !isApiChat) return;
    const key = selectedConversation.id;
    if (mediaConvKeyRef.current !== key) {
      mediaConvKeyRef.current = key;
      fotosLoadedRef.current = false;
      arquivosLoadedRef.current = false;
      setFotosItems([]);
      setArquivosItems([]);
      setFotosNext(null);
      setArquivosNext(null);
      setFotosHasMore(false);
      setArquivosHasMore(false);
    }
  }, [open, isApiChat, selectedConversation.id]);

  useEffect(() => {
    if (!open || isGroup || !isApiChat || selectedConversation.kind !== "direct") {
      peerProfilePeerIdRef.current = null;
      setPeerProfileFromApi(null);
      setPeerProfileLoading(false);
      return;
    }
    const pid = selectedConversation.peerUserId;
    if (!pid) {
      peerProfilePeerIdRef.current = null;
      setPeerProfileFromApi(null);
      setPeerProfileLoading(false);
      return;
    }
    if (peerProfilePeerIdRef.current !== pid) {
      peerProfilePeerIdRef.current = pid;
      setPeerProfileFromApi(null);
    }
    let cancelled = false;
    setPeerProfileLoading(true);
    void getContactPeerProfileRequest(pid)
      .then((r) => {
        if (!cancelled) setPeerProfileFromApi(r.peer);
      })
      .catch(() => {
        if (!cancelled) {
          /* Mantém fallback `directPeerProfile` da lista em cache. */
        }
      })
      .finally(() => {
        if (!cancelled) setPeerProfileLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isGroup, isApiChat, selectedConversation.kind, selectedConversation.id, selectedConversation.peerUserId]);

  useEffect(() => {
    if (!open || !isApiChat || page !== "midias") return;
    if (midiasSub === "fotos-videos" && !fotosLoadedRef.current) {
      fotosLoadedRef.current = true;
      void loadFotosFirst();
    }
    if (midiasSub === "arquivos-audios" && !arquivosLoadedRef.current) {
      arquivosLoadedRef.current = true;
      void loadArquivosFirst();
    }
  }, [open, isApiChat, page, midiasSub, loadFotosFirst, loadArquivosFirst]);

  useEffect(() => {
    if (open) {
      setGroupName(selectedConversation.name);
      setGroupDesc(groupDescriptionFromList ?? "");
      setPage(isGroup ? "integrantes" : "midias");
      setMidiasSub("fotos-videos");
      setMemberQuery("");
      setMenuUserId(null);
      setAttachmentPreview(null);
    }
  }, [open, selectedConversation.name, groupDescriptionFromList, isGroup]);

  const myRole: GroupRole | null = useMemo(() => {
    if (!isGroup || !sessionUserId) return null;
    const me = groupMembers.find((m) => m.id === sessionUserId);
    return me ? parseGroupRole(me.role) : null;
  }, [isGroup, sessionUserId, groupMembers]);

  const memberIds = useMemo(() => new Set(groupMembers.map((m) => m.id)), [groupMembers]);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    let list = groupMembers;
    if (q) {
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          (m.email && m.email.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [groupMembers, memberQuery]);

  const presenceDotClass = (p: PresenceStatus | undefined) => {
    if (p === "online") return "bg-emerald-500";
    if (p === "away") return "bg-amber-500";
    if (p === "on_call") return "bg-emerald-400";
    if (p === "busy") return "bg-red-500";
    return "bg-zinc-400";
  };

  const callStatusBadge = useCallback(
    (status: GroupMember["callStatus"]) => {
      switch (status) {
        case "active":
          return {
            label: "Na ligação",
            className: isDark
              ? "bg-emerald-600/25 text-emerald-300"
              : "bg-emerald-100 text-emerald-700",
          };
        case "left":
          return {
            label: "Saiu",
            className: isDark
              ? "bg-amber-500/20 text-amber-300"
              : "bg-amber-100 text-amber-700",
          };
        case "participated":
          return {
            label: "Participou",
            className: isDark
              ? "bg-sky-500/20 text-sky-300"
              : "bg-sky-100 text-sky-700",
          };
        case "missed":
          return {
            label: "Perdeu",
            className: isDark
              ? "bg-rose-500/20 text-rose-300"
              : "bg-rose-100 text-rose-700",
          };
        case "invited":
          return {
            label: "Chamado",
            className: isDark
              ? "bg-zinc-700 text-zinc-300"
              : "bg-zinc-200 text-zinc-700",
          };
        default:
          return null;
      }
    },
    [isDark],
  );

  const canManageGroup = !isCallGroupConversation && (myRole === "admin" || myRole === "moderator");
  const isAdmin = !isCallGroupConversation && myRole === "admin";

  const friendsAvailableToAdd = useMemo(() => {
    if (!sessionUserId) return [];
    return friendsForPicker.filter(
      (f) => !memberIds.has(f.peer.id) && f.peer.id !== sessionUserId,
    );
  }, [friendsForPicker, memberIds, sessionUserId]);

  const onCropComplete = useCallback((_a: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const applyAvatarCrop = useCallback(async () => {
    if (!cropSource || !croppedAreaPixels || !isApiChat) return;
    const file = await getCroppedImageFile(cropSource, croppedAreaPixels);
    if (!file) return;
    try {
      await uploadGroupAvatarRequest(selectedConversation.id, file);
      await onRefreshChatList();
      onRefreshMembers();
    } catch {
      /* ignore */
    }
    setShowCrop(false);
    setCropSource(null);
    if (cropSource.startsWith("blob:")) URL.revokeObjectURL(cropSource);
  }, [
    cropSource,
    croppedAreaPixels,
    isApiChat,
    selectedConversation.id,
    onRefreshChatList,
    onRefreshMembers,
  ]);

  const saveGroupInfo = useCallback(async () => {
    if (!isApiChat || !isGroup) return;
    setInfoSaving(true);
    try {
      await patchGroupDetailsRequest(selectedConversation.id, {
        name: groupName.trim(),
        description: groupDesc.trim() === "" ? null : groupDesc.trim(),
      });
      await onRefreshChatList();
    } catch {
      /* ignore */
    } finally {
      setInfoSaving(false);
    }
  }, [isApiChat, isGroup, selectedConversation.id, groupName, groupDesc, onRefreshChatList]);

  const handleAddMembers = useCallback(async () => {
    if (selectedAddIds.size === 0 || !isApiChat) return;
    setAddMembersBusy(true);
    try {
      await addGroupMembersRequest(selectedConversation.id, [...selectedAddIds]);
      setSelectedAddIds(new Set());
      setAddMembersOpen(false);
      await onRefreshMembers();
      await onRefreshChatList();
    } catch {
      /* ignore */
    } finally {
      setAddMembersBusy(false);
    }
  }, [selectedAddIds, isApiChat, selectedConversation.id, onRefreshMembers, onRefreshChatList]);

  const handleRemoveMember = useCallback(async () => {
    if (!removeMemberId || !isApiChat) return;
    try {
      await removeGroupMemberRequest(selectedConversation.id, removeMemberId);
      setRemoveMemberId(null);
      await onRefreshMembers();
      await onRefreshChatList();
    } catch {
      /* ignore */
    }
  }, [removeMemberId, isApiChat, selectedConversation.id, onRefreshMembers, onRefreshChatList]);

  const handleSetRole = useCallback(
    async (userId: string, role: "moderator" | "member") => {
      if (!isApiChat) return;
      try {
        await setGroupMemberRoleRequest(selectedConversation.id, userId, role);
        setMenuUserId(null);
        await onRefreshMembers();
      } catch {
        /* ignore */
      }
    },
    [isApiChat, selectedConversation.id, onRefreshMembers],
  );

  const handleDeleteGroup = useCallback(async () => {
    if (!isApiChat) return;
    try {
      await deleteGroupConversationRequest(selectedConversation.id);
      setDeleteGroupOpen(false);
      onClose();
      onAfterDeleteGroup?.();
      await onRefreshChatList();
    } catch {
      /* ignore */
    }
  }, [isApiChat, selectedConversation.id, onClose, onAfterDeleteGroup, onRefreshChatList]);

  if (!open) return null;

  const navBtn = (id: SidebarPage, label: string, icon: ReactNode) => (
    <button
      key={id}
      type="button"
      onClick={() => setPage(id)}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition ${
        page === id
          ? "bg-emerald-600 text-white"
          : isDark
            ? "text-zinc-200 hover:bg-zinc-800"
            : "text-zinc-800 hover:bg-zinc-100"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/55 p-3">
      <div
        className={`flex h-[min(88vh,820px)] w-full max-w-4xl overflow-hidden rounded-2xl border shadow-2xl ${
          isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
        }`}
      >
        <aside
          className={`flex w-52 shrink-0 flex-col border-r p-3 ${
            isDark ? "border-zinc-800 bg-zinc-950/80" : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <p
            className={`mb-2 px-2 text-[10px] font-bold uppercase tracking-wider ${
              isDark ? "text-zinc-500" : "text-zinc-500"
            }`}
          >
            {isCallGroupConversation ? "Ligação" : "Menu"}
          </p>
          {isGroup
            ? navBtn(
                "integrantes",
                isCallGroupConversation ? "Participantes" : "Integrantes",
                <UsersRound size={16} />,
              )
            : null}
          {navBtn("midias", isCallGroupConversation ? "Mídias da ligação" : "Mídias", <ImageIcon size={16} />)}
          {!isCallGroupConversation ? navBtn("informacoes", "Informações", <Info size={16} />) : null}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className={`flex shrink-0 items-center justify-between border-b px-4 py-3 ${
              isDark ? "border-zinc-800" : "border-zinc-200"
            }`}
          >
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold">{selectedConversation.name}</h2>
              {isGroup ? (
                <p className={`mt-0.5 line-clamp-2 text-xs ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  {isCallGroupConversation
                    ? `${groupMembers.length} participante${groupMembers.length === 1 ? "" : "s"} na ligação`
                    : (groupDescriptionFromList?.trim() || "Grupo")}
                </p>
              ) : directPeerForDisplay?.email ? (
                <p className={`mt-0.5 flex items-center gap-1 text-xs ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  <Mail size={12} />
                  {directPeerForDisplay.email}
                </p>
              ) : (
                <p className={`mt-0.5 text-xs ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  Conversa directa
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`shrink-0 rounded-lg p-2 ${isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"}`}
              aria-label="Fechar"
            >
              <X size={20} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {isGroup && page === "integrantes" ? (
              <div className="space-y-3">
                {isCallGroupConversation ? (
                  <div
                    className={`rounded-2xl border px-4 py-3 ${
                      isDark ? "border-emerald-900/60 bg-emerald-950/30" : "border-emerald-200 bg-emerald-50"
                    }`}
                  >
                    <p className={`text-[11px] font-semibold uppercase tracking-wide ${
                      isDark ? "text-emerald-300" : "text-emerald-700"
                    }`}>
                      Participantes da ligação
                    </p>
                    <p className={`mt-1 text-sm ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      Aqui aparecem as pessoas que fizeram parte desta ligação em grupo e o histórico visual dela.
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px] flex-1">
                    <Search
                      size={14}
                      className={`pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 ${
                        isDark ? "text-zinc-500" : "text-zinc-400"
                      }`}
                    />
                    <input
                      type="search"
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      placeholder={isCallGroupConversation ? "Pesquisar participantes…" : "Pesquisar integrantes…"}
                      className={`w-full rounded-lg border py-2 pr-3 pl-8 text-sm outline-none ${
                        isDark
                          ? "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
                          : "border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-400"
                      }`}
                    />
                  </div>
                  {canManageGroup && isApiChat ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAddIds(new Set());
                        setAddMembersOpen(true);
                      }}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                    >
                      <UserPlus size={14} />
                      Adicionar
                    </button>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  {filteredMembers.map((member) => {
                    const isSelf = sessionUserId != null && member.id === sessionUserId;
                    const pr = peerPresenceLive[member.id];
                    const targetRole = parseGroupRole(member.role);
                    const callBadge = isCallGroupConversation
                      ? callStatusBadge(member.callStatus)
                      : null;
                    const showAddFriend =
                      !isSelf &&
                      !member.isFriend &&
                      !contactOutgoingRequestPeerIds.has(member.id) &&
                      member.id !== sessionUserId;
                    const showPending = !member.isFriend && contactOutgoingRequestPeerIds.has(member.id);

                    return (
                      <div
                        key={member.id}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                          isDark ? "border-zinc-800 bg-zinc-950/50" : "border-zinc-200 bg-zinc-50/80"
                        }`}
                      >
                        <div className="relative h-10 w-10 shrink-0">
                          {member.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={member.avatarUrl}
                              alt=""
                              className="h-10 w-10 rounded-full object-cover ring-1 ring-black/10"
                            />
                          ) : (
                            <span
                              className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-semibold ${
                                isDark ? "bg-zinc-700 text-zinc-100" : "bg-zinc-200 text-zinc-800"
                              }`}
                            >
                              {getInitials(member.name)}
                            </span>
                          )}
                          <span
                            className={`absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full ring-2 ${
                              isDark ? "ring-zinc-950" : "ring-white"
                            } ${presenceDotClass(pr)}`}
                            title={pr ?? "offline"}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{member.name}</p>
                          {member.email ? (
                            <p className={`truncate text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                              {member.email}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            targetRole === "admin"
                              ? "bg-emerald-600/25 text-emerald-400"
                              : targetRole === "moderator"
                                ? "bg-sky-600/25 text-sky-400"
                                : isDark
                                  ? "bg-zinc-700 text-zinc-300"
                                  : "bg-zinc-200 text-zinc-700"
                          }`}
                        >
                          {formatGroupRoleLabel(member.role)}
                        </span>
                        {callBadge ? (
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${callBadge.className}`}
                          >
                            {callBadge.label}
                          </span>
                        ) : null}
                        {showAddFriend ? (
                          <button
                            type="button"
                            onClick={() => onSendFriendRequest(member.id)}
                            className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${
                              isDark
                                ? "bg-emerald-800/40 text-emerald-300 hover:bg-emerald-800/60"
                                : "bg-emerald-100 text-emerald-900 hover:bg-emerald-200"
                            }`}
                          >
                            Adicionar
                          </button>
                        ) : showPending ? (
                          <span className={`shrink-0 text-[11px] ${isDark ? "text-sky-400" : "text-sky-700"}`}>
                            Pedido enviado
                          </span>
                        ) : member.isFriend ? (
                          <span className="shrink-0 text-[11px] font-semibold text-emerald-500">Amigo</span>
                        ) : null}

                        {!isSelf && isApiChat && !isCallGroupConversation && (isAdmin || (myRole === "moderator" && targetRole === "member")) ? (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setMenuUserId(menuUserId === member.id ? null : member.id)}
                              className={`rounded-md p-1.5 ${isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-200"}`}
                              aria-label="Ações"
                            >
                              <MoreVertical size={16} />
                            </button>
                            {menuUserId === member.id ? (
                              <div
                                className={`absolute right-0 z-10 mt-1 min-w-[200px] rounded-lg border py-1 shadow-xl ${
                                  isDark ? "border-zinc-700 bg-zinc-900" : "border-zinc-200 bg-white"
                                }`}
                              >
                                {isAdmin && targetRole === "member" ? (
                                  <button
                                    type="button"
                                    className="flex w-full px-3 py-2 text-left text-xs hover:bg-emerald-600/20"
                                    onClick={() => void handleSetRole(member.id, "moderator")}
                                  >
                                    <Shield size={12} className="mr-2 inline" />
                                    Tornar moderador
                                  </button>
                                ) : null}
                                {isAdmin && targetRole === "moderator" ? (
                                  <button
                                    type="button"
                                    className="flex w-full px-3 py-2 text-left text-xs hover:bg-emerald-600/20"
                                    onClick={() => void handleSetRole(member.id, "member")}
                                  >
                                    Remover moderador
                                  </button>
                                ) : null}
                                {(isAdmin && targetRole !== "admin") ||
                                (myRole === "moderator" && targetRole === "member") ? (
                                  <button
                                    type="button"
                                    className="w-full px-3 py-2 text-left text-xs text-red-500 hover:bg-red-500/10"
                                    onClick={() => {
                                      setMenuUserId(null);
                                      setRemoveMemberId(member.id);
                                    }}
                                  >
                                    Expulsar do grupo
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {page === "midias" ? (
              !isApiChat ? (
                <p className={`py-10 text-center text-sm ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                  As mídias enviadas aparecem aqui nas conversas sincronizadas com o servidor.
                </p>
              ) : (
                <div className="flex min-h-0 flex-col space-y-3">
                  <div
                    className={`inline-flex shrink-0 rounded-lg p-1 ${isDark ? "bg-zinc-800" : "bg-zinc-100"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setMidiasSub("fotos-videos")}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                        midiasSub === "fotos-videos"
                          ? "bg-emerald-600 text-white"
                          : isDark
                            ? "text-zinc-300"
                            : "text-zinc-700"
                      }`}
                    >
                      <ImageIcon size={14} />
                      Fotos e vídeos
                    </button>
                    <button
                      type="button"
                      onClick={() => setMidiasSub("arquivos-audios")}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${
                        midiasSub === "arquivos-audios"
                          ? "bg-emerald-600 text-white"
                          : isDark
                            ? "text-zinc-300"
                            : "text-zinc-700"
                      }`}
                    >
                      <FolderOpen size={14} />
                      Arquivos e áudios
                    </button>
                  </div>

                  <div
                    ref={midiasScrollRef}
                    onScroll={handleMidiasScroll}
                    className="max-h-[min(52vh,480px)] min-h-0 overflow-y-auto pr-1"
                  >
                    {midiasSub === "fotos-videos" ? (
                      fotosLoading ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-14">
                          <LoaderCircle
                            className={`h-9 w-9 animate-spin ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
                          />
                          <p className={`text-sm ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                            A carregar…
                          </p>
                        </div>
                      ) : fotosItems.length === 0 ? (
                        <p className={`py-8 text-center text-sm ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                          {isCallGroupConversation
                            ? "Ainda não há fotos nem vídeos registrados nesta ligação."
                            : "Ainda não há fotos nem vídeos nesta conversa."}
                        </p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {fotosItems.map((item) =>
                              item.kind === "image" ? (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() =>
                                    setAttachmentPreview({
                                      kind: "image",
                                      url: item.src,
                                      fileName: guessFileNameFromUrl(item.src, "imagem.jpg"),
                                      alt: item.title,
                                    })
                                  }
                                  className={`overflow-hidden rounded-xl border text-left transition hover:opacity-95 ${
                                    isDark ? "border-zinc-800 bg-zinc-950" : "border-zinc-200 bg-white"
                                  }`}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={item.src} alt="" className="aspect-video w-full object-cover" />
                                  <div className="px-2 py-1.5">
                                    <p className="truncate text-xs font-medium">{item.title}</p>
                                    <p
                                      className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-600"}`}
                                    >
                                      {item.sentAt}
                                    </p>
                                  </div>
                                </button>
                              ) : (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() =>
                                    setAttachmentPreview({
                                      kind: "video",
                                      url: item.src,
                                      fileName: guessFileNameFromUrl(item.src, "video.mp4"),
                                      posterUrl: item.posterSrc,
                                    })
                                  }
                                  className={`relative overflow-hidden rounded-xl border text-left transition hover:opacity-95 ${
                                    isDark ? "border-zinc-800 bg-zinc-950" : "border-zinc-200 bg-white"
                                  }`}
                                >
                                  <div className="relative aspect-video w-full bg-black/85">
                                    {item.posterSrc ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={item.posterSrc} alt="" className="h-full w-full object-cover" />
                                    ) : null}
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/35">
                                      <Video className="text-white/95 drop-shadow-md" size={32} />
                                    </div>
                                  </div>
                                  <div className="px-2 py-1.5">
                                    <p className="truncate text-xs font-medium">{item.title}</p>
                                    <p
                                      className={`text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-600"}`}
                                    >
                                      {item.sentAt}
                                    </p>
                                  </div>
                                </button>
                              ),
                            )}
                          </div>
                          {fotosHasMore ? (
                            <div className="mt-4 flex flex-col items-center gap-2 pb-2">
                              <button
                                type="button"
                                onClick={() => void loadFotosMore()}
                                disabled={fotosLoadingMore}
                                className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                                  isDark
                                    ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                                    : "bg-zinc-200 text-zinc-900 hover:bg-zinc-300"
                                }`}
                              >
                                {fotosLoadingMore ? "A carregar…" : "Ver mais"}
                              </button>
                              {fotosLoadingMore ? (
                                <LoaderCircle
                                  className={`h-5 w-5 animate-spin ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
                                />
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      )
                    ) : arquivosLoading ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-14">
                        <LoaderCircle
                          className={`h-9 w-9 animate-spin ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
                        />
                        <p className={`text-sm ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>A carregar…</p>
                      </div>
                    ) : arquivosItems.length === 0 ? (
                      <p className={`py-8 text-center text-sm ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                        {isCallGroupConversation
                          ? "Ainda não há ficheiros nem áudios registrados nesta ligação."
                          : "Ainda não há ficheiros nem áudios nesta conversa."}
                      </p>
                    ) : (
                      <>
                        <div className="space-y-3">
                          {arquivosItems.map((item) =>
                            item.kind === "document" ? (
                              isPdfFileName(item.name) ? (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() =>
                                    setAttachmentPreview({
                                      kind: "pdf",
                                      url: item.url,
                                      fileName: item.name,
                                    })
                                  }
                                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition hover:opacity-95 ${
                                    isDark ? "border-zinc-800 bg-zinc-950/50" : "border-zinc-200 bg-zinc-50"
                                  }`}
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <FileText size={16} className="shrink-0 opacity-70" />
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium">{item.name}</p>
                                      <p
                                        className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-600"}`}
                                      >
                                        {item.sentAt}
                                      </p>
                                    </div>
                                  </div>
                                  <span className="shrink-0 text-[11px] text-emerald-600 dark:text-emerald-400">
                                    Abrir
                                  </span>
                                </button>
                              ) : (
                                <div
                                  key={item.id}
                                  className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
                                    isDark ? "border-zinc-800 bg-zinc-950/50" : "border-zinc-200 bg-zinc-50"
                                  }`}
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <FileText size={16} className="shrink-0 opacity-70" />
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium">{item.name}</p>
                                      <p
                                        className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-600"}`}
                                      >
                                        {item.sentAt}
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => onDownloadFile(item.url, item.name)}
                                    className="shrink-0 rounded-md border px-2 py-1 text-[11px]"
                                  >
                                    Baixar
                                  </button>
                                </div>
                              )
                            ) : (
                              <div
                                key={item.id}
                                className={`rounded-xl border p-3 ${
                                  isDark ? "border-zinc-800 bg-zinc-950/50" : "border-zinc-200 bg-zinc-50"
                                }`}
                              >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1.5 text-sm font-medium">
                                    <Mic size={14} className="opacity-70" />
                                    {item.title}
                                  </span>
                                  <span
                                    className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-600"}`}
                                  >
                                    {item.sentAt}
                                  </span>
                                </div>
                                <ChatAudioPlayer src={item.src} isDark={isDark} outgoing={false} />
                              </div>
                            ),
                          )}
                        </div>
                        {arquivosHasMore ? (
                          <div className="mt-4 flex flex-col items-center gap-2 pb-2">
                            <button
                              type="button"
                              onClick={() => void loadArquivosMore()}
                              disabled={arquivosLoadingMore}
                              className={`rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                                isDark
                                  ? "bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                                  : "bg-zinc-200 text-zinc-900 hover:bg-zinc-300"
                              }`}
                            >
                              {arquivosLoadingMore ? "A carregar…" : "Ver mais"}
                            </button>
                            {arquivosLoadingMore ? (
                              <LoaderCircle
                                className={`h-5 w-5 animate-spin ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              )
            ) : null}

            {page === "informacoes" ? (
              <div className="space-y-6">
                {isGroup && isApiChat ? (
                  <>
                    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                      <button
                        type="button"
                        onClick={() => canManageGroup && avatarInputRef.current?.click()}
                        className={`relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl ring-2 ring-offset-2 ${
                          isDark ? "ring-emerald-500/40 ring-offset-zinc-900" : "ring-emerald-500/30 ring-offset-white"
                        }`}
                      >
                        {chatThreadAvatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={chatThreadAvatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-emerald-600 text-2xl font-bold text-white">
                            {getInitials(selectedConversation.name)}
                          </span>
                        )}
                        {canManageGroup ? (
                          <span className="absolute inset-x-0 bottom-0 bg-black/50 py-1 text-[10px] text-white">
                            Alterar
                          </span>
                        ) : null}
                      </button>
                      <input
                        ref={avatarInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (!f) return;
                          const url = URL.createObjectURL(f);
                          setCropSource(url);
                          setShowCrop(true);
                          setCroppedAreaPixels(null);
                        }}
                      />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div>
                          <label className={`text-[11px] font-semibold uppercase ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                            Nome do grupo
                          </label>
                          <input
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            disabled={!canManageGroup}
                            className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${
                              isDark
                                ? "border-zinc-700 bg-zinc-800 disabled:opacity-50"
                                : "border-zinc-300 bg-white disabled:opacity-50"
                            }`}
                          />
                        </div>
                        <div>
                          <label className={`text-[11px] font-semibold uppercase ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                            Descrição
                          </label>
                          <textarea
                            value={groupDesc}
                            onChange={(e) => setGroupDesc(e.target.value)}
                            disabled={!canManageGroup}
                            rows={3}
                            className={`mt-1 w-full resize-none rounded-lg border px-3 py-2 text-sm ${
                              isDark
                                ? "border-zinc-700 bg-zinc-800 disabled:opacity-50"
                                : "border-zinc-300 bg-white disabled:opacity-50"
                            }`}
                          />
                        </div>
                        {canManageGroup ? (
                          <button
                            type="button"
                            disabled={infoSaving}
                            onClick={() => void saveGroupInfo()}
                            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            {infoSaving ? (
                              <span className="flex items-center gap-2">
                                <LoaderCircle className="animate-spin" size={16} /> A guardar…
                              </span>
                            ) : (
                              "Guardar alterações"
                            )}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {isAdmin ? (
                      <button
                        type="button"
                        onClick={() => setDeleteGroupOpen(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/50 py-3 text-sm font-semibold text-red-500 hover:bg-red-500/10 sm:w-auto sm:px-6"
                      >
                        <Trash2 size={16} />
                        Excluir grupo
                      </button>
                    ) : null}
                  </>
                ) : (
                  <div className="space-y-5">
                    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
                      <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-emerald-600 text-2xl font-bold text-white">
                        {chatThreadAvatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={chatThreadAvatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          getInitials(selectedConversation.name)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-semibold">{selectedConversation.name}</p>
                        {directPeerForDisplay?.email ? (
                          <a
                            href={`mailto:${directPeerForDisplay.email}`}
                            className={`mt-1 flex items-center gap-1.5 text-sm underline-offset-2 hover:underline ${
                              isDark ? "text-emerald-400" : "text-emerald-700"
                            }`}
                          >
                            <Mail size={14} className="shrink-0 opacity-80" />
                            <span className="min-w-0 break-all">{directPeerForDisplay.email}</span>
                          </a>
                        ) : peerProfileLoading ? (
                          <p className={`mt-1 flex items-center gap-2 text-sm ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                            <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                            A carregar perfil…
                          </p>
                        ) : (
                          <p className={`mt-1 text-sm ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                            Conversa directa
                          </p>
                        )}
                      </div>
                    </div>

                    {directPeerForDisplay && directPeerHasPublicExtras(directPeerForDisplay) ? (
                      <div
                        className={`space-y-4 rounded-2xl border px-4 py-4 ${
                          isDark ? "border-zinc-800 bg-zinc-950/40" : "border-zinc-200 bg-zinc-50/80"
                        }`}
                      >
                        <p
                          className={`text-[11px] font-bold uppercase tracking-wider ${
                            isDark ? "text-zinc-500" : "text-zinc-500"
                          }`}
                        >
                          Contacto e redes
                        </p>

                        {directPeerForDisplay.phoneWhatsapp?.trim() ? (
                          <div className="flex gap-3">
                            <Phone
                              size={18}
                              className={`mt-0.5 shrink-0 ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
                              aria-hidden
                            />
                            <div className="min-w-0">
                              <p className={`text-[11px] font-semibold uppercase ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                                Telefone / WhatsApp
                              </p>
                              <p className={`mt-0.5 break-all text-sm ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                                {directPeerForDisplay.phoneWhatsapp.trim()}
                              </p>
                              {waMeHrefFromPhone(directPeerForDisplay.phoneWhatsapp) ? (
                                <a
                                  href={waMeHrefFromPhone(directPeerForDisplay.phoneWhatsapp)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`mt-1 inline-block text-xs font-semibold ${
                                    isDark ? "text-emerald-400 hover:text-emerald-300" : "text-emerald-700 hover:text-emerald-800"
                                  }`}
                                >
                                  Abrir no WhatsApp
                                </a>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        {[
                          {
                            key: "discord",
                            label: "Discord",
                            icon: <FaDiscord className="h-4 w-4" aria-hidden />,
                            value: directPeerForDisplay.socialDiscord,
                          },
                          {
                            key: "linkedin",
                            label: "LinkedIn",
                            icon: <FaLinkedin className="h-4 w-4" aria-hidden />,
                            value: directPeerForDisplay.socialLinkedin,
                          },
                          {
                            key: "youtube",
                            label: "YouTube",
                            icon: <FaYoutube className="h-4 w-4" aria-hidden />,
                            value: directPeerForDisplay.socialYoutube,
                          },
                          {
                            key: "instagram",
                            label: "Instagram",
                            icon: <FaInstagram className="h-4 w-4" aria-hidden />,
                            value: directPeerForDisplay.socialInstagram,
                          },
                          {
                            key: "facebook",
                            label: "Facebook",
                            icon: <FaFacebook className="h-4 w-4" aria-hidden />,
                            value: directPeerForDisplay.socialFacebook,
                          },
                        ]
                          .filter((row) => row.value?.trim())
                          .map((row) => {
                            const v = row.value!.trim();
                            const href = normalizeExternalHref(v);
                            return (
                              <div key={row.key} className="flex gap-3">
                                <span
                                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                    isDark ? "bg-zinc-800 text-zinc-200" : "bg-zinc-200 text-zinc-700"
                                  }`}
                                >
                                  {row.icon}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={`text-[11px] font-semibold uppercase ${isDark ? "text-zinc-500" : "text-zinc-500"}`}
                                  >
                                    {row.label}
                                  </p>
                                  {href ? (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={`mt-0.5 block break-all text-sm font-medium underline-offset-2 hover:underline ${
                                        isDark ? "text-emerald-400" : "text-emerald-700"
                                      }`}
                                    >
                                      {v}
                                    </a>
                                  ) : (
                                    <p className={`mt-0.5 break-all text-sm ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                                      {v}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                        {directPeerForDisplay.websiteUrl?.trim() ? (
                          <div className="flex gap-3">
                            <Globe
                              size={18}
                              className={`mt-0.5 shrink-0 ${isDark ? "text-emerald-400" : "text-emerald-600"}`}
                              aria-hidden
                            />
                            <div className="min-w-0">
                              <p className={`text-[11px] font-semibold uppercase ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                                Site
                              </p>
                              {normalizeExternalHref(directPeerForDisplay.websiteUrl) ? (
                                <a
                                  href={normalizeExternalHref(directPeerForDisplay.websiteUrl)!}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`mt-0.5 block break-all text-sm font-medium underline-offset-2 hover:underline ${
                                    isDark ? "text-emerald-400" : "text-emerald-700"
                                  }`}
                                >
                                  {directPeerForDisplay.websiteUrl.trim()}
                                </a>
                              ) : (
                                <p className={`mt-0.5 break-all text-sm ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                                  {directPeerForDisplay.websiteUrl.trim()}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : isApiChat && !peerProfileLoading && !directPeerForDisplay ? (
                      <p className={`text-center text-sm ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                        Os dados de contacto completos aparecem quando o contacto está na sua lista de amigos.
                      </p>
                    ) : null}
                  </div>
                )}

                <div className={`flex flex-wrap gap-2 border-t pt-4 ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
                  <button
                    type="button"
                    onClick={onToggleFavorite}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                      isDark ? "border-zinc-700 bg-zinc-800 hover:bg-zinc-700" : "border-zinc-300 bg-zinc-100 hover:bg-zinc-200"
                    }`}
                  >
                    {favorite ? "Remover favorito" : "Favoritar conversa"}
                  </button>
                  {selectedConversation.kind === "direct" && isApiChat ? (
                    <button
                      type="button"
                      disabled={blockedByPeer}
                      onClick={onToggleBlock}
                      className={`rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                        isDark ? "border-zinc-700 bg-zinc-800 hover:bg-zinc-700" : "border-zinc-300 bg-zinc-100 hover:bg-zinc-200"
                      }`}
                    >
                      {blockedByPeer ? "Bloqueado pelo contacto" : blocked ? "Desbloquear" : "Bloquear"}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <AttachmentPreviewModal
        open={attachmentPreview !== null}
        payload={attachmentPreview}
        isDark={isDark}
        onClose={closeAttachmentPreview}
      />

      {addMembersOpen ? (
        <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/50 p-4">
          <div
            className={`max-h-[80vh] w-full max-w-md overflow-hidden rounded-xl border shadow-xl ${
              isDark ? "border-zinc-700 bg-zinc-900" : "border-zinc-200 bg-white"
            }`}
          >
            <div className={`flex items-center justify-between border-b px-4 py-3 ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
              <p className="font-semibold">Adicionar amigos ao grupo</p>
              <button type="button" onClick={() => setAddMembersOpen(false)} className="rounded p-1 hover:bg-zinc-800/20">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {friendsAvailableToAdd.length === 0 ? (
                <p className={`px-2 py-6 text-center text-sm ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                  Não há amigos disponíveis para adicionar.
                </p>
              ) : (
                friendsAvailableToAdd.map((f) => {
                  const sel = selectedAddIds.has(f.peer.id);
                  return (
                    <button
                      key={f.peer.id}
                      type="button"
                      onClick={() => {
                        setSelectedAddIds((prev) => {
                          const n = new Set(prev);
                          if (n.has(f.peer.id)) n.delete(f.peer.id);
                          else n.add(f.peer.id);
                          return n;
                        });
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                        sel ? "bg-emerald-600/25" : isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"
                      }`}
                    >
                      <span className="font-medium">
                        {`${f.peer.firstName} ${f.peer.lastName}`.trim() || f.peer.email}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
            <div className={`flex justify-end gap-2 border-t p-3 ${isDark ? "border-zinc-800" : "border-zinc-200"}`}>
              <button
                type="button"
                onClick={() => setAddMembersOpen(false)}
                className="rounded-lg border px-3 py-1.5 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={addMembersBusy || selectedAddIds.size === 0}
                onClick={() => void handleAddMembers()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {addMembersBusy ? "A adicionar…" : "Adicionar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={removeMemberId !== null}
        title="Expulsar membro?"
        description="Esta pessoa deixa de fazer parte do grupo."
        confirmText="Expulsar"
        cancelText="Cancelar"
        isDark={isDark}
        onCancel={() => setRemoveMemberId(null)}
        onConfirm={() => void handleRemoveMember()}
      />

      <ConfirmDialog
        open={deleteGroupOpen}
        title="Excluir grupo?"
        description="Todas as mensagens serão apagadas para todos. Esta ação não pode ser desfeita."
        confirmText="Excluir grupo"
        cancelText="Cancelar"
        isDark={isDark}
        onCancel={() => setDeleteGroupOpen(false)}
        onConfirm={() => void handleDeleteGroup()}
      />

      {showCrop && cropSource ? (
        <PhotoCropModal
          isDark={isDark}
          imageSrc={cropSource}
          crop={crop}
          zoom={zoom}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          onClose={() => {
            setShowCrop(false);
            if (cropSource.startsWith("blob:")) URL.revokeObjectURL(cropSource);
            setCropSource(null);
          }}
          onCancel={() => {
            setShowCrop(false);
            if (cropSource.startsWith("blob:")) URL.revokeObjectURL(cropSource);
            setCropSource(null);
          }}
          onApply={() => void applyAvatarCrop()}
          overlayClassName="z-[250]"
          title="Ajustar foto do grupo"
          idSuffix="-cinfo"
        />
      ) : null}
    </div>
  );
}
