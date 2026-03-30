"use client";

import { useMemo, useState } from "react";
import { UserPlus, X } from "lucide-react";
import Image from "next/image";
import type { ShareableContact } from "@/data/shareable-contacts";

type AddCallParticipantsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isDark: boolean;
  /** Amigos disponiveis para convidar. */
  candidates: ShareableContact[];
  /** IDs ja na sala (nao listar de novo). */
  excludeParticipantIds: Set<string>;
  onConfirm: (picked: ShareableContact[]) => void;
};

export function AddCallParticipantsModal({
  open,
  onOpenChange,
  isDark,
  candidates,
  excludeParticipantIds,
  onConfirm,
}: AddCallParticipantsModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const initials = (name: string) => {
    const p = name.trim().split(/\s+/).filter(Boolean);
    if (p.length === 0) return "?";
    if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
    return `${p[0]![0] ?? ""}${p[p.length - 1]![0] ?? ""}`.toUpperCase();
  };

  const available = useMemo(
    () => candidates.filter((c) => !excludeParticipantIds.has(c.id)),
    [candidates, excludeParticipantIds],
  );

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const panel = isDark
    ? "border-zinc-600 bg-zinc-900 text-zinc-100"
    : "border-zinc-200 bg-white text-zinc-900";
  const row = isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-50";

  const handleConfirm = () => {
    const picked = available.filter((c) => selected.has(c.id));
    onConfirm(picked);
    setSelected(new Set());
    onOpenChange(false);
  };

  return (
    <div
      className="fixed inset-0 z-[410] flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-call-participants-title"
        className={`flex max-h-[min(520px,88vh)] w-full max-w-md flex-col overflow-hidden rounded-xl border shadow-2xl ${panel}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onOpenChange(false);
        }}
      >
        <div
          className={`flex items-center justify-between border-b px-4 py-3 ${
            isDark ? "border-zinc-700" : "border-zinc-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <UserPlus size={20} className={isDark ? "text-emerald-400" : "text-emerald-600"} />
            <h2 id="add-call-participants-title" className="text-base font-semibold">
              Adicionar pessoas
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => onOpenChange(false)}
            className={`rounded-full p-2 ${isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-100"}`}
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {available.length === 0 ? (
            <p className={`px-2 py-6 text-center text-sm ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
              Nenhum contato disponivel para adicionar.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {available.map((c) => {
                const checked = selected.has(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => toggle(c.id)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${row}`}
                    >
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full">
                        {c.avatarUrl ? (
                          <Image src={c.avatarUrl} alt="" fill sizes="40px" className="object-cover" />
                        ) : (
                          <div
                            className={`flex h-full w-full items-center justify-center text-xs font-semibold text-white ${
                              isDark ? "bg-emerald-700" : "bg-emerald-600"
                            }`}
                          >
                            {initials(c.name)}
                          </div>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        readOnly
                        checked={checked}
                        className="h-4 w-4 rounded border-zinc-400"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{c.name}</p>
                        {c.subtitle ? (
                          <p className={`truncate text-xs ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
                            {c.subtitle}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          className={`flex justify-end gap-2 border-t px-4 py-3 ${
            isDark ? "border-zinc-700" : "border-zinc-200"
          }`}
        >
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold ${
              isDark
                ? "border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                : "border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50"
            }`}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={handleConfirm}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Adicionar{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
