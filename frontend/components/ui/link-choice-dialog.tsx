"use client";

import { Copy, ExternalLink } from "lucide-react";

interface LinkChoiceDialogProps {
  open: boolean;
  url: string;
  isDark?: boolean;
  onCopy: () => void;
  onOpenBrowser: () => void;
  onCancel: () => void;
}

export function LinkChoiceDialog({
  open,
  url,
  isDark = false,
  onCopy,
  onOpenBrowser,
  onCancel,
}: LinkChoiceDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[230] flex items-center justify-center bg-black/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="link-choice-title"
      onClick={onCancel}
    >
      <div
        className={`w-full max-w-md rounded-xl border p-4 shadow-2xl ${
          isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-zinc-300 bg-white text-zinc-900"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="link-choice-title" className="text-base font-semibold">
          O que deseja fazer com o link?
        </h3>
        <p
          className={`mt-2 break-all text-sm ${isDark ? "text-zinc-400" : "text-zinc-600"}`}
          title={url}
        >
          {url}
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={onCopy}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-semibold transition ${
              isDark
                ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700"
                : "border-zinc-300 bg-zinc-100 hover:bg-zinc-200"
            }`}
          >
            <Copy size={16} aria-hidden />
            Copiar
          </button>
          <button
            type="button"
            onClick={onOpenBrowser}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            <ExternalLink size={16} aria-hidden />
            Abrir no navegador
          </button>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className={`mt-2 w-full cursor-pointer rounded-md px-3 py-2 text-sm font-medium ${
            isDark ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200" : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
