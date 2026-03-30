"use client";

import { Search, UserRound, UsersRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ConversationPickerItem } from "@/data/conversation-picker-options";

type ForwardMessageModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDark: boolean;
  excludeConversationId: string;
  options: ConversationPickerItem[];
  onSelectTarget: (target: ConversationPickerItem) => void;
};

type TabId = "direct" | "group";

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function ForwardMessageModal({
  open,
  onOpenChange,
  isDark,
  excludeConversationId,
  options,
  onSelectTarget,
}: ForwardMessageModalProps) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("direct");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedId(null);
      setActiveTab("direct");
    }
  }, [open]);

  const filteredForTab = useMemo(() => {
    const q = normalize(query);
    return options.filter(
      (o) =>
        o.id !== excludeConversationId &&
        o.kind === activeTab &&
        normalize(o.name).includes(q),
    );
  }, [options, excludeConversationId, query, activeTab]);

  const panel = isDark
    ? "border-zinc-600 bg-zinc-900 text-zinc-100"
    : "border-zinc-300 bg-white text-zinc-900";
  const input = isDark
    ? "border-zinc-600 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500"
    : "border-zinc-300 bg-zinc-50 text-zinc-900 placeholder:text-zinc-500";
  const muted = isDark ? "text-zinc-500" : "text-zinc-500";

  const tabInactive = isDark
    ? "text-zinc-500 hover:text-zinc-300"
    : "text-zinc-500 hover:text-zinc-800";
  const tabActive = isDark
    ? "border-b-2 border-emerald-500 text-emerald-400"
    : "border-b-2 border-emerald-600 text-emerald-700";

  const rowBase = isDark ? "hover:bg-zinc-800/80" : "hover:bg-zinc-100";
  const rowSelected = isDark
    ? "bg-emerald-950/50 ring-1 ring-emerald-600/50"
    : "bg-emerald-50 ring-1 ring-emerald-300";

  const cancelBtn = isDark
    ? "border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
    : "border-zinc-300 bg-zinc-100 text-zinc-900 hover:bg-zinc-200";
  const okBtn =
    "bg-emerald-600 text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-45";

  const initials = (name: string) => {
    const p = name.trim().split(/\s+/).filter(Boolean);
    if (p.length === 0) return "?";
    if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
    return `${p[0]![0] ?? ""}${p[p.length - 1]![0] ?? ""}`.toUpperCase();
  };

  const close = () => {
    setQuery("");
    onOpenChange(false);
  };

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setSelectedId(null);
  };

  const handleConfirm = () => {
    if (!selectedId) return;
    const item = options.find((o) => o.id === selectedId);
    if (!item) return;
    setQuery("");
    onSelectTarget(item);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forward-modal-title"
        className={`flex max-h-[min(560px,88vh)] w-full max-w-md flex-col overflow-hidden rounded-xl border shadow-2xl ${panel}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      >
        <div className={`flex items-center justify-between border-b px-4 py-3 ${isDark ? "border-zinc-700" : "border-zinc-200"}`}>
          <h2 id="forward-modal-title" className="text-base font-semibold">
            Encaminhar para
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={close}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
              isDark ? "text-zinc-400 hover:bg-zinc-800" : "text-zinc-600 hover:bg-zinc-100"
            }`}
          >
            <X size={18} />
          </button>
        </div>

        <div
          className={`flex shrink-0 border-b px-2 ${isDark ? "border-zinc-700 bg-zinc-950/40" : "border-zinc-200 bg-zinc-50/80"}`}
          role="tablist"
          aria-label="Tipo de conversa"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "direct"}
            onClick={() => handleTabChange("direct")}
            className={`flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-semibold transition ${activeTab === "direct" ? tabActive : tabInactive}`}
          >
            <UserRound size={16} aria-hidden />
            Conversas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "group"}
            onClick={() => handleTabChange("group")}
            className={`flex flex-1 items-center justify-center gap-2 px-3 py-3 text-sm font-semibold transition ${activeTab === "group" ? tabActive : tabInactive}`}
          >
            <UsersRound size={16} aria-hidden />
            Grupos
          </button>
        </div>

        <div className={`shrink-0 px-3 pt-3 pb-2`}>
          <div className="relative">
            <Search
              size={16}
              className={`pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 ${muted}`}
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                activeTab === "direct" ? "Buscar contato..." : "Buscar grupo..."
              }
              className={`w-full rounded-lg border py-2 pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40 ${input}`}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">
          {filteredForTab.length === 0 ? (
            <p className={`px-2 py-8 text-center text-sm ${muted}`}>
              {activeTab === "direct"
                ? "Nenhum contato encontrado."
                : "Nenhum grupo encontrado."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5" role="listbox" aria-label="Destinos">
              {filteredForTab.map((item) => {
                const selected = selectedId === item.id;
                return (
                  <li key={item.id} className="px-0.5">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => setSelectedId(item.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-3 text-left text-sm transition ${rowBase} ${selected ? rowSelected : ""}`}
                    >
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          activeTab === "group"
                            ? isDark
                              ? "bg-emerald-900/50 text-emerald-200"
                              : "bg-emerald-100 text-emerald-800"
                            : isDark
                              ? "bg-zinc-700 text-zinc-200"
                              : "bg-zinc-200 text-zinc-700"
                        }`}
                      >
                        {initials(item.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
                      {activeTab === "direct" ? (
                        <UserRound size={16} className={`shrink-0 ${muted}`} aria-hidden />
                      ) : (
                        <UsersRound size={16} className={`shrink-0 ${muted}`} aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          className={`flex shrink-0 justify-end gap-2 border-t px-4 py-3 ${isDark ? "border-zinc-700" : "border-zinc-200"}`}
        >
          <button
            type="button"
            onClick={close}
            className={`min-w-[100px] cursor-pointer rounded-lg border px-4 py-2 text-sm font-semibold transition ${cancelBtn}`}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!selectedId}
            onClick={handleConfirm}
            className={`min-w-[100px] cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition ${okBtn}`}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
