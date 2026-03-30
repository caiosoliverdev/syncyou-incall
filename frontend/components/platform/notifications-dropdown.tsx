"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, CheckCheck, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { AppNotificationItem } from "@/lib/api";

function formatRelativeTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = Math.floor((now - d.getTime()) / 1000);
    if (diff < 60) return "Agora há pouco";
    if (diff < 3600) return `Há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Há ${Math.floor(diff / 3600)} h`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

type NotificationsDropdownProps = {
  isDark: boolean;
  items: AppNotificationItem[];
  unreadCount: number;
  loading?: boolean;
  onNotificationClick: (item: AppNotificationItem) => void;
  onMarkAllRead: () => Promise<void>;
};

export function NotificationsDropdown({
  isDark,
  items,
  unreadCount,
  loading = false,
  onNotificationClick,
  onMarkAllRead,
}: NotificationsDropdownProps) {
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const contentClass = `z-[280] max-h-[min(24rem,calc(100vh-5rem))] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border shadow-2xl ${
    isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
  }`;

  const itemClass = `flex cursor-pointer flex-col gap-0.5 border-b px-3 py-2.5 text-left text-sm outline-none last:border-b-0 ${
    isDark ? "border-zinc-800 hover:bg-zinc-800/80" : "border-zinc-100 hover:bg-emerald-50/80"
  }`;

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await onMarkAllRead();
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Notificações"
          className={`relative flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
            isDark
              ? "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              : "text-emerald-800 hover:bg-emerald-100"
          }`}
        >
          <Bell size={17} strokeWidth={2} />
          {unreadCount > 0 ? (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-zinc-900"
              aria-hidden
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="bottom" align="end" sideOffset={6} collisionPadding={8} className={contentClass}>
          <div
            className={`flex items-center justify-between border-b px-3 py-2 ${
              isDark ? "border-zinc-800 bg-zinc-950/50" : "border-zinc-100 bg-zinc-50/80"
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-wide opacity-80">Notificações</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                disabled={markingAll}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleMarkAll();
                }}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
                  isDark ? "text-emerald-400 hover:bg-zinc-800" : "text-emerald-700 hover:bg-emerald-100"
                }`}
              >
                {markingAll ? <LoaderCircle size={12} className="animate-spin" /> : <CheckCheck size={12} />}
                Marcar todas como lidas
              </button>
            ) : null}
          </div>
          <div className="max-h-[min(20rem,50vh)] overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-10">
                <LoaderCircle className="animate-spin text-emerald-500" size={28} />
              </div>
            ) : items.length === 0 ? (
              <p className={`px-4 py-8 text-center text-sm ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                Não tens notificações por ler.
              </p>
            ) : (
              items.map((item) => (
                <DropdownMenu.Item
                  key={item.id}
                  className={itemClass}
                  onSelect={(e) => {
                    e.preventDefault();
                    onNotificationClick(item);
                    setOpen(false);
                  }}
                >
                  <div className="flex items-start gap-2">
                    {!item.read ? (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                    ) : (
                      <span className="mt-1.5 h-2 w-2 shrink-0" aria-hidden />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-tight">{item.title}</p>
                      <p className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{item.body}</p>
                      <p className={`mt-1 text-[10px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                        {formatRelativeTime(item.createdAt)}
                      </p>
                    </div>
                  </div>
                </DropdownMenu.Item>
              ))
            )}
          </div>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
