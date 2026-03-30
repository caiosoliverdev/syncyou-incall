import { registerAs } from '@nestjs/config';

/** URLs públicas: namespace `urls` (WEB_APP_ORIGIN, API_PUBLIC_ORIGIN). */
export default registerAs('app', () => ({
  /** Esquema para abrir o app Tauri após confirmar e-mail (ex.: syncyou). */
  deepLinkScheme: process.env.APP_DEEP_LINK_SCHEME ?? 'syncyou',
  /** Caminho no deep link após confirmação (ex.: auth/email-verified). */
  deepLinkPathAfterEmailConfirm:
    process.env.APP_DEEP_LINK_PATH_EMAIL_CONFIRM ?? 'auth/email-verified',
  nodeEnv: process.env.NODE_ENV ?? 'development',
}));
