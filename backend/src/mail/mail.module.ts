import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { join } from 'path';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const mail = config.get<{
          host: string;
          port: number;
          secure: boolean;
          user: string;
          password: string;
          from: string;
          fromName: string;
        }>('mail')!;
        return {
          transport: {
            host: mail.host,
            port: mail.port,
            secure: mail.secure,
            auth:
              mail.user && mail.password
                ? { user: mail.user, pass: mail.password }
                : undefined,
          },
          defaults: {
            from: `"${mail.fromName}" <${mail.from}>`,
          },
          template: {
            dir: join(__dirname, '..', 'templates', 'email'),
            adapter: new HandlebarsAdapter(),
            options: { strict: true },
          },
        };
      },
    }),
  ],
  exports: [MailerModule],
})
export class MailModule {}
