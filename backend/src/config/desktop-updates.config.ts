import { registerAs } from '@nestjs/config';
import { resolvePublicUrls } from './resolve-public-urls';

export default registerAs('desktopUpdates', () => {
  const { apiPublicOrigin } = resolvePublicUrls();
  return {
    /** Bearer ou header X-Desktop-Updates-Token (POST /desktop-updates/publish). */
    publishToken: process.env.DESKTOP_UPDATES_PUBLISH_TOKEN ?? '',
    /** Mesmo valor que `urls.apiPublicOrigin` — URLs absolutas no manifest do updater. */
    apiPublicBaseUrl: apiPublicOrigin,
  };
});
