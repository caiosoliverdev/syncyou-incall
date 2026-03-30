import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { MediasoupRoomService } from './mediasoup-room.service';
import { MediasoupService } from './mediasoup.service';

@Module({
  imports: [ConfigModule, forwardRef(() => AuthModule)],
  providers: [MediasoupService, MediasoupRoomService],
  exports: [MediasoupService, MediasoupRoomService],
})
export class MediasoupModule {}
