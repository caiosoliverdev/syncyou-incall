import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Friendship } from '../contacts/entities/friendship.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { ChatController } from './chat.controller';
import { MediasoupModule } from '../mediasoup/mediasoup.module';
import { ChatService } from './chat.service';
import { CallLog } from './entities/call-log.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationMedia } from './entities/conversation-media.entity';
import { Message } from './entities/message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      ConversationParticipant,
      ConversationMedia,
      Message,
      CallLog,
      Friendship,
    ]),
    UsersModule,
    NotificationsModule,
    forwardRef(() => AuthModule),
    MediasoupModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
