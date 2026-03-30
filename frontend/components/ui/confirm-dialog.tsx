"use client";

import { AlertTriangle, Trash2 } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  isDark?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  isDark = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/55 p-4">
      <div
        className={`w-full max-w-sm rounded-xl border p-4 shadow-2xl ${
          isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-zinc-300 bg-white text-zinc-900"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              isDark ? "bg-red-500/20 text-red-300" : "bg-red-100 text-red-600"
            }`}
          >
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold">{title}</h3>
            {description ? <p className={`mt-1 text-sm ${isDark ? "text-zinc-300" : "text-zinc-600"}`}>{description}</p> : null}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onCancel}
            className={`w-full cursor-pointer rounded-md border px-3 py-2 text-sm font-semibold transition ${
              isDark ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700" : "border-zinc-300 bg-zinc-100 hover:bg-zinc-200"
            }`}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
          >
            <Trash2 size={14} />
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
