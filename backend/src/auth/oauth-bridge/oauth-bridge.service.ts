import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { OAuthSocketPayload } from './oauth-socket-payload.types';

@Injectable()
export class OAuthBridgeService {
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  emit(bridgeId: string | undefined, payload: OAuthSocketPayload): void {
    if (!this.server || !bridgeId?.trim()) return;
    this.server.to(`oauth-bridge:${bridgeId.trim()}`).emit('oauth_result', payload);
  }
}
