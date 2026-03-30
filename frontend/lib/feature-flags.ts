/**
 * Flags de produto (cliente). Override local: `localStorage.setItem("incall:ff:offlineOutbox", "0")`.
 * `NEXT_PUBLIC_FF_*` em `.env` (valor `1` / `true` = activo).
 */

export type FeatureFlagKey =
  | "offlineOutbox"
  | "undoDeleteForMe"
  | "sidebarSkeleton"
  | "notificationSoundDebounce";

const DEFAULTS: Record<FeatureFlagKey, boolean> = {
  offlineOutbox: true,
  undoDeleteForMe: true,
  sidebarSkeleton: true,
  notificationSoundDebounce: true,
};

function envFlag(key: FeatureFlagKey): boolean | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  const snake = key.replace(/([A-Z])/g, "_$1").replace(/^_/, "").toUpperCase();
  const v = process.env[`NEXT_PUBLIC_FF_${snake}` as keyof typeof process.env];
  if (v === undefined || v === "") return undefined;
  const lower = v.toLowerCase();
  if (lower === "1" || lower === "true" || lower === "yes") return true;
  if (lower === "0" || lower === "false" || lower === "no") return false;
  return undefined;
}

export function getFeatureFlag(key: FeatureFlagKey): boolean {
  const fromEnv = envFlag(key);
  if (typeof window === "undefined") {
    return fromEnv ?? DEFAULTS[key];
  }
  try {
    const stored = window.localStorage.getItem(`incall:ff:${key}`);
    if (stored === "1") return true;
    if (stored === "0") return false;
  } catch {
    /* ignorar */
  }
  return fromEnv ?? DEFAULTS[key];
}
