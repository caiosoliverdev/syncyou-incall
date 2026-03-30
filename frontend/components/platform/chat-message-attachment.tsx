"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ContactRound, Download, FileText, Play } from "lucide-react";
import type { ChatAttachment } from "@/data/mock-conversation-messages";
import { AttachmentPreviewModal, type AttachmentPreviewPayload } from "@/components/platform/attachment-preview-modal";
import { ChatAudioPlayer } from "@/components/platform/chat-audio-player";
import { saveRemoteFileWithDialog } from "@/lib/save-remote-file-with-dialog";

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return `${p[0][0] ?? ""}${p[p.length - 1][0] ?? ""}`.toUpperCase();
}

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

export function ChatMessageAttachment({
  attachment,
  isDark,
  outgoing,
  uploadProgress,
}: {
  attachment: ChatAttachment;
  isDark: boolean;
  outgoing: boolean;
  /** 0–100 durante envio do ficheiro (vídeo). */
  uploadProgress?: number;
}) {
  const [preview, setPreview] = useState<AttachmentPreviewPayload | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);

  const muted = outgoing
    ? isDark
      ? "text-emerald-200/75"
      : "text-emerald-900/65"
    : isDark
      ? "text-zinc-400"
      : "text-zinc-500";

  let inner: ReactNode;

  switch (attachment.kind) {
    case "image": {
      const fileName = guessFileNameFromUrl(attachment.url, "imagem.jpg");
      const noPreview = !!(attachment.asGif || attachment.asSticker);
      inner = noPreview ? (
        <div
          className={`relative overflow-hidden rounded-xl ${
            attachment.asSticker ? "max-w-[220px] bg-transparent" : "max-h-72 w-full"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.url}
            alt={attachment.alt ?? (attachment.asGif ? "GIF" : attachment.asSticker ? "Figurinha" : "Imagem")}
            className={
              attachment.asSticker
                ? "h-auto w-full max-h-56 object-contain"
                : "max-h-72 w-full object-cover"
            }
            loading="lazy"
            draggable={false}
          />
          {attachment.asSticker && attachment.captionOnSticker?.text?.trim() ? (
            <span
              className="pointer-events-none absolute max-w-[90%] whitespace-pre-wrap break-words px-1 text-center text-sm font-semibold leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]"
              style={{
                left: `${attachment.captionOnSticker.xPercent}%`,
                top: `${attachment.captionOnSticker.yPercent}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              {attachment.captionOnSticker.text}
            </span>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className={`block w-full cursor-pointer overflow-hidden rounded-xl p-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
            isDark ? "focus-visible:ring-offset-zinc-950" : "focus-visible:ring-offset-white"
          }`}
          onClick={() =>
            setPreview({
              kind: "image",
              url: attachment.url,
              fileName,
              alt: attachment.alt,
            })
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={attachment.url}
            alt={attachment.alt ?? "Imagem enviada"}
            className="max-h-72 w-full cursor-pointer object-cover"
            loading="lazy"
          />
        </button>
      );
      break;
    }

    case "video": {
      const fileName = guessFileNameFromUrl(attachment.url, "video.mp4");
      const uploading = uploadProgress != null;
      inner = (
        <button
          type="button"
          disabled={uploading}
          className={`relative block w-full max-h-72 overflow-hidden rounded-xl p-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
            isDark ? "focus-visible:ring-offset-zinc-950" : "focus-visible:ring-offset-white"
          } ${uploading ? "cursor-wait" : ""}`}
          onClick={() =>
            uploading
              ? undefined
              : setPreview({
                  kind: "video",
                  url: attachment.url,
                  fileName,
                  posterUrl: attachment.posterUrl,
                })
          }
          aria-label={uploading ? "A enviar video" : "Abrir preview do video"}
        >
          <div className="relative aspect-video max-h-72 w-full bg-zinc-900">
            <video
              src={attachment.url}
              poster={attachment.posterUrl}
              muted
              playsInline
              preload="metadata"
              className="pointer-events-none h-full w-full object-cover"
              aria-hidden
            />
            {uploading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/65 px-3">
                <p className="text-center text-xs font-semibold text-white">A enviar video</p>
                <div className="h-2 w-full max-w-[200px] overflow-hidden rounded-full bg-zinc-700">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width] duration-150"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="font-mono text-sm font-bold tabular-nums text-white">{uploadProgress}%</p>
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-zinc-900 shadow-lg ring-2 ring-white/30">
                  <Play size={30} className="ml-1" fill="currentColor" aria-hidden />
                </span>
              </div>
            )}
          </div>
        </button>
      );
      break;
    }

    case "audio":
      inner = (
        <div
          className={`flex min-w-[min(100%,240px)] rounded-xl border px-2 py-1.5 ${
            outgoing
              ? isDark
                ? "border-emerald-700/80 bg-emerald-950/40"
                : "border-emerald-300/80 bg-emerald-50/80"
              : isDark
                ? "border-zinc-600 bg-zinc-900/50"
                : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <ChatAudioPlayer src={attachment.url} isDark={isDark} outgoing={outgoing} />
        </div>
      );
      break;

    case "document":
      if (!attachment.url) {
        inner = (
          <div
            className={`flex min-w-[min(100%,240px)] items-center gap-3 rounded-xl border px-3 py-2.5 ${
              outgoing
                ? isDark
                  ? "border-emerald-700/80 bg-emerald-950/30"
                  : "border-emerald-300/80 bg-white/60"
                : isDark
                  ? "border-zinc-600 bg-zinc-900/40"
                  : "border-zinc-200 bg-zinc-50"
            }`}
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                outgoing
                  ? isDark
                    ? "bg-emerald-900/50 text-emerald-200"
                    : "bg-emerald-200/80 text-emerald-900"
                  : isDark
                    ? "bg-zinc-700 text-zinc-200"
                    : "bg-zinc-200 text-zinc-800"
              }`}
            >
              <FileText size={22} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{attachment.fileName}</p>
              <p className={`text-xs ${muted}`}>{attachment.sizeLabel}</p>
            </div>
          </div>
        );
        break;
      }

      if (isPdfFileName(attachment.fileName)) {
        inner = (
          <button
            type="button"
            onClick={() =>
              setPreview({
                kind: "pdf",
                url: attachment.url!,
                fileName: attachment.fileName,
              })
            }
            className={`flex min-w-[min(100%,240px)] w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
              outgoing
                ? isDark
                  ? "border-emerald-700/80 bg-emerald-950/30 hover:bg-emerald-950/50"
                  : "border-emerald-300/80 bg-white/60 hover:bg-white/90"
                : isDark
                  ? "border-zinc-600 bg-zinc-900/40 hover:bg-zinc-900/60"
                  : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
            }`}
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                outgoing
                  ? isDark
                    ? "bg-emerald-900/50 text-emerald-200"
                    : "bg-emerald-200/80 text-emerald-900"
                  : isDark
                    ? "bg-zinc-700 text-zinc-200"
                    : "bg-zinc-200 text-zinc-800"
              }`}
            >
              <FileText size={22} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{attachment.fileName}</p>
              <p className={`text-xs ${muted}`}>{attachment.sizeLabel}</p>
            </div>
          </button>
        );
      } else {
        inner = (
          <div
            className={`flex min-w-[min(100%,280px)] items-center gap-2 rounded-xl border px-2 py-2 sm:gap-3 sm:px-3 ${
              outgoing
                ? isDark
                  ? "border-emerald-700/80 bg-emerald-950/30"
                  : "border-emerald-300/80 bg-white/60"
                : isDark
                  ? "border-zinc-600 bg-zinc-900/40"
                  : "border-zinc-200 bg-zinc-50"
            }`}
          >
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                outgoing
                  ? isDark
                    ? "bg-emerald-900/50 text-emerald-200"
                    : "bg-emerald-200/80 text-emerald-900"
                  : isDark
                    ? "bg-zinc-700 text-zinc-200"
                    : "bg-zinc-200 text-zinc-800"
              }`}
            >
              <FileText size={22} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{attachment.fileName}</p>
              <p className={`text-xs ${muted}`}>{attachment.sizeLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => void saveRemoteFileWithDialog(attachment.url!, attachment.fileName)}
              className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:gap-1.5 sm:px-3 sm:text-sm ${
                outgoing
                  ? isDark
                    ? "bg-emerald-700 text-emerald-50 hover:bg-emerald-600"
                    : "bg-emerald-600 text-white hover:bg-emerald-500"
                  : isDark
                    ? "bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
                    : "bg-emerald-600 text-white hover:bg-emerald-500"
              }`}
            >
              <Download size={14} className="sm:h-4 sm:w-4" aria-hidden />
              Baixar
            </button>
          </div>
        );
      }
      break;

    case "contact":
      inner = (
        <div
          className={`flex min-w-[min(100%,260px)] items-center gap-3 rounded-xl border px-3 py-2.5 ${
            outgoing
              ? isDark
                ? "border-emerald-700/80 bg-emerald-950/30"
                : "border-emerald-300/80 bg-white/60"
              : isDark
                ? "border-zinc-600 bg-zinc-900/40"
                : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              outgoing
                ? isDark
                  ? "bg-emerald-900/60 text-emerald-100"
                  : "bg-emerald-200 text-emerald-900"
                : isDark
                  ? "bg-zinc-700 text-zinc-100"
                  : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {initials(attachment.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <ContactRound size={14} className={muted} aria-hidden />
              <span className="truncate text-sm font-semibold">{attachment.name}</span>
            </div>
            {attachment.subtitle ? (
              <p className={`mt-0.5 truncate text-xs ${muted}`}>{attachment.subtitle}</p>
            ) : null}
          </div>
        </div>
      );
      break;
  }

  return (
    <>
      {inner}
      <AttachmentPreviewModal
        open={preview !== null}
        payload={preview}
        isDark={isDark}
        onClose={closePreview}
      />
    </>
  );
}
