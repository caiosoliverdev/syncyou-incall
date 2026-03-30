import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { LegalModule } from './legal/legal.module';
import { MailModule } from './mail/mail.module';
import { ChatModule } from './chat/chat.module';
import { ContactsModule } from './contacts/contacts.module';
import { LinkPreviewModule } from './link-preview/link-preview.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UsersModule } from './users/users.module';
import appConfig from './config/app.config';
import urlsConfig from './config/urls.config';
import authConfig from './config/auth.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import mailConfig from './config/mail.config';
import securityConfig from './config/security.config';
import oauthConfig from './config/oauth.config';
import mediasoupConfig from './config/mediasoup.config';
import desktopUpdatesConfig from './config/desktop-updates.config';
import { DesktopUpdatesModule } from './desktop-updates/desktop-updates.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        databaseConfig,
        mailConfig,
        jwtConfig,
        appConfig,
        urlsConfig,
        authConfig,
        securityConfig,
        oauthConfig,
        mediasoupConfig,
        desktopUpdatesConfig,
      ],
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env',
      ],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 120,
      },
    ]),
    DatabaseModule,
    MailModule,
    LegalModule,
    UsersModule,
    ContactsModule,
    ChatModule,
    NotificationsModule,
    LinkPreviewModule,
    AuthModule,
    DesktopUpdatesModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
