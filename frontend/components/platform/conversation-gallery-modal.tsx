"use client";

import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChatMessage } from "@/data/mock-conversation-messages";

type ConversationGalleryModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDark: boolean;
  messages: ChatMessage[];
};

function imageUrlFromMessage(m: ChatMessage): string | null {
  const a = m.attachment;
  if (!a || a.kind !== "image") return null;
  return a.url ?? null;
}

export function ConversationGalleryModal({
  open,
  onOpenChange,
  isDark,
  messages,
}: ConversationGalleryModalProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const items = useMemo(() => {
    return messages
      .filter((m) => !m.deletedForEveryone)
      .map((m) => {
        const url = imageUrlFromMessage(m);
        return url ? { message: m, url } : null;
      })
      .filter((x): x is { message: ChatMessage; url: string } => x != null);
  }, [messages]);

  useEffect(() => {
    if (!open) setLightboxIndex(null);
  }, [open]);

  useEffect(() => {
    if (lightboxIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setLightboxIndex(null);
      } else if (e.key === "ArrowLeft" && lightboxIndex > 0) {
        setLightboxIndex(lightboxIndex - 1);
      } else if (e.key === "ArrowRight" && lightboxIndex < items.length - 1) {
        setLightboxIndex(lightboxIndex + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, items.length]);

  const panel = isDark
    ? "border-zinc-600 bg-zinc-900 text-zinc-100"
    : "border-zinc-300 bg-white text-zinc-900";
  const muted = isDark ? "text-zinc-500" : "text-zinc-500";

  const close = () => onOpenChange(false);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[400] flex items-center justify-center bg-black/55 p-4"
        role="presentation"
        onClick={close}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gallery-modal-title"
          className={`flex max-h-[min(640px,90vh)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border shadow-2xl ${panel}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        >
          <div
            className={`flex items-center justify-between border-b px-4 py-3 ${isDark ? "border-zinc-700" : "border-zinc-200"}`}
          >
            <h2 id="gallery-modal-title" className="text-base font-semibold">
              Fotos na conversa
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
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
              <p className={`py-12 text-center text-sm ${muted}`}>Nenhuma foto nesta conversa.</p>
            ) : (
              <ul
                className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
                role="list"
              >
                {items.map((it, i) => (
                  <li key={it.message.id}>
                    <button
                      type="button"
                      className="group relative aspect-square w-full overflow-hidden rounded-lg border border-zinc-600/40 bg-zinc-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      onClick={() => setLightboxIndex(i)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={it.url}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:opacity-95"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {lightboxIndex != null && items[lightboxIndex] ? (
        <div
          className="fixed inset-0 z-[410] flex flex-col items-center justify-center bg-black/90 p-4"
          role="presentation"
          onClick={() => setLightboxIndex(null)}
        >
          <div className="flex max-h-full max-w-full flex-col items-center gap-2">
            <p className="text-center text-xs text-white/80">
              {new Date(items[lightboxIndex]!.message.sentAt).toLocaleString("pt-BR", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {lightboxIndex + 1 < items.length || lightboxIndex > 0 ? (
                <span className="ml-2 opacity-70">
                  ← → para navegar · Esc para fechar
                </span>
              ) : null}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={items[lightboxIndex]!.url}
              alt=""
              className="max-h-[min(80vh,900px)] max-w-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
