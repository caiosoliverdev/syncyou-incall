"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Download, X } from "lucide-react";
import { saveRemoteFileWithDialog } from "@/lib/save-remote-file-with-dialog";

export type AttachmentPreviewPayload =
  | {
      kind: "image";
      url: string;
      fileName: string;
      alt?: string;
    }
  | {
      kind: "video";
      url: string;
      fileName: string;
      posterUrl?: string;
    }
  | {
      kind: "pdf";
      url: string;
      fileName: string;
    };

function titleFromPayload(p: AttachmentPreviewPayload): string {
  return p.fileName;
}

export function AttachmentPreviewModal({
  open,
  payload,
  isDark,
  onClose,
}: {
  open: boolean;
  payload: AttachmentPreviewPayload | null;
  isDark: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !payload || typeof document === "undefined") return null;

  const handleDownload = () => {
    void saveRemoteFileWithDialog(payload.url, payload.fileName);
  };

  const shell = (
    <div
      className="fixed inset-0 z-[230] flex flex-col bg-black/70 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Visualizar anexo"
      onClick={onClose}
    >
      <div
        className={`mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border shadow-2xl ${
          isDark ? "border-zinc-600 bg-zinc-900" : "border-zinc-300 bg-zinc-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className={`flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2 sm:px-4 ${
            isDark ? "border-zinc-700 bg-zinc-950" : "border-zinc-200 bg-white"
          }`}
        >
          <h2
            className={`min-w-0 flex-1 truncate text-sm font-semibold sm:text-base ${
              isDark ? "text-zinc-100" : "text-zinc-900"
            }`}
          >
            {titleFromPayload(payload)}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 sm:text-sm"
            >
              <Download size={16} aria-hidden />
              Baixar
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar"
              className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg transition ${
                isDark ? "text-zinc-300 hover:bg-zinc-800" : "text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              <X size={20} />
            </button>
          </div>
        </header>

        <div
          className={`min-h-0 flex-1 overflow-auto p-2 sm:p-4 ${
            isDark ? "bg-zinc-950" : "bg-zinc-50"
          }`}
        >
          {payload.kind === "image" ? (
            <div className="flex h-full min-h-[200px] items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={payload.url}
                alt={payload.alt ?? payload.fileName}
                className="max-h-[min(85vh,900px)] w-auto max-w-full object-contain"
              />
            </div>
          ) : null}

          {payload.kind === "video" ? (
            <div className="flex h-full min-h-[200px] items-center justify-center">
              <video
                src={payload.url}
                poster={payload.posterUrl}
                controls
                className="max-h-[min(85vh,900px)] w-full max-w-full rounded-lg bg-black"
                playsInline
              />
            </div>
          ) : null}

          {payload.kind === "pdf" ? (
            <iframe
              title={payload.fileName}
              src={payload.url}
              className="h-[min(85vh,900px)] w-full min-h-[400px] rounded-lg border-0 bg-white"
            />
          ) : null}
        </div>
      </div>
    </div>
  );

  return createPortal(shell, document.body);
}
