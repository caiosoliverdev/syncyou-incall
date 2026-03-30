/**
 * Única fonte de URLs públicas a partir do .env (sem repetir host/porta em várias variáveis).
 *
 * - WEB_APP_ORIGIN — UI Next/Tauri (CORS). Com CORS_ORIGIN em lista, é sempre acrescentada à allowlist.
 * - CORS_EXTRA_ORIGINS — opcional, vírgulas; ex. http://localhost:3000 quando o front local usa API remota.
 * - API_PUBLIC_ORIGIN — URL onde este Nest é alcançável (ficheiros /api/v1/files, manifest updater).
 *
 * Compatibilidade: API_PUBLIC_BASE_URL = API_PUBLIC_ORIGIN; APP_BASE_URL antigo mapeia só para API se os novos não existirem.
 */

export type ResolvedPublicUrls = {
  webAppOrigin: string;
  apiPublicOrigin: string;
  /** null = usar CORS permissivo (*); caso contrário lista explícita. */
  corsOrigins: string[] | null;
};

function stripTrailingSlash(u: string): string {
  return u.replace(/\/+$/, '');
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

  const corsRaw = env.CORS_ORIGIN?.trim();
  let corsOrigins: string[] | null = null;
  if (corsRaw && corsRaw !== '*') {
    corsOrigins = corsRaw
      .split(',')
      .map((s) => stripTrailingSlash(s.trim()))
      .filter(Boolean);
  }

  const corsExtra =
    env.CORS_EXTRA_ORIGINS?.split(',')
      .map((s) => stripTrailingSlash(s.trim()))
      .filter(Boolean) ?? [];

  if (corsOrigins?.length) {
    corsOrigins = [
      ...new Set([...corsOrigins, webAppOrigin, ...corsExtra]),
    ];
  }

  return {
    webAppOrigin,
    apiPublicOrigin,
    corsOrigins,
  };
}
