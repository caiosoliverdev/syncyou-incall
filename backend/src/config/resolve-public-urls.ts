/**
 * Única fonte de URLs públicas a partir do .env (sem repetir host/porta em várias variáveis).
 *
 * - WEB_APP_ORIGIN — UI Next/Tauri (OAuth redirect no browser, CORS).
 * - API_PUBLIC_ORIGIN — URL onde este Nest é alcançável (ficheiros /api/v1/files, callbacks OAuth, manifest updater).
 *
 * Compatibilidade: API_PUBLIC_BASE_URL = API_PUBLIC_ORIGIN; APP_BASE_URL antigo mapeia só para API se os novos não existirem.
 */

export type ResolvedPublicUrls = {
  webAppOrigin: string;
  apiPublicOrigin: string;
  oauthFrontendRedirectUrl: string;
  oauthGoogleCallbackUrl: string;
  oauthMicrosoftCallbackUrl: string;
  /** Lista para validação de redirect_uri OAuth. */
  oauthFrontendRedirectAllowlist: string[];
  /** null = usar CORS permissivo (*); caso contrário lista explícita. */
  corsOrigins: string[] | null;
};

function stripTrailingSlash(u: string): string {
  return u.replace(/\/+$/, '');
}

function normalizeRedirectUrl(url: string): string {
  return stripTrailingSlash(url.trim());
}

function buildDefaultOAuthRedirects(webAppOrigin: string): string[] {
  const out: string[] = [];
  try {
    const u = new URL(webAppOrigin);
    const base = `${u.protocol}//${u.host}`;
    out.push(`${base}/oauth/callback`, `${base}/oauth/tauri-handoff`);
    if (u.hostname === 'localhost' && u.port) {
      out.push(`http://127.0.0.1:${u.port}/oauth/callback`);
      out.push(`http://127.0.0.1:${u.port}/oauth/tauri-handoff`);
    } else if (u.hostname === 'localhost' && !u.port) {
      out.push('http://127.0.0.1:3000/oauth/callback');
      out.push('http://127.0.0.1:3000/oauth/tauri-handoff');
    }
  } catch {
    out.push(`${stripTrailingSlash(webAppOrigin)}/oauth/callback`);
  }
  out.push('syncyou://oauth/callback');
  return [...new Set(out.map(normalizeRedirectUrl))];
}

function parseFrontendRedirectAllowlist(
  webAppOrigin: string,
  env: NodeJS.ProcessEnv,
): string[] {
  const defaults = buildDefaultOAuthRedirects(webAppOrigin);
  const extra =
    env.OAUTH_FRONTEND_REDIRECT_ALLOWLIST?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const main = env.OAUTH_FRONTEND_REDIRECT_URL?.trim();
  const merged = [...defaults, ...extra];
  if (main) merged.push(main);
  return [...new Set(merged.map(normalizeRedirectUrl))];
}

export function resolvePublicUrls(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedPublicUrls {
  const apiPublicOrigin = stripTrailingSlash(
    env.API_PUBLIC_ORIGIN?.trim() ||
      env.API_PUBLIC_BASE_URL?.trim() ||
      env.APP_BASE_URL?.trim() ||
      'http://localhost:3001',
  );

  const webAppOrigin = stripTrailingSlash(
    env.WEB_APP_ORIGIN?.trim() || 'http://localhost:3000',
  );

  const oauthFrontendRedirectUrl = normalizeRedirectUrl(
    env.OAUTH_FRONTEND_REDIRECT_URL?.trim() ||
      `${webAppOrigin}/oauth/callback`,
  );

  const oauthGoogleCallbackUrl = normalizeRedirectUrl(
    env.OAUTH_GOOGLE_CALLBACK_URL?.trim() ||
      `${apiPublicOrigin}/api/v1/auth/google/callback`,
  );

  const oauthMicrosoftCallbackUrl = normalizeRedirectUrl(
    env.OAUTH_MICROSOFT_CALLBACK_URL?.trim() ||
      `${apiPublicOrigin}/api/v1/auth/microsoft/callback`,
  );

  const oauthFrontendRedirectAllowlist = parseFrontendRedirectAllowlist(
    webAppOrigin,
    env,
  );

  const corsRaw = env.CORS_ORIGIN?.trim();
  let corsOrigins: string[] | null = null;
  if (corsRaw && corsRaw !== '*') {
    corsOrigins = corsRaw
      .split(',')
      .map((s) => stripTrailingSlash(s.trim()))
      .filter(Boolean);
  }

  return {
    webAppOrigin,
    apiPublicOrigin,
    oauthFrontendRedirectUrl,
    oauthGoogleCallbackUrl,
    oauthMicrosoftCallbackUrl,
    oauthFrontendRedirectAllowlist,
    corsOrigins,
  };
}
