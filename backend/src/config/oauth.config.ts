import { registerAs } from '@nestjs/config';
import { resolvePublicUrls } from './resolve-public-urls';

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
  const u = resolvePublicUrls();
  return {
    frontendRedirectUrl: u.oauthFrontendRedirectUrl,
    frontendRedirectAllowlist: u.oauthFrontendRedirectAllowlist,
    google: {
      enabled: !!process.env.OAUTH_GOOGLE_CLIENT_ID?.trim(),
      clientId: process.env.OAUTH_GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET ?? '',
      callbackUrl: u.oauthGoogleCallbackUrl,
    },
    microsoft: {
      enabled: !!process.env.OAUTH_MICROSOFT_CLIENT_ID?.trim(),
      clientId: process.env.OAUTH_MICROSOFT_CLIENT_ID ?? '',
      clientSecret: process.env.OAUTH_MICROSOFT_CLIENT_SECRET ?? '',
      callbackUrl: u.oauthMicrosoftCallbackUrl,
    },
  };
});
