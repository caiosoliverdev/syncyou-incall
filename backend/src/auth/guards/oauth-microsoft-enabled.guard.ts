import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OauthConfigSlice } from '../../config/oauth.config';

@Injectable()
export class OAuthMicrosoftEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    const oauth = this.config.getOrThrow<OauthConfigSlice>('oauth');
    if (!oauth.microsoft.enabled) {
      throw new ServiceUnavailableException(
        'Microsoft OAuth não configurado. Defina OAUTH_MICROSOFT_CLIENT_ID e segredo no .env.',
      );
    }
    return true;
  }
}
