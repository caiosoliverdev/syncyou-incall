import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';
import type { JwtConfigSlice } from './jwt-config.types';
import { ensureJwtRsaKeys } from './jwt-keys.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const jwt = config.getOrThrow<JwtConfigSlice>('jwt');
    const { publicKey } = ensureJwtRsaKeys(jwt.keysDir);

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'],
      issuer: jwt.issuer,
    });
  }

  async validate(payload: { sub: string; typ?: string; sid?: string }) {
    if (payload.typ !== 'access') {
      throw new UnauthorizedException();
    }
    const user = await this.usersService.findActiveById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.accountDisabledAt) {
      throw new UnauthorizedException();
    }
    return { userId: user.id, sessionId: payload.sid };
  }
}
