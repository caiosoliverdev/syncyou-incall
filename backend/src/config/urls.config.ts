import { registerAs } from '@nestjs/config';
import { resolvePublicUrls } from './resolve-public-urls';

/** Namespace `urls` no ConfigService — ver resolve-public-urls.ts. */
export default registerAs('urls', () => resolvePublicUrls());
