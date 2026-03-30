import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { join } from 'path';
import * as express from 'express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { setupSwagger } from './swagger/setup-swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);
  app.useWebSocketAdapter(new IoAdapter(app));

  app.use(cookieParser());

  /** Binários do updater em `data/desktop-updates/bundles/`. O manifest `latest.json` vem da BD (Nest). */
  const desktopUpdatesBundles = join(
    process.cwd(),
    'data',
    'desktop-updates',
    'bundles',
  );
  app.use(
    '/api/v1/desktop-updates/files',
    express.static(desktopUpdatesBundles, {
      immutable: false,
      maxAge: 0,
    }),
  );

  const uploadsRoot = join(process.cwd(), 'data', 'uploads');
  app.use(
    '/api/v1/files',
    express.static(uploadsRoot, {
      setHeaders: (res, filePath) => {
        const n = filePath.replace(/\\/g, '/');
        if (n.includes('/avatars/')) {
          res.setHeader(
            'Cache-Control',
            'no-store, no-cache, must-revalidate, proxy-revalidate',
          );
          res.setHeader('Pragma', 'no-cache');
        }
      },
    }),
  );

  /** `origin: '*'` não pode ser usado com `credentials: true` (regra CORS). Bearer vai no header. */
  app.enableCors({
    origin: '*',
    credentials: false,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Cookie',
      'X-Requested-With',
      'X-Desktop-Updates-Token',
    ],
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  setupSwagger(app);

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((err: unknown) => {
  console.error('[bootstrap]', err);
  process.exit(1);
});
