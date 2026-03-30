import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-google-oauth20';
import type { OauthConfigSlice } from '../config/oauth.config';
import type { OAuthProfilePayload } from './types/oauth-profile.types';

@Injectable()
export class GoogleOAuthStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    const oauth = config.getOrThrow<OauthConfigSlice>('oauth');
    super({
      clientID: oauth.google.clientId || 'not-configured',
      clientSecret: oauth.google.clientSecret || 'not-configured',
      callbackURL: oauth.google.callbackUrl,
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ): OAuthProfilePayload {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new Error('Google não devolveu email');
    }
    const name = profile.name;
    return {
      provider: 'google',
      oauthSubject: profile.id,
      email: email.toLowerCase().trim(),
      firstName: name?.givenName ?? profile.displayName?.split(' ')[0] ?? 'Utilizador',
      lastName: name?.familyName ?? '',
      picture: profile.photos?.[0]?.value ?? null,
    };
  }
}
