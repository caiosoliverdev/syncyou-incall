import { registerAs } from '@nestjs/config';

function normalizeFrontendRedirectUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

/** URLs permitidas para redirect_uri (OAuth no browser externo + deep link syncyou://). */
function parseFrontendRedirectAllowlist(env: NodeJS.ProcessEnv): string[] {
  const defaults = [
    'http://localhost:3000/oauth/callback',
    'http://127.0.0.1:3000/oauth/callback',
    'http://localhost:3000/oauth/tauri-handoff',
    'http://127.0.0.1:3000/oauth/tauri-handoff',
    'syncyou://oauth/callback',
  ];
  const extra =
    env.OAUTH_FRONTEND_REDIRECT_ALLOWLIST?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const main = env.OAUTH_FRONTEND_REDIRECT_URL?.trim();
  const merged = [...defaults, ...extra];
  if (main) merged.push(main);
  return [...new Set(merged.map(normalizeFrontendRedirectUrl))];
}

export type OauthConfigSlice = {
  frontendRedirectUrl: string;
  frontendRedirectAllowlist: string[];
  google: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
  microsoft: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
};

export default registerAs('oauth', (): OauthConfigSlice => {
  const frontendRedirectUrl =
    process.env.OAUTH_FRONTEND_REDIRECT_URL ?? 'http://localhost:3000/oauth/callback';
  return {
    frontendRedirectUrl: normalizeFrontendRedirectUrl(frontendRedirectUrl),
    frontendRedirectAllowlist: parseFrontendRedirectAllowlist(process.env),
    google: {
      enabled: !!process.env.OAUTH_GOOGLE_CLIENT_ID?.trim(),
      clientId: process.env.OAUTH_GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET ?? '',
      callbackUrl:
        process.env.OAUTH_GOOGLE_CALLBACK_URL ??
        'http://localhost:3001/api/v1/auth/google/callback',
    },
    microsoft: {
      enabled: !!process.env.OAUTH_MICROSOFT_CLIENT_ID?.trim(),
      clientId: process.env.OAUTH_MICROSOFT_CLIENT_ID ?? '',
      clientSecret: process.env.OAUTH_MICROSOFT_CLIENT_SECRET ?? '',
      callbackUrl:
        process.env.OAUTH_MICROSOFT_CALLBACK_URL ??
        'http://localhost:3001/api/v1/auth/microsoft/callback',
    },
  };
});
