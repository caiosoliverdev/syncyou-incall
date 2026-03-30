"use client";

import { Ban, UserPlus, UsersRound } from "lucide-react";

export type ContactsSectionId = "friends" | "requests" | "blocked";

type ContactsSidebarContentProps = {
  isDark: boolean;
  section: ContactsSectionId;
  onSectionChange: (id: ContactsSectionId) => void;
  friendsCount?: number;
  incomingRequestCount?: number;
  blockedCount?: number;
};

export function ContactsSidebarContent({
  isDark,
  section,
  onSectionChange,
  friendsCount = 0,
  incomingRequestCount = 0,
  blockedCount = 0,
}: ContactsSidebarContentProps) {
  const itemClass = (active: boolean) =>
    `flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
      active
        ? isDark
          ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
          : "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"
        : isDark
          ? "text-zinc-300 hover:bg-zinc-800"
          : "text-zinc-700 hover:bg-zinc-100"
    }`;

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isDark ? "bg-zinc-900" : "bg-white"
      }`}
    >
      <div
        className={`shrink-0 border-b px-4 py-4 ${
          isDark ? "border-zinc-800" : "border-zinc-200"
        }`}
      >
        <h2
          className={`text-xs font-semibold uppercase tracking-wide ${
            isDark ? "text-zinc-500" : "text-zinc-500"
          }`}
        >
          Contatos
        </h2>
        <p className={`mt-1 text-[11px] leading-snug ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
          Amigos, pedidos e bloqueados.
        </p>
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
        <button
          type="button"
          onClick={() => onSectionChange("friends")}
          className={itemClass(section === "friends")}
        >
          <UsersRound size={18} className="shrink-0 opacity-90" />
          <span className="min-w-0 flex-1">Amigos</span>
          <span
            className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
              isDark ? "bg-zinc-700/90 text-zinc-200" : "bg-zinc-200 text-zinc-800"
            }`}
            title="Total de amigos"
          >
            {friendsCount > 999 ? "999+" : friendsCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onSectionChange("requests")}
          className={itemClass(section === "requests")}
        >
          <UserPlus size={18} className="shrink-0 opacity-90" />
          <span className="min-w-0 flex-1">Pedidos</span>
          {incomingRequestCount > 0 ? (
            <span
              className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                isDark ? "bg-emerald-600 text-white" : "bg-emerald-600 text-white"
              }`}
            >
              {incomingRequestCount > 99 ? "99+" : incomingRequestCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => onSectionChange("blocked")}
          className={itemClass(section === "blocked")}
        >
          <Ban size={18} className="shrink-0 opacity-90" />
          <span className="min-w-0 flex-1">Bloqueados</span>
          {blockedCount > 0 ? (
            <span
              className={`flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                isDark ? "bg-zinc-600 text-white" : "bg-zinc-600 text-white"
              }`}
            >
              {blockedCount > 99 ? "99+" : blockedCount}
            </span>
          ) : null}
        </button>
      </nav>
    </div>
  );
}
