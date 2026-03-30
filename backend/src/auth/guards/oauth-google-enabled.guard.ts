import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OauthConfigSlice } from '../../config/oauth.config';

@Injectable()
export class OAuthGoogleEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    const oauth = this.config.getOrThrow<OauthConfigSlice>('oauth');
    if (!oauth.google.enabled) {
      throw new ServiceUnavailableException(
        'Google OAuth não configurado. Defina OAUTH_GOOGLE_CLIENT_ID e segredo no .env.',
      );
    }
    return true;
  }
}
