"use client";

import { useState } from "react";
import { FileText, SendHorizonal, X } from "lucide-react";

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModified(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  try {
    return new Date(ms).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

export function isPdfAttachment(file: File): boolean {
  if (file.type.toLowerCase() === "application/pdf") return true;
  return /\.pdf$/i.test(file.name);
}

export type DocumentAttachmentPreviewProps = {
  isDark: boolean;
  file: File;
  /** Somente preenchido quando `isPdfAttachment(file)`; usar em iframe. */
  pdfObjectUrl: string | null;
  onCancel: () => void;
  onSent: (info: { caption: string }) => void | Promise<void>;
};

export function DocumentAttachmentPreview({
  isDark,
  file,
  pdfObjectUrl,
  onCancel,
  onSent,
}: DocumentAttachmentPreviewProps) {
  const isPdf = isPdfAttachment(file);
  const [caption, setCaption] = useState("");

  return (
    <div
      className={`flex w-full min-w-0 flex-col gap-2 rounded-2xl border p-2 shadow-lg ${
        isDark ? "border-zinc-600 bg-zinc-900" : "border-zinc-300 bg-white"
      }`}
    >
      <p className={`text-center text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
        {isPdf ? "Visualize o PDF antes de enviar" : "Revise os dados do arquivo antes de enviar"}
      </p>

      <div
        className={`rounded-xl border p-3 ${
          isDark ? "border-zinc-700 bg-zinc-800/80" : "border-zinc-200 bg-zinc-50"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
              isDark ? "bg-zinc-700 text-zinc-200" : "bg-zinc-200 text-zinc-700"
            }`}
          >
            <FileText size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={`break-all text-sm font-semibold ${
                isDark ? "text-zinc-100" : "text-zinc-900"
              }`}
              title={file.name}
            >
              {file.name}
            </p>
            <dl className={`mt-2 grid gap-1.5 text-xs ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <dt className="shrink-0 font-medium">Tamanho</dt>
                <dd className="min-w-0 text-right font-mono tabular-nums">
                  {formatFileSize(file.size)}
                </dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <dt className="shrink-0 font-medium">Tipo MIME</dt>
                <dd className="min-w-0 break-all text-right">{file.type || "Nao informado"}</dd>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <dt className="shrink-0 font-medium">Modificado</dt>
                <dd className="min-w-0 text-right">{formatModified(file.lastModified)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {isPdf && pdfObjectUrl ? (
        <div
          className={`overflow-hidden rounded-xl border ${
            isDark ? "border-zinc-700 bg-zinc-950" : "border-zinc-200 bg-zinc-100"
          }`}
        >
          <iframe
            src={pdfObjectUrl}
            title="Preview do PDF"
            className="h-[min(48vh,420px)] w-full min-h-[200px] border-0 bg-white"
          />
        </div>
      ) : null}

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={2}
        placeholder="Adicionar legenda (opcional)..."
        className={`w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none ${
          isDark
            ? "border-zinc-600 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
            : "border-zinc-300 bg-zinc-50 text-zinc-900 placeholder:text-zinc-500"
        }`}
      />

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
            isDark
              ? "border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              : "border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
          }`}
        >
          <X size={14} />
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void onSent({ caption: caption.trim() })}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
        >
          <SendHorizonal size={14} />
          Enviar
        </button>
      </div>
    </div>
  );
}
