import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-microsoft';
import type { OauthConfigSlice } from '../config/oauth.config';
import type { OAuthProfilePayload } from './types/oauth-profile.types';

type MicrosoftPassportProfile = {
  id: string;
  displayName?: string;
  name?: { givenName?: string; familyName?: string };
  emails?: { value: string }[];
  userPrincipalName?: string;
};

@Injectable()
export class MicrosoftOAuthStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor(config: ConfigService) {
    const oauth = config.getOrThrow<OauthConfigSlice>('oauth');
    super({
      clientID: oauth.microsoft.clientId || 'not-configured',
      clientSecret: oauth.microsoft.clientSecret || 'not-configured',
      callbackURL: oauth.microsoft.callbackUrl,
      scope: ['user.read'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: MicrosoftPassportProfile,
  ): OAuthProfilePayload {
    const email =
      profile.emails?.[0]?.value ||
      (profile as { _json?: { mail?: string } })._json?.mail;
    if (!email) {
      throw new Error('Microsoft não devolveu email');
    }
    const name = profile.name;
    return {
      provider: 'microsoft',
      oauthSubject: profile.id,
      email: email.toLowerCase().trim(),
      firstName: name?.givenName ?? profile.displayName?.split(' ')[0] ?? 'Utilizador',
      lastName: name?.familyName ?? '',
      picture: null,
    };
  }
}
