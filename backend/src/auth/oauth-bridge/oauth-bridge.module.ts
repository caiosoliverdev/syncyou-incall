import { Module } from '@nestjs/common';
import { OAuthBridgeGateway } from './oauth-bridge.gateway';
import { OAuthBridgeService } from './oauth-bridge.service';

@Module({
  providers: [OAuthBridgeService, OAuthBridgeGateway],
  exports: [OAuthBridgeService],
})
export class OAuthBridgeModule {}
