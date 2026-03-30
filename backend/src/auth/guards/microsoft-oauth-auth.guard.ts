import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { OauthConfigSlice } from '../../config/oauth.config';
import { saveOAuthRedirectState } from '../oauth-redirect-state.store';
import { raceOAuthRedirectGuard } from './oauth-guard-redirect.race';

@Injectable()
export class MicrosoftOAuthAuthGuard extends AuthGuard('microsoft') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    return raceOAuthRedirectGuard(context, () =>
      super.canActivate(context) as Promise<boolean>,
    );
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<{
      query?: {
        email?: string;
        redirect_uri?: string;
        bridge?: string;
        client_public_ip?: string;
      };
    }>();
    const redirectUri = req.query?.redirect_uri;
    const email = req.query?.email;
    const bridgeRaw = req.query?.bridge;
    const bridgeId =
      typeof bridgeRaw === 'string' && bridgeRaw.trim().length <= 128
        ? bridgeRaw.trim()
        : undefined;

    const pipRaw = req.query?.client_public_ip;
    const clientPublicIp =
      typeof pipRaw === 'string' &&
      pipRaw.trim().length >= 3 &&
      pipRaw.trim().length <= 45 &&
      /^[\d.a-fA-F:]+$/.test(pipRaw.trim())
        ? pipRaw.trim()
        : undefined;

    let state: string | undefined;
    if (typeof redirectUri === 'string' && this.isAllowedRedirect(redirectUri)) {
      state = saveOAuthRedirectState(redirectUri, bridgeId, clientPublicIp);
    }

    return {
      session: false,
      ...(state ? { state } : {}),
      ...(typeof email === 'string' && email.includes('@')
        ? { login_hint: email }
        : {}),
    };
  }

  private isAllowedRedirect(uri: string): boolean {
    const oauth = this.config.getOrThrow<OauthConfigSlice>('oauth');
    const n = uri.trim().replace(/\/$/, '');
    return oauth.frontendRedirectAllowlist.includes(n);
  }
}
