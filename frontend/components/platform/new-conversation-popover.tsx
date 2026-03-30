"use client";

import * as Popover from "@radix-ui/react-popover";
import { FormEvent, useMemo, useState } from "react";
import { LoaderCircle, Search, SquarePen, UserPlus } from "lucide-react";
import {
  ApiError,
  inviteContactByEmail,
  type ContactFriendRow,
  type PresenceStatus,
} from "@/lib/api";

type NewConversationPopoverProps = {
  isDark: boolean;
  friends: ContactFriendRow[];
  onSelectFriend: (peer: ContactFriendRow["peer"]) => void;
  /** Chamado sempre que o painel abre (ex.: recarregar amigos da API). */
  onOpen?: () => void;
  /** Presença em tempo real (socket); fallback em `peer.presenceStatus`. */
  peerPresenceLive?: Record<string, PresenceStatus>;
};

function peerDisplayName(p: ContactFriendRow["peer"]): string {
  const n = `${p.firstName} ${p.lastName}`.trim();
  return n || p.email;
}

function getInitials(name: string): string {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function presenceForFriend(
  peer: ContactFriendRow["peer"],
  live: Record<string, PresenceStatus> | undefined,
): PresenceStatus {
  return live?.[peer.id] ?? peer.presenceStatus ?? "invisible";
}

export function NewConversationPopover({
  isDark,
  friends,
  onSelectFriend,
  onOpen,
  peerPresenceLive,
}: NewConversationPopoverProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((row) => {
      const p = row.peer;
      const name = peerDisplayName(p).toLowerCase();
      return (
        name.includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.phoneWhatsapp ?? "").toLowerCase().includes(q)
      );
    });
  }, [friends, query]);

  const handleInvite = async (ev: FormEvent) => {
    ev.preventDefault();
    setInviteError(null);
    setInviteLoading(true);
    try {
      await inviteContactByEmail(inviteEmail.trim());
      setInviteOpen(false);
      setInviteEmail("");
      setOpen(false);
    } catch (e) {
      setInviteError(e instanceof ApiError ? e.message : "Convite falhou.");
    } finally {
      setInviteLoading(false);
    }
  };

  const panelClass = `z-[230] flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border shadow-2xl ${
    isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
  }`;

  return (
    <>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            onOpen?.();
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-2 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
          >
            <SquarePen size={14} />
            Nova conversa
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="bottom" align="start" sideOffset={8} collisionPadding={12} className={panelClass}>
            <div
              className={`border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${
                isDark ? "border-zinc-800 text-zinc-500" : "border-zinc-100 text-zinc-500"
              }`}
            >
              Conversar com amigo
            </div>
            <div className="relative border-b p-2">
              <Search
                size={14}
                className={`pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 ${
                  isDark ? "text-zinc-500" : "text-zinc-400"
                }`}
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pesquisar amigos"
                className={`w-full rounded-md border py-2 pr-3 pl-9 text-sm outline-none ${
                  isDark
                    ? "border-zinc-700 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500"
                    : "border-zinc-200 bg-zinc-50 text-zinc-900"
                }`}
              />
            </div>
            <div className="max-h-[min(18rem,50vh)] overflow-y-auto p-1">
              {filtered.length === 0 ? (
                <p className={`px-3 py-6 text-center text-sm ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                  Nenhum amigo encontrado.
                </p>
              ) : (
                filtered.map((row) => {
                  const p = row.peer;
                  const displayName = peerDisplayName(p);
                  const presence = presenceForFriend(p, peerPresenceLive);
                  return (
                    <button
                      key={row.friendshipId}
                      type="button"
                      onClick={() => {
                        onSelectFriend(p);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={`flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm ${
                        isDark ? "hover:bg-zinc-800" : "hover:bg-emerald-50"
                      }`}
                    >
                      <div className="relative h-8 w-8 shrink-0">
                        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-emerald-600 text-[11px] font-semibold text-white">
                          {p.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.avatarUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            getInitials(displayName)
                          )}
                        </div>
                        <span
                          className={`absolute right-0 bottom-0 z-[1] h-2 w-2 rounded-full ring-2 ${
                            isDark ? "ring-zinc-900" : "ring-white"
                          } ${
                            presence === "online"
                              ? "bg-emerald-500"
                              : presence === "away"
                                ? "bg-amber-500"
                                : presence === "on_call"
                                  ? "bg-emerald-400"
                                : presence === "busy"
                                  ? "bg-red-500"
                                  : "bg-zinc-400"
                          }`}
                          title={
                            presence === "online"
                              ? "Online"
                              : presence === "away"
                                ? "Ausente"
                                : presence === "on_call"
                                  ? "Em ligação"
                                : presence === "busy"
                                  ? "Ocupado"
                                  : "Invisível"
                          }
                          aria-hidden
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{displayName}</p>
                        <p
                          className={`mt-0.5 truncate text-[11px] ${
                            isDark ? "text-zinc-500" : "text-zinc-500"
                          }`}
                        >
                          {p.email}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            <div className={`border-t p-2 ${isDark ? "border-zinc-800" : "border-zinc-100"}`}>
              <button
                type="button"
                onClick={() => {
                  setInviteOpen(true);
                  setInviteError(null);
                }}
                className={`flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ${
                  isDark
                    ? "bg-zinc-800 text-emerald-400 hover:bg-zinc-700"
                    : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                }`}
              >
                <UserPlus size={14} />
                Adicionar amigo
              </button>
            </div>
            <Popover.Arrow className={isDark ? "fill-zinc-900" : "fill-white"} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

      {inviteOpen ? (
        <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/50 p-4">
          <div
            className={`w-full max-w-md rounded-xl border p-4 shadow-2xl ${
              isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
            }`}
          >
            <h3 className="text-sm font-semibold">Enviar pedido de amizade</h3>
            <form onSubmit={handleInvite} className="mt-4 space-y-3">
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@exemplo.com"
                className={`w-full rounded-md border px-3 py-2 text-sm ${
                  isDark ? "border-zinc-600 bg-zinc-800" : "border-zinc-300 bg-white"
                }`}
              />
              {inviteError ? <p className="text-sm text-red-500">{inviteError}</p> : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="rounded-md px-3 py-1.5 text-sm opacity-80 hover:opacity-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inviteLoading}
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {inviteLoading ? <LoaderCircle size={14} className="animate-spin" /> : null}
                  Enviar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
