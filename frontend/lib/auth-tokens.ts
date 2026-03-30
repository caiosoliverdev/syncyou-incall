const ACCESS = "syncyou_access_token";
const REFRESH = "syncyou_refresh_token";
const ACCESS_EXPIRES_AT = "syncyou_access_expires_at_ms";

/** Disparado após `saveTokens` para o socket `/session` reconectar com o JWT novo. */
export const SESSION_TOKENS_UPDATED_EVENT = "syncyou_tokens_updated";

/** Refresh falhou ou refresh token em falta — a app deve deslogar. */
export const AUTH_LOGOUT_REQUIRED_EVENT = "syncyou_auth_logout_required";

export function saveTokens(
  accessToken: string,
  refreshToken: string,
  expiresInSeconds?: number,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS, accessToken);
  window.localStorage.setItem(REFRESH, refreshToken);
  if (expiresInSeconds != null && Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
    window.localStorage.setItem(ACCESS_EXPIRES_AT, String(Date.now() + expiresInSeconds * 1000));
  } else {
    window.localStorage.removeItem(ACCESS_EXPIRES_AT);
  }
  window.dispatchEvent(new Event(SESSION_TOKENS_UPDATED_EVENT));
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS);
  window.localStorage.removeItem(REFRESH);
  window.localStorage.removeItem(ACCESS_EXPIRES_AT);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH);
}

export function getAccessExpiresAtMs(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ACCESS_EXPIRES_AT);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function setAccessExpiresAtMs(ms: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_EXPIRES_AT, String(ms));
}
