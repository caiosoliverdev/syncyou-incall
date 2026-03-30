"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, Coffee, EyeOff, LoaderCircle, MinusCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import type { PresenceStatus } from "@/lib/api";

const OPTIONS: { value: PresenceStatus; label: string; Icon: LucideIcon | null }[] = [
  { value: "online", label: "Online", Icon: null },
  { value: "away", label: "Ausente", Icon: Coffee },
  { value: "busy", label: "Ocupado", Icon: MinusCircle },
  { value: "invisible", label: "Invisível", Icon: EyeOff },
];

function OnlineDot() {
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 ring-2 ring-emerald-500/35"
      aria-hidden
    />
  );
}

function statusIconClass(value: PresenceStatus): string {
  switch (value) {
    case "away":
      return "text-amber-500";
    case "busy":
      return "text-red-500";
    case "on_call":
      return "text-emerald-500";
    case "invisible":
      return "text-zinc-400";
    default:
      return "text-zinc-400";
  }
}

type PresenceStatusSelectProps = {
  isDark: boolean;
  value: PresenceStatus;
  disabled?: boolean;
  onSelect: (status: PresenceStatus) => Promise<void>;
};

export function PresenceStatusSelect({
  isDark,
  value,
  disabled = false,
  onSelect,
}: PresenceStatusSelectProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PresenceStatus | null>(null);

  const current =
    OPTIONS.find((o) => o.value === value) ??
    { value: "on_call" as const, label: "Em ligação", Icon: MinusCircle };
  const TriggerIcon = current.Icon;

  const handleSelect = async (next: PresenceStatus) => {
    if (next === value) {
      setOpen(false);
      return;
    }
    setPending(next);
    try {
      await onSelect(next);
      setOpen(false);
    } finally {
      setPending(null);
    }
  };

  /** Acima do overlay da chamada na thread (`z-[210]`) e dos menus da própria chamada. */
  const contentClass = `z-[280] min-w-[11rem] overflow-hidden rounded-xl border shadow-2xl ${
    isDark ? "border-zinc-700 bg-zinc-900 text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
  }`;

  const itemClass = `flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm outline-none ${
    isDark ? "hover:bg-zinc-800/90" : "hover:bg-emerald-50/90"
  }`;

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Estado de presença"
          className={`flex h-8 max-w-[9.5rem] shrink-0 items-center gap-1 rounded-md px-1.5 transition-colors disabled:opacity-50 ${
            isDark
              ? "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              : "text-emerald-900 hover:bg-emerald-100"
          }`}
        >
          {pending ? (
            <LoaderCircle size={15} className="shrink-0 animate-spin text-emerald-500" />
          ) : value === "online" ? (
            <OnlineDot />
          ) : TriggerIcon ? (
            <TriggerIcon size={15} strokeWidth={2.25} className={`shrink-0 ${statusIconClass(value)}`} />
          ) : (
            <OnlineDot />
          )}
          <span className="min-w-0 truncate text-xs font-medium">{current.label}</span>
          <ChevronDown size={12} className="shrink-0 opacity-60" aria-hidden />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="bottom" align="end" sideOffset={6} collisionPadding={8} className={contentClass}>
          <div
            className={`border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wide ${
              isDark ? "border-zinc-800 text-zinc-500" : "border-zinc-100 text-zinc-500"
            }`}
          >
            Estado
          </div>
          {OPTIONS.map((opt) => {
            const Icon = opt.Icon;
            const active = opt.value === value;
            const loading = pending === opt.value;
            return (
              <DropdownMenu.Item
                key={opt.value}
                className={itemClass}
                disabled={!!pending}
                onSelect={() => {
                  void handleSelect(opt.value);
                }}
              >
                {loading ? (
                  <LoaderCircle size={15} className="animate-spin text-emerald-500" />
                ) : opt.value === "online" || !Icon ? (
                  <OnlineDot />
                ) : (
                  <Icon size={15} strokeWidth={2.25} className={statusIconClass(opt.value)} />
                )}
                <span className="flex-1">{opt.label}</span>
                {active ? <Check size={14} className="text-emerald-500" /> : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
