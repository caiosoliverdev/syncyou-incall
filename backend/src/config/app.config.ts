import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  baseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
  /** Esquema para abrir o app Tauri após confirmar e-mail (ex.: syncyou). */
  deepLinkScheme: process.env.APP_DEEP_LINK_SCHEME ?? 'syncyou',
  /** Caminho no deep link após confirmação (ex.: auth/email-verified). */
  deepLinkPathAfterEmailConfirm:
    process.env.APP_DEEP_LINK_PATH_EMAIL_CONFIRM ?? 'auth/email-verified',
  nodeEnv: process.env.NODE_ENV ?? 'development',
}));
