import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OauthConfigSlice } from '../config/oauth.config';

/**
 * Avisa no arranque se o segredo Google parece placeholder — causa típica de
 * `invalid_client` / "The provided client secret is invalid".
 */
@Injectable()
export class OauthGoogleEnvDiagnosticsService implements OnModuleInit {
  private readonly logger = new Logger(OauthGoogleEnvDiagnosticsService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const oauth = this.config.get<OauthConfigSlice>('oauth');
    if (!oauth?.google?.enabled) return;
    const secret = oauth.google.clientSecret ?? '';
    const looksPlaceholder =
      secret.length < 24 ||
      /^REPLACE_/i.test(secret) ||
      /CHANGE_ME|YOUR_|placeholder/i.test(secret);
    if (looksPlaceholder) {
      this.logger.warn(
        'Google OAuth: OAUTH_GOOGLE_CLIENT_SECRET parece ausente ou placeholder. ' +
          'Define o segredo real do cliente OAuth (tipo "Aplicação Web") em `.env` ou em `.env.production`. ' +
          'O par ID+secret tem de ser o mesmo ecrã na Google Cloud Console.',
      );
    }
  }
}
