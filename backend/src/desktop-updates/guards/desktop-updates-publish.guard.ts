import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DesktopUpdatesPublishGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('desktopUpdates.publishToken', '');
    if (!expected) {
      throw new ForbiddenException('DESKTOP_UPDATES_PUBLISH_TOKEN não configurado no servidor');
    }
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const auth = req.headers['authorization'];
    const headerToken = req.headers['x-desktop-updates-token'];
    const bearer =
      typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
    const provided = bearer ?? headerToken;
    if (!provided || provided !== expected) {
      throw new UnauthorizedException('Token de publicação inválido');
    }
    return true;
  }
}
