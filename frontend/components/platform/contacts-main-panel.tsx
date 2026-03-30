"use client";

import {
  ArrowDownAZ,
  ArrowUpAZ,
  Ban,
  LoaderCircle,
  LockOpen,
  MessageCircle,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PeerPresenceDot } from "@/components/peer-presence-dot";
import {
  type ContactBlockedRow,
  type ContactFriendRow,
  type ContactPeer,
  type ContactRequestRow,
  type PresenceStatus,
  ApiError,
  acceptContactRequest,
  blockContactPeer,
  cancelContactRequest,
  inviteContactByEmail,
  listContactsBlocked,
  listContactsFriends,
  listContactsRequests,
  rejectContactRequest,
  unblockContactPeer,
} from "@/lib/api";
import type { ContactsSectionId } from "./contacts-sidebar-content";

function peerDisplayName(p: ContactPeer): string {
  const n = `${p.firstName} ${p.lastName}`.trim();
  return n || p.email;
}

function peerPresenceForRow(
  p: ContactPeer,
  live?: PresenceStatus,
): PresenceStatus {
  return live ?? p.presenceStatus ?? "online";
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type SortKey = "name" | "email" | "phone" | "since";
type SortDir = "asc" | "desc";

type ContactsMainPanelProps = {
  isDark: boolean;
  section: ContactsSectionId;
  /** Incrementado no servidor quando outro utilizador bloqueia/desbloqueia; força sincronizar listas. */
  remoteRefreshKey?: number;
  /** Presença em tempo real (socket `peer_presence`); sobrepõe o valor vindo da API. */
  peerPresenceLive?: Record<string, PresenceStatus>;
  onOpenConversation: (peer: ContactPeer) => void;
  onIncomingRequestCount?: (count: number) => void;
  onBlockedCountChange?: (count: number) => void;
  onFriendsCountChange?: (count: number) => void;
};

export function ContactsMainPanel({
  isDark,
  section,
  remoteRefreshKey = 0,
  peerPresenceLive = {},
  onOpenConversation,
  onIncomingRequestCount,
  onBlockedCountChange,
  onFriendsCountChange,
}: ContactsMainPanelProps) {
  const [friends, setFriends] = useState<ContactFriendRow[]>([]);
  const [blocked, setBlocked] = useState<ContactBlockedRow[]>([]);
  const [incoming, setIncoming] = useState<ContactRequestRow[]>([]);
  const [outgoing, setOutgoing] = useState<ContactRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [globalFilter, setGlobalFilter] = useState("");
  const [colName, setColName] = useState("");
  const [colEmail, setColEmail] = useState("");
  const [colPhone, setColPhone] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteFeedback, setInviteFeedback] = useState<string | null>(null);

  const [blockPeer, setBlockPeer] = useState<ContactPeer | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (!avatarPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAvatarPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [avatarPreview]);

  const loadFriends = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listContactsFriends();
      setFriends(res.friends);
      onFriendsCountChange?.(res.friends.length);
      try {
        const r = await listContactsRequests();
        onIncomingRequestCount?.(r.incoming.length);
      } catch {
        onIncomingRequestCount?.(0);
      }
      try {
        const b = await listContactsBlocked();
        onBlockedCountChange?.(b.blocked.length);
      } catch {
        onBlockedCountChange?.(0);
      }
    } catch (e) {
      setFriends([]);
      onFriendsCountChange?.(0);
      setError(e instanceof ApiError ? e.message : "Não foi possível carregar amigos.");
    } finally {
      setLoading(false);
    }
  }, [onIncomingRequestCount, onBlockedCountChange, onFriendsCountChange]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listContactsRequests();
      setIncoming(res.incoming);
      setOutgoing(res.outgoing);
      onIncomingRequestCount?.(res.incoming.length);
      try {
        const b = await listContactsBlocked();
        onBlockedCountChange?.(b.blocked.length);
      } catch {
        onBlockedCountChange?.(0);
      }
    } catch (e) {
      setIncoming([]);
      setOutgoing([]);
      onIncomingRequestCount?.(0);
      setError(e instanceof ApiError ? e.message : "Não foi possível carregar pedidos.");
    } finally {
      setLoading(false);
    }
  }, [onIncomingRequestCount, onBlockedCountChange]);

  const loadBlocked = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listContactsBlocked();
      setBlocked(res.blocked);
      onBlockedCountChange?.(res.blocked.length);
    } catch (e) {
      setBlocked([]);
      onBlockedCountChange?.(0);
      setError(e instanceof ApiError ? e.message : "Não foi possível carregar bloqueados.");
    } finally {
      setLoading(false);
    }
  }, [onBlockedCountChange]);

  useEffect(() => {
    if (section === "friends") void loadFriends();
    else if (section === "requests") void loadRequests();
    else void loadBlocked();
  }, [section, loadFriends, loadRequests, loadBlocked]);

  useEffect(() => {
    if (!remoteRefreshKey) return;
    void loadFriends();
    void loadBlocked();
    void loadRequests();
  }, [remoteRefreshKey, loadFriends, loadBlocked, loadRequests]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const filteredSortedFriends = useMemo(() => {
    const g = globalFilter.trim().toLowerCase();
    const fn = colName.trim().toLowerCase();
    const fe = colEmail.trim().toLowerCase();
    const fp = colPhone.trim().toLowerCase();

    let rows = friends.filter((row) => {
      const p = row.peer;
      const name = peerDisplayName(p).toLowerCase();
      const email = p.email.toLowerCase();
      const phone = (p.phoneWhatsapp ?? "").toLowerCase();
      if (fn && !name.includes(fn)) return false;
      if (fe && !email.includes(fe)) return false;
      if (fp && !phone.includes(fp)) return false;
      if (g) {
        const blob = `${name} ${email} ${phone}`;
        if (!blob.includes(g)) return false;
      }
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const pa = a.peer;
      const pb = b.peer;
      let cmp = 0;
      if (sortKey === "name") {
        cmp = peerDisplayName(pa).localeCompare(peerDisplayName(pb), "pt-BR");
      } else if (sortKey === "email") {
        cmp = pa.email.localeCompare(pb.email);
      } else if (sortKey === "phone") {
        cmp = (pa.phoneWhatsapp ?? "").localeCompare(pb.phoneWhatsapp ?? "");
      } else {
        cmp = a.friendsSince.localeCompare(b.friendsSince);
      }
      return cmp * dir;
    });

    return rows;
  }, [friends, globalFilter, colName, colEmail, colPhone, sortKey, sortDir]);

  const filteredSortedBlocked = useMemo(() => {
    const g = globalFilter.trim().toLowerCase();
    const fn = colName.trim().toLowerCase();
    const fe = colEmail.trim().toLowerCase();
    const fp = colPhone.trim().toLowerCase();

    let rows = blocked.filter((row) => {
      const p = row.peer;
      const name = peerDisplayName(p).toLowerCase();
      const email = p.email.toLowerCase();
      const phone = (p.phoneWhatsapp ?? "").toLowerCase();
      if (fn && !name.includes(fn)) return false;
      if (fe && !email.includes(fe)) return false;
      if (fp && !phone.includes(fp)) return false;
      if (g) {
        const blob = `${name} ${email} ${phone}`;
        if (!blob.includes(g)) return false;
      }
      return true;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const pa = a.peer;
      const pb = b.peer;
      let cmp = 0;
      if (sortKey === "name") {
        cmp = peerDisplayName(pa).localeCompare(peerDisplayName(pb), "pt-BR");
      } else if (sortKey === "email") {
        cmp = pa.email.localeCompare(pb.email);
      } else if (sortKey === "phone") {
        cmp = (pa.phoneWhatsapp ?? "").localeCompare(pb.phoneWhatsapp ?? "");
      } else {
        cmp = a.blockedAt.localeCompare(b.blockedAt);
      }
      return cmp * dir;
    });

    return rows;
  }, [blocked, globalFilter, colName, colEmail, colPhone, sortKey, sortDir]);

  const handleInvite = async (ev: FormEvent) => {
    ev.preventDefault();
    setInviteError(null);
    setInviteLoading(true);
    try {
      const res = await inviteContactByEmail(inviteEmail.trim());
      if (res.status === "incoming_pending") {
        setInviteFeedback(
          res.message ??
            "Esta pessoa já lhe enviou um pedido de amizade. Veja em Pedidos para aceitar ou recusar.",
        );
        setInviteOpen(false);
        setInviteEmail("");
        void loadRequests();
        return;
      }
      setInviteOpen(false);
      setInviteEmail("");
      if (res.status === "accepted") {
        void loadFriends();
        void loadRequests();
      } else {
        void loadRequests();
      }
    } catch (e) {
      setInviteError(e instanceof ApiError ? e.message : "Convite falhou.");
    } finally {
      setInviteLoading(false);
    }
  };

  const runAccept = async (id: string) => {
    setActionId(id);
    try {
      await acceptContactRequest(id);
      await loadFriends();
      await loadRequests();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível aceitar.");
    } finally {
      setActionId(null);
    }
  };

  const runReject = async (id: string) => {
    setActionId(id);
    try {
      await rejectContactRequest(id);
      await loadRequests();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível recusar.");
    } finally {
      setActionId(null);
    }
  };

  const runCancelOutgoing = async (id: string) => {
    setActionId(id);
    try {
      await cancelContactRequest(id);
      await loadRequests();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível cancelar.");
    } finally {
      setActionId(null);
    }
  };

  const runBlock = async () => {
    if (!blockPeer) return;
    setActionId(blockPeer.id);
    try {
      await blockContactPeer(blockPeer.id);
      setBlockPeer(null);
      await loadFriends();
      await loadBlocked();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível bloquear.");
    } finally {
      setActionId(null);
    }
  };

  const runUnblock = async (peerId: string) => {
    setActionId(peerId);
    try {
      await unblockContactPeer(peerId);
      await loadBlocked();
      await loadFriends();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Não foi possível desbloquear.");
    } finally {
      setActionId(null);
    }
  };

  const headerClass = isDark
    ? "border-zinc-800 bg-zinc-950/80 text-zinc-100"
    : "border-emerald-100 bg-white/80 text-emerald-950";

  const SortIcon = ({ column }: { column: SortKey }) =>
    sortKey === column ? (
      sortDir === "asc" ? (
        <ArrowUpAZ size={14} className="opacity-70" />
      ) : (
        <ArrowDownAZ size={14} className="opacity-70" />
      )
    ) : (
      <span className="inline-block w-[14px]" />
    );

  return (
    <div
      className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden ${
        isDark ? "bg-zinc-950" : "bg-zinc-50"
      }`}
    >
      <div className={`shrink-0 border-b px-6 py-5 sm:px-8 sm:py-6 ${headerClass}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {section === "friends"
                ? "Amigos"
                : section === "requests"
                  ? "Pedidos de amizade"
                  : "Bloqueados"}
            </h2>
            <p className={`mt-1 text-sm ${isDark ? "text-zinc-400" : "text-emerald-900/65"}`}>
              {section === "friends"
                ? "Pesquise, ordene e gerencie os seus contactos."
                : section === "requests"
                  ? "Aceite ou recuse pedidos recebidos; cancele envios pendentes."
                  : "Pessoas que bloqueou. Desbloquear volta a torná-las amigas na lista."}
            </p>
          </div>
          {section === "friends" ? (
            <button
              type="button"
              onClick={() => {
                setInviteOpen(true);
                setInviteError(null);
                setInviteFeedback(null);
              }}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500"
            >
              <UserPlus size={18} />
              Adicionar
            </button>
          ) : null}
        </div>

        {section === "friends" || section === "blocked" ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 ${
                isDark ? "border-zinc-700 bg-zinc-900" : "border-zinc-200 bg-white"
              }`}
            >
              <Search size={16} className={`shrink-0 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
              <input
                type="search"
                value={globalFilter}
                onChange={(e) => setGlobalFilter(e.target.value)}
                placeholder="Pesquisar em todas as colunas..."
                className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${
                  isDark ? "text-zinc-100 placeholder:text-zinc-600" : "text-zinc-900 placeholder:text-zinc-400"
                }`}
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-8 sm:py-6">
        {inviteFeedback ? (
          <div
            className={`mb-4 flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${
              isDark
                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-950"
            }`}
            role="status"
          >
            <span>{inviteFeedback}</span>
            <button
              type="button"
              onClick={() => setInviteFeedback(null)}
              className={`shrink-0 rounded p-0.5 ${isDark ? "hover:bg-white/10" : "hover:bg-emerald-100"}`}
              aria-label="Fechar aviso"
            >
              <X size={16} />
            </button>
          </div>
        ) : null}
        {error ? (
          <p className={`mb-4 text-sm ${isDark ? "text-red-400" : "text-red-600"}`}>{error}</p>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <LoaderCircle className="animate-spin text-emerald-500" size={36} />
          </div>
        ) : section === "friends" ? (
          <div
            className={`overflow-hidden rounded-xl border ${
              isDark ? "border-zinc-800" : "border-zinc-200 bg-white"
            }`}
          >
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className={isDark ? "bg-zinc-900/90" : "bg-zinc-50"}>
                  <th className="w-14 px-3 py-3 font-semibold">Foto</th>
                  <th className="px-3 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("name")}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      Nome
                      <SortIcon column="name" />
                    </button>
                  </th>
                  <th className="px-3 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("email")}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      Email
                      <SortIcon column="email" />
                    </button>
                  </th>
                  <th className="px-3 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("phone")}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      Telefone
                      <SortIcon column="phone" />
                    </button>
                  </th>
                  <th className="px-3 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("since")}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      Amigos desde
                      <SortIcon column="since" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">Ações</th>
                </tr>
                <tr className={`border-t text-xs ${isDark ? "border-zinc-800 bg-zinc-950/50" : "border-zinc-200 bg-white"}`}>
                  <th className="p-2" />
                  <th className="p-2">
                    <input
                      value={colName}
                      onChange={(e) => setColName(e.target.value)}
                      placeholder="Filtrar nome"
                      className={`w-full rounded border px-2 py-1.5 font-normal ${
                        isDark
                          ? "border-zinc-700 bg-zinc-900 text-zinc-100"
                          : "border-zinc-200 bg-white text-zinc-900"
                      }`}
                    />
                  </th>
                  <th className="p-2">
                    <input
                      value={colEmail}
                      onChange={(e) => setColEmail(e.target.value)}
                      placeholder="Filtrar email"
                      className={`w-full rounded border px-2 py-1.5 font-normal ${
                        isDark
                          ? "border-zinc-700 bg-zinc-900 text-zinc-100"
                          : "border-zinc-200 bg-white text-zinc-900"
                      }`}
                    />
                  </th>
                  <th className="p-2">
                    <input
                      value={colPhone}
                      onChange={(e) => setColPhone(e.target.value)}
                      placeholder="Filtrar telefone"
                      className={`w-full rounded border px-2 py-1.5 font-normal ${
                        isDark
                          ? "border-zinc-700 bg-zinc-900 text-zinc-100"
                          : "border-zinc-200 bg-white text-zinc-900"
                      }`}
                    />
                  </th>
                  <th className="p-2" colSpan={2} />
                </tr>
              </thead>
              <tbody>
                {filteredSortedFriends.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className={`px-4 py-10 text-center ${isDark ? "text-zinc-500" : "text-zinc-600"}`}
                    >
                      Nenhum contacto corresponde aos filtros.
                    </td>
                  </tr>
                ) : (
                  filteredSortedFriends.map((row) => {
                    const p = row.peer;
                    const presence = peerPresenceForRow(p, peerPresenceLive[p.id]);
                    const busy = actionId === p.id;
                    return (
                      <tr
                        key={row.friendshipId}
                        className={`border-t ${isDark ? "border-zinc-800 hover:bg-zinc-900/60" : "border-zinc-100 hover:bg-emerald-50/50"}`}
                      >
                        <td className="px-3 py-2 align-middle">
                          <div className="relative inline-flex">
                            {p.avatarUrl ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setAvatarPreview({
                                    url: p.avatarUrl!,
                                    name: peerDisplayName(p),
                                  })
                                }
                                className="group relative flex h-10 w-10 cursor-zoom-in items-center justify-center rounded-full bg-emerald-600 ring-2 ring-transparent transition hover:ring-emerald-400/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                                aria-label={`Ver foto de ${peerDisplayName(p)}`}
                              >
                                <span className="absolute inset-0 overflow-hidden rounded-full">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={p.avatarUrl}
                                    alt=""
                                    className="h-full w-full object-cover transition group-hover:brightness-95"
                                  />
                                </span>
                                <PeerPresenceDot presenceStatus={presence} isDark={isDark} />
                              </button>
                            ) : (
                              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
                                {peerDisplayName(p).slice(0, 2).toUpperCase()}
                                <PeerPresenceDot presenceStatus={presence} isDark={isDark} />
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 align-middle font-medium">
                          {peerDisplayName(p)}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 align-middle text-xs opacity-90">
                          {p.email}
                        </td>
                        <td className="max-w-[140px] truncate px-3 py-2 align-middle text-xs opacity-90">
                          {p.phoneWhatsapp ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-middle text-xs opacity-80">
                          {formatShortDate(row.friendsSince)}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex flex-wrap justify-end gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onOpenConversation(p)}
                              aria-label="Conversar"
                              title="Conversar"
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 transition hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
                            >
                              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <MessageCircle size={16} />}
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setBlockPeer(p)}
                              aria-label="Bloquear"
                              title="Bloquear"
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 transition hover:bg-red-500/15 disabled:opacity-50 dark:text-red-400"
                            >
                              <Ban size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : section === "requests" ? (
          <div className="space-y-8">
            <section>
              <h3 className={`mb-3 text-sm font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                Recebidos
              </h3>
              <RequestsTable
                isDark={isDark}
                rows={incoming}
                mode="incoming"
                actionId={actionId}
                onAccept={runAccept}
                onReject={runReject}
                onAvatarPreview={(url, name) => setAvatarPreview({ url, name })}
              />
            </section>
            <section>
              <h3 className={`mb-3 text-sm font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                Enviados (pendentes)
              </h3>
              <RequestsTable
                isDark={isDark}
                rows={outgoing}
                mode="outgoing"
                actionId={actionId}
                onCancel={runCancelOutgoing}
                onAvatarPreview={(url, name) => setAvatarPreview({ url, name })}
              />
            </section>
          </div>
        ) : (
          <div
            className={`overflow-hidden rounded-xl border ${
              isDark ? "border-zinc-800" : "border-zinc-200 bg-white"
            }`}
          >
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className={isDark ? "bg-zinc-900/90" : "bg-zinc-50"}>
                  <th className="w-14 px-3 py-3 font-semibold">Foto</th>
                  <th className="px-3 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("name")}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      Nome
                      <SortIcon column="name" />
                    </button>
                  </th>
                  <th className="px-3 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("email")}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      Email
                      <SortIcon column="email" />
                    </button>
                  </th>
                  <th className="px-3 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("phone")}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      Telefone
                      <SortIcon column="phone" />
                    </button>
                  </th>
                  <th className="px-3 py-3 font-semibold">
                    <button
                      type="button"
                      onClick={() => toggleSort("since")}
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      Bloqueado em
                      <SortIcon column="since" />
                    </button>
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">Ações</th>
                </tr>
                <tr className={`border-t text-xs ${isDark ? "border-zinc-800 bg-zinc-950/50" : "border-zinc-200 bg-white"}`}>
                  <th className="p-2" />
                  <th className="p-2">
                    <input
                      value={colName}
                      onChange={(e) => setColName(e.target.value)}
                      placeholder="Filtrar nome"
                      className={`w-full rounded border px-2 py-1.5 font-normal ${
                        isDark
                          ? "border-zinc-700 bg-zinc-900 text-zinc-100"
                          : "border-zinc-200 bg-white text-zinc-900"
                      }`}
                    />
                  </th>
                  <th className="p-2">
                    <input
                      value={colEmail}
                      onChange={(e) => setColEmail(e.target.value)}
                      placeholder="Filtrar email"
                      className={`w-full rounded border px-2 py-1.5 font-normal ${
                        isDark
                          ? "border-zinc-700 bg-zinc-900 text-zinc-100"
                          : "border-zinc-200 bg-white text-zinc-900"
                      }`}
                    />
                  </th>
                  <th className="p-2">
                    <input
                      value={colPhone}
                      onChange={(e) => setColPhone(e.target.value)}
                      placeholder="Filtrar telefone"
                      className={`w-full rounded border px-2 py-1.5 font-normal ${
                        isDark
                          ? "border-zinc-700 bg-zinc-900 text-zinc-100"
                          : "border-zinc-200 bg-white text-zinc-900"
                      }`}
                    />
                  </th>
                  <th className="p-2" colSpan={2} />
                </tr>
              </thead>
              <tbody>
                {filteredSortedBlocked.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className={`px-4 py-10 text-center ${isDark ? "text-zinc-500" : "text-zinc-600"}`}
                    >
                      Nenhum contacto bloqueado.
                    </td>
                  </tr>
                ) : (
                  filteredSortedBlocked.map((row) => {
                    const p = row.peer;
                    const busy = actionId === p.id;
                    return (
                      <tr
                        key={row.friendshipId}
                        className={`border-t ${isDark ? "border-zinc-800 hover:bg-zinc-900/60" : "border-zinc-100 hover:bg-emerald-50/50"}`}
                      >
                        <td className="px-3 py-2 align-middle">
                          {p.avatarUrl ? (
                            <button
                              type="button"
                              onClick={() =>
                                setAvatarPreview({
                                  url: p.avatarUrl!,
                                  name: peerDisplayName(p),
                                })
                              }
                              className="group flex h-10 w-10 cursor-zoom-in items-center justify-center overflow-hidden rounded-full bg-emerald-600 ring-2 ring-transparent transition hover:ring-emerald-400/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                              aria-label={`Ver foto de ${peerDisplayName(p)}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={p.avatarUrl}
                                alt=""
                                className="h-full w-full object-cover transition group-hover:brightness-95"
                              />
                            </button>
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
                              {peerDisplayName(p).slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </td>
                        <td className="max-w-[200px] truncate px-3 py-2 align-middle font-medium">
                          {peerDisplayName(p)}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 align-middle text-xs opacity-90">
                          {p.email}
                        </td>
                        <td className="max-w-[140px] truncate px-3 py-2 align-middle text-xs opacity-90">
                          {p.phoneWhatsapp ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-middle text-xs opacity-80">
                          {formatShortDate(row.blockedAt)}
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void runUnblock(p.id)}
                              aria-label="Desbloquear"
                              title="Desbloquear"
                              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 transition hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
                            >
                              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <LockOpen size={16} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {inviteOpen ? (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/55 p-4">
          <div
            className={`w-full max-w-md rounded-xl border p-5 shadow-2xl ${
              isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-zinc-300 bg-white text-zinc-900"
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">Convidar por email</h3>
              <button
                type="button"
                onClick={() => !inviteLoading && setInviteOpen(false)}
                className="rounded-md p-1 hover:bg-zinc-200/10"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className={`mb-1 block text-xs font-medium ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  Email do utilizador
                </label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  autoComplete="email"
                  className={`w-full rounded-lg border px-3 py-2 text-sm ${
                    isDark ? "border-zinc-600 bg-zinc-950 text-zinc-100" : "border-zinc-300 bg-white"
                  }`}
                  placeholder="nome@empresa.com"
                />
              </div>
              {inviteError ? (
                <p className={`text-sm ${isDark ? "text-red-400" : "text-red-600"}`}>{inviteError}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  disabled={inviteLoading}
                  onClick={() => setInviteOpen(false)}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
                    isDark ? "border-zinc-600 hover:bg-zinc-800" : "border-zinc-300 hover:bg-zinc-100"
                  }`}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {inviteLoading ? <LoaderCircle size={16} className="animate-spin" /> : null}
                  Enviar convite
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {avatarPreview ? (
        <div
          className="fixed inset-0 z-[240] flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Pré-visualização da foto"
          onClick={() => setAvatarPreview(null)}
        >
          <button
            type="button"
            onClick={() => setAvatarPreview(null)}
            className={`absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full transition ${
              isDark ? "bg-zinc-800 text-zinc-200 hover:bg-zinc-700" : "bg-white/90 text-zinc-800 hover:bg-white"
            }`}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
          <div
            className="flex max-h-[90vh] max-w-[min(92vw,720px)] flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarPreview.url}
              alt={avatarPreview.name}
              className="max-h-[min(78vh,720px)] max-w-full rounded-xl object-contain shadow-2xl"
            />
            <p
              className={`mt-3 max-w-full truncate text-center text-sm font-medium ${
                isDark ? "text-zinc-200" : "text-white drop-shadow-md"
              }`}
            >
              {avatarPreview.name}
            </p>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!blockPeer}
        title="Bloquear contacto?"
        description={
          blockPeer
            ? `${peerDisplayName(blockPeer)} deixará de aparecer na lista de amigos até desbloquear.`
            : undefined
        }
        confirmText="Bloquear"
        cancelText="Cancelar"
        isDark={isDark}
        onConfirm={() => void runBlock()}
        onCancel={() => setBlockPeer(null)}
      />
    </div>
  );
}

function RequestsTable({
  isDark,
  rows,
  mode,
  actionId,
  onAccept,
  onReject,
  onCancel,
  onAvatarPreview,
}: {
  isDark: boolean;
  rows: ContactRequestRow[];
  mode: "incoming" | "outgoing";
  actionId: string | null;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onCancel?: (id: string) => void;
  onAvatarPreview?: (url: string, name: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p className={`rounded-lg border px-4 py-8 text-center text-sm ${isDark ? "border-zinc-800 text-zinc-500" : "border-zinc-200 text-zinc-600"}`}>
        Nenhum pedido.
      </p>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border ${
        isDark ? "border-zinc-800" : "border-zinc-200 bg-white"
      }`}
    >
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead className={isDark ? "bg-zinc-900/90" : "bg-zinc-50"}>
          <tr>
            <th className="w-14 px-3 py-3 font-semibold">Foto</th>
            <th className="px-3 py-3 font-semibold">Nome</th>
            <th className="px-3 py-3 font-semibold">Email</th>
            <th className="px-3 py-3 font-semibold">Data</th>
            <th className="px-3 py-3 text-right font-semibold">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const p = row.peer;
            const busy = actionId === row.friendshipId;
            return (
              <tr
                key={row.friendshipId}
                className={`border-t ${isDark ? "border-zinc-800" : "border-zinc-100"}`}
              >
                <td className="px-3 py-2">
                  {p.avatarUrl ? (
                    onAvatarPreview ? (
                      <button
                        type="button"
                        onClick={() => onAvatarPreview(p.avatarUrl!, peerDisplayName(p))}
                        className="group flex h-9 w-9 cursor-zoom-in items-center justify-center overflow-hidden rounded-full bg-emerald-600 ring-2 ring-transparent transition hover:ring-emerald-400/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        aria-label={`Ver foto de ${peerDisplayName(p)}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.avatarUrl}
                          alt=""
                          className="h-full w-full object-cover transition group-hover:brightness-95"
                        />
                      </button>
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-emerald-600">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
                      </div>
                    )
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-semibold text-white">
                      {peerDisplayName(p).slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </td>
                <td className="max-w-[180px] truncate px-3 py-2 font-medium">{peerDisplayName(p)}</td>
                <td className="max-w-[200px] truncate px-3 py-2 text-xs opacity-90">{p.email}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs opacity-80">{formatShortDate(row.createdAt)}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1.5">
                    {mode === "incoming" && onAccept && onReject ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onAccept(row.friendshipId)}
                          className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          {busy ? <LoaderCircle size={14} className="animate-spin" /> : "Aceitar"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onReject(row.friendshipId)}
                          className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
                            isDark ? "border-zinc-600 hover:bg-zinc-800" : "border-zinc-300 hover:bg-zinc-100"
                          }`}
                        >
                          Recusar
                        </button>
                      </>
                    ) : null}
                    {mode === "outgoing" && onCancel ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onCancel(row.friendshipId)}
                        className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold ${
                          isDark ? "border-zinc-600 hover:bg-zinc-800" : "border-zinc-300 hover:bg-zinc-100"
                        }`}
                      >
                        {busy ? <LoaderCircle size={14} className="animate-spin" /> : "Cancelar"}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
