"use client";

import type { PresenceStatus } from "@/lib/api";

type PeerPresenceDotProps = {
  presenceStatus: PresenceStatus;
  isDark: boolean;
  className?: string;
  /** `md` = cabeçalho da thread (ligeiramente maior). */
  size?: "sm" | "md";
};

/** Bolinha no canto do avatar: online, ausente, ocupado; invisível aparece como offline para o outro. */
export function PeerPresenceDot({
  presenceStatus,
  isDark,
  className = "",
  size = "sm",
}: PeerPresenceDotProps) {
  const ring = isDark ? "ring-zinc-900" : "ring-white";
  const invisible = presenceStatus === "invisible";
  const label = invisible
    ? "Offline"
    : presenceStatus === "online"
      ? "Online"
      : presenceStatus === "away"
        ? "Ausente"
        : presenceStatus === "on_call"
          ? "Em ligação"
        : "Ocupado";

  const dot = invisible
    ? `bg-zinc-400 ring-2 ${ring} ring-zinc-500/35`
      : presenceStatus === "online"
        ? `bg-emerald-500 ring-2 ${ring} ring-emerald-500/45`
        : presenceStatus === "away"
          ? `bg-amber-500 ring-2 ${ring} ring-amber-500/45`
          : presenceStatus === "on_call"
            ? `bg-emerald-400 ring-2 ${ring} ring-emerald-400/45`
          : `bg-red-500 ring-2 ${ring} ring-red-500/45`;

  const dim = size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`pointer-events-none absolute bottom-0 right-0 block rounded-full ${dim} ${dot} ${className}`}
    />
  );
}
