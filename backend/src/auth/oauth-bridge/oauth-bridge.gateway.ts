import { Logger } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import {
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { OAuthBridgeService } from './oauth-bridge.service';

@SkipThrottle()
@WebSocketGateway({
  namespace: '/oauth-bridge',
  cors: { origin: '*', credentials: false },
})
export class OAuthBridgeGateway implements OnGatewayInit {
  private readonly logger = new Logger(OAuthBridgeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly oauthBridge: OAuthBridgeService) {}

  afterInit(): void {
    this.oauthBridge.setServer(this.server);
    this.logger.log('Socket.IO namespace /oauth-bridge ready');
  }

  @SubscribeMessage('join')
  handleJoin(client: Socket, payload: { bridgeId?: string }): void {
    const id = payload?.bridgeId?.trim();
    if (!id || id.length > 128 || !/^[\w-]+$/.test(id)) {
      return;
    }
    void client.join(`oauth-bridge:${id}`);
  }
}
