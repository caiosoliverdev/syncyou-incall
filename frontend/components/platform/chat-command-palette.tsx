"use client";

import { MessageSquare, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type ChatCommandPaletteAction = "search" | "focusComposer" | "toggleTheme";

type ChatCommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDark: boolean;
  canSearch: boolean;
  onAction: (action: ChatCommandPaletteAction) => void;
};

const ACTIONS: { id: ChatCommandPaletteAction; label: string; hint: string }[] = [
  { id: "search", label: "Pesquisar na conversa", hint: "Abre a pesquisa de mensagens" },
  { id: "focusComposer", label: "Focar caixa de mensagem", hint: "Escreve na conversa actual" },
  { id: "toggleTheme", label: "Alternar tema claro / escuro", hint: "Mesmo que o atalho na barra" },
];

export function ChatCommandPalette({
  open,
  onOpenChange,
  isDark,
  canSearch,
  onAction,
}: ChatCommandPaletteProps) {
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const visible = ACTIONS.filter((a) => (a.id === "search" ? canSearch : true));

  useEffect(() => {
    if (!open) {
      setHighlight(0);
      return;
    }
    setHighlight(0);
    const t = window.setTimeout(() => listRef.current?.querySelector<HTMLElement>("button")?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (highlight >= visible.length) setHighlight(Math.max(0, visible.length - 1));
  }, [highlight, visible.length]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const run = useCallback(
    (id: ChatCommandPaletteAction) => {
      onAction(id);
      close();
    },
    [close, onAction],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % visible.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + visible.length) % visible.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const row = visible[highlight];
        if (row) run(row.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, visible, highlight, run]);

  if (!open) return null;

  const panel = isDark
    ? "border-zinc-600 bg-zinc-900 text-zinc-100"
    : "border-zinc-300 bg-white text-zinc-900";
  const muted = isDark ? "text-zinc-500" : "text-zinc-500";
  const rowActive = isDark ? "bg-emerald-950/60 ring-1 ring-emerald-700/50" : "bg-emerald-50 ring-1 ring-emerald-300";

  return (
    <div
      className="fixed inset-0 z-[450] flex items-start justify-center bg-black/50 p-4 pt-[18vh]"
      role="presentation"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cmd-palette-title"
        className={`w-full max-w-lg overflow-hidden rounded-xl border shadow-2xl ${panel}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center gap-2 border-b px-3 py-2 ${isDark ? "border-zinc-700" : "border-zinc-200"}`}
        >
          <Sparkles size={16} className={muted} aria-hidden />
          <h2 id="cmd-palette-title" className="text-sm font-semibold">
            Comandos rápidos
          </h2>
          <span className={`ml-auto text-[11px] ${muted}`}>↑↓ Enter · Esc fecha</span>
        </div>
        <div ref={listRef} className="max-h-[min(320px,50vh)] overflow-y-auto p-2" role="listbox">
          {visible.map((row, i) => (
            <button
              key={row.id}
              type="button"
              role="option"
              aria-selected={i === highlight}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => run(row.id)}
              className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                i === highlight ? rowActive : isDark ? "hover:bg-zinc-800/80" : "hover:bg-zinc-100"
              }`}
            >
              {row.id === "search" ? (
                <Search size={16} className="mt-0.5 shrink-0 opacity-80" aria-hidden />
              ) : row.id === "focusComposer" ? (
                <MessageSquare size={16} className="mt-0.5 shrink-0 opacity-80" aria-hidden />
              ) : (
                <Sparkles size={16} className="mt-0.5 shrink-0 opacity-80" aria-hidden />
              )}
              <span>
                <span className="font-medium">{row.label}</span>
                <span className={`mt-0.5 block text-xs font-normal ${muted}`}>{row.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
