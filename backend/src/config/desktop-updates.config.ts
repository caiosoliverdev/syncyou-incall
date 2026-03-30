import { registerAs } from '@nestjs/config';

export default registerAs('desktopUpdates', () => ({
  /** Bearer ou header X-Desktop-Updates-Token (POST /desktop-updates/publish). */
  publishToken: process.env.DESKTOP_UPDATES_PUBLISH_TOKEN ?? '',
  /**
   * Origem pública do API (sem barra final), usada nas URLs do `latest.json`.
   * Ex.: https://api.exemplo.com ou http://localhost:3001
   */
  apiPublicBaseUrl: (process.env.API_PUBLIC_BASE_URL ?? 'http://localhost:3001').replace(
    /\/$/,
    '',
  ),
}));
