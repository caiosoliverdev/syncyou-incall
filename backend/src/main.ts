import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { existsSync } from 'fs';
import { join } from 'path';
import * as express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { resolvePublicUrls } from './config/resolve-public-urls';
import { setupSwagger } from './swagger/setup-swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', 1);
  app.useWebSocketAdapter(new IoAdapter(app));

  app.use(cookieParser());

  /** Next `output: "export"` (ex. /oauth/callback) quando API e UI partilham o mesmo host sem nginx a servir `out/`. */
  const frontendStaticRoot = (() => {
    const raw = process.env.FRONTEND_STATIC_DIR?.trim();
    if (raw) return raw.startsWith('/') ? raw : join(process.cwd(), raw);
    return join(process.cwd(), '..', 'frontend', 'out');
  })();
  if (existsSync(frontendStaticRoot)) {
    const serveNextExport = express.static(frontendStaticRoot, {
      extensions: ['html'],
      index: ['index.html'],
      maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
    });
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      if (req.path === '/api' || req.path.startsWith('/api/')) {
        next();
        return;
      }
      serveNextExport(req, res, next);
    });
  } else if (process.env.NODE_ENV === 'production') {
    console.warn(
      `[bootstrap] FRONTEND_STATIC_DIR / export Next não encontrado (${frontendStaticRoot}). ` +
        `GET /oauth/callback e ficheiros estáticos da UI devolvem 404 — faz build do frontend ou define FRONTEND_STATIC_DIR.`,
    );
  }

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

  const publicUrls = resolvePublicUrls();
  /** Com `CORS_ORIGIN` definido: lista explícita + credentials. Sem definir ou `*`: permissivo (Bearer no header). */
  const cors =
    publicUrls.corsOrigins?.length ?
      {
        origin: publicUrls.corsOrigins,
        credentials: true as const,
      }
    : {
        origin: '*' as const,
        credentials: false as const,
      };
  app.enableCors({
    ...cors,
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
