import { forwardRef, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { SignOptions } from 'jsonwebtoken';
import { MailModule } from '../mail/mail.module';
import { ChatModule } from '../chat/chat.module';
import { MediasoupModule } from '../mediasoup/mediasoup.module';
import { ContactsModule } from '../contacts/contacts.module';
import { UsersModule } from '../users/users.module';
import type { JwtConfigSlice } from './jwt-config.types';
import { ensureJwtRsaKeys } from './jwt-keys.util';
import { GoogleOAuthStrategy } from './google-oauth.strategy';
import { MicrosoftOAuthStrategy } from './microsoft-oauth.strategy';
import { GoogleOAuthAuthGuard } from './guards/google-oauth-auth.guard';
import { MicrosoftOAuthAuthGuard } from './guards/microsoft-oauth-auth.guard';
import { OAuthGoogleEnabledGuard } from './guards/oauth-google-enabled.guard';
import { OAuthMicrosoftEnabledGuard } from './guards/oauth-microsoft-enabled.guard';
import { JwtStrategy } from './jwt.strategy';
import { OAuthBridgeModule } from './oauth-bridge/oauth-bridge.module';
import { SessionRegistryService } from './session/session-registry.service';
import { SessionGateway } from './session/session.gateway';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetOtp } from './entities/password-reset-otp.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { SessionLoginLog } from './entities/session-login-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([RefreshToken, PasswordResetOtp, SessionLoginLog]),
    ConfigModule,
    UsersModule,
    MailModule,
    forwardRef(() => ContactsModule),
    forwardRef(() => ChatModule),
    forwardRef(() => MediasoupModule),
    OAuthBridgeModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      global: true,
      useFactory: (config: ConfigService) => {
        const jwt = config.getOrThrow<JwtConfigSlice>('jwt');
        const { privateKey, publicKey } = ensureJwtRsaKeys(jwt.keysDir);

        return {
          privateKey,
          publicKey,
          signOptions: {
            algorithm: 'RS256',
            expiresIn: jwt.accessExpiresIn as SignOptions['expiresIn'],
            issuer: jwt.issuer,
          },
          verifyOptions: {
            algorithms: ['RS256'],
            issuer: jwt.issuer,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    SessionRegistryService,
    SessionGateway,
    AuthService,
    JwtStrategy,
    GoogleOAuthStrategy,
    MicrosoftOAuthStrategy,
    GoogleOAuthAuthGuard,
    MicrosoftOAuthAuthGuard,
    OAuthGoogleEnabledGuard,
    OAuthMicrosoftEnabledGuard,
  ],
  exports: [JwtModule, PassportModule, AuthService, SessionRegistryService],
})
export class AuthModule {}
