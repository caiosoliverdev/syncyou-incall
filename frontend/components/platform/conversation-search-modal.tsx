"use client";

import { Search, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "@/data/mock-conversation-messages";
import { getMessageSnippet } from "@/data/mock-conversation-messages";

type ConversationSearchModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDark: boolean;
  messages: ChatMessage[];
  onPickMessage: (message: ChatMessage) => void;
};

export type SearchTimeFilter = "all" | "week" | "month";

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatDayLabel(messageDate: Date, now = new Date()): string {
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const d0 = startOf(messageDate);
  const n0 = startOf(now);
  const diffDays = Math.round((n0 - d0) / 86400000);
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays < 0) {
    return messageDate.toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  if (messageDate.getFullYear() === now.getFullYear()) {
    return messageDate.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  }
  return messageDate.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function previewLine(m: ChatMessage) {
  const s = getMessageSnippet(m);
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

function messageSearchHaystack(m: ChatMessage): string {
  return [getMessageSnippet(m), m.senderName?.trim() ?? "", m.text?.trim() ?? ""]
    .filter(Boolean)
    .join(" ");
}

function messageMatchesTimeFilter(m: ChatMessage, filter: SearchTimeFilter): boolean {
  if (filter === "all") return true;
  const t = new Date(m.sentAt).getTime();
  const now = Date.now();
  if (filter === "week") return t >= now - 7 * 86400000;
  if (filter === "month") return t >= now - 30 * 86400000;
  return true;
}

function HighlightedPreview({
  text,
  query,
  isDark,
}: {
  text: string;
  query: string;
  isDark: boolean;
}) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  let re: RegExp;
  try {
    re = new RegExp(`(${escapeRegExp(q)})`, "gi");
  } catch {
    return <>{text}</>;
  }
  const parts = text.split(re);
  const markClass = isDark
    ? "rounded-sm bg-amber-500/35 text-amber-100"
    : "rounded-sm bg-amber-200 text-amber-950";
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className={`${markClass} px-0.5`}>
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function ConversationSearchModal({
  open,
  onOpenChange,
  isDark,
  messages,
  onPickMessage,
}: ConversationSearchModalProps) {
  const [query, setQuery] = useState("");
  const [timeFilter, setTimeFilter] = useState<SearchTimeFilter>("all");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setTimeFilter("all");
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    const base = messages.filter(
      (m) => !m.deletedForEveryone && messageMatchesTimeFilter(m, timeFilter),
    );
    if (!q) return [];
    return base
      .filter((m) => normalize(messageSearchHaystack(m)).includes(q))
      .sort(
        (a, b) =>
          new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
      );
  }, [messages, query, timeFilter]);

  const panel = isDark
    ? "border-zinc-600 bg-zinc-900 text-zinc-100"
    : "border-zinc-300 bg-white text-zinc-900";
  const input = isDark
    ? "border-zinc-600 bg-zinc-950 text-zinc-100 placeholder:text-zinc-500"
    : "border-zinc-300 bg-zinc-50 text-zinc-900 placeholder:text-zinc-500";
  const muted = isDark ? "text-zinc-500" : "text-zinc-500";
  const rowBase = isDark ? "hover:bg-zinc-800/80" : "hover:bg-zinc-100";
  const chipOff = isDark
    ? "border-zinc-600 bg-zinc-800/80 text-zinc-300"
    : "border-zinc-300 bg-zinc-100 text-zinc-700";
  const chipOn = isDark
    ? "border-emerald-600 bg-emerald-950/50 text-emerald-200"
    : "border-emerald-500 bg-emerald-50 text-emerald-900";

  const close = () => {
    setQuery("");
    setTimeFilter("all");
    onOpenChange(false);
  };

  const pick = (m: ChatMessage) => {
    setQuery("");
    setTimeFilter("all");
    onPickMessage(m);
    onOpenChange(false);
  };

  if (!open) return null;

  const filterChips: { id: SearchTimeFilter; label: string }[] = [
    { id: "all", label: "Tudo" },
    { id: "week", label: "7 dias" },
    { id: "month", label: "30 dias" },
  ];

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-search-title"
        className={`flex max-h-[min(560px,88vh)] w-full max-w-md flex-col overflow-hidden rounded-xl border shadow-2xl ${panel}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      >
        <div
          className={`flex items-center justify-between border-b px-4 py-3 ${isDark ? "border-zinc-700" : "border-zinc-200"}`}
        >
          <h2 id="conversation-search-title" className="text-base font-semibold">
            Pesquisar na conversa
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

        <div className="shrink-0 space-y-2 px-3 pt-3 pb-2">
          <div className="relative">
            <Search
              size={16}
              className={`pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 ${muted}`}
              aria-hidden
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Palavras na mensagem..."
              autoComplete="off"
              className={`w-full rounded-lg border py-2 pr-3 pl-9 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40 ${input}`}
            />
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Intervalo de datas">
            {filterChips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setTimeFilter(c.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  timeFilter === c.id ? chipOn : chipOff
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">
          {query.trim().length === 0 ? (
            <p className={`px-2 py-8 text-center text-sm ${muted}`}>
              Digite para pesquisar nas mensagens desta conversa.
            </p>
          ) : filtered.length === 0 ? (
            <p className={`px-2 py-8 text-center text-sm ${muted}`}>
              Nenhuma mensagem encontrada neste intervalo.
            </p>
          ) : (
            <ul className="flex flex-col gap-2" role="listbox" aria-label="Resultados">
              {filtered.map((m) => {
                const d = new Date(m.sentAt);
                const when = `${formatDayLabel(d)} · ${formatMessageTime(m.sentAt)}`;
                const line = previewLine(m);
                return (
                  <li key={m.id} className="px-0.5">
                    <button
                      type="button"
                      role="option"
                      className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition ${rowBase} ${
                        isDark ? "border-zinc-700/80" : "border-zinc-200"
                      }`}
                      onClick={() => pick(m)}
                    >
                      <div
                        className={`line-clamp-2 font-medium ${isDark ? "text-zinc-100" : "text-zinc-900"}`}
                      >
                        <HighlightedPreview text={line} query={query} isDark={isDark} />
                      </div>
                      <div className={`mt-1 text-xs ${muted}`}>{when}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
