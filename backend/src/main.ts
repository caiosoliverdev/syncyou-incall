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

  const publicUrls = resolvePublicUrls();

  /**
   * Se OAUTH_FRONTEND_REDIRECT_URL (ou fallback) estiver errado, o redirect de sucesso pode cair em
   * `/api/v1/auth/google/callback?oauth=ok&access_token=...` — o Passport espera `code` do Google nesse path.
   * Reencaminha para a página da UI que consome tokens (`/oauth/callback`) com a mesma query.
   */
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    const p = (req.path || '').replace(/\/+$/, '');
    if (!/\/auth\/(google|microsoft)\/callback$/.test(p)) {
      next();
      return;
    }
    const q = req.query as Record<string, unknown>;
    if (typeof q.code === 'string' && q.code.length > 0) {
      next();
      return;
    }
    const oauth = typeof q.oauth === 'string' ? q.oauth : '';
    if (!oauth) {
      next();
      return;
    }
    const full = (req.originalUrl || req.url || '').split('#')[0];
    const qIdx = full.indexOf('?');
    const search = qIdx >= 0 ? full.slice(qIdx) : '';
    const base = publicUrls.webAppOrigin.replace(/\/$/, '');
    res.redirect(302, `${base}/oauth/callback${search}`);
  });

  /** Next `output: "export"` (ex. /oauth/callback) quando API e UI partilham o mesmo host sem nginx a servir `out/`. */
  const frontendStaticRoot = (() => {
    const raw = process.env.FRONTEND_STATIC_DIR?.trim();
    if (raw) return raw.startsWith('/') ? raw : join(process.cwd(), raw);
    return join(process.cwd(), '..', 'frontend', 'out');
  })();

  const httpApp = app.getHttpAdapter().getInstance() as import('express').Application;
  const oauthCallbackHtml = join(frontendStaticRoot, 'oauth', 'callback.html');
  const oauthTauriHandoffHtml = join(frontendStaticRoot, 'oauth', 'tauri-handoff.html');

  const sendNextOAuthHtml =
    (absolutePath: string) => (_req: Request, res: Response) => {
      if (!existsSync(absolutePath)) {
        res.status(404).json({
          message:
            'Export estático do Next em falta (oauth). Faz `cd frontend && npm run build`, copia `out/` para o servidor ou define FRONTEND_STATIC_DIR com o caminho absoluto de `out/`.',
        });
        return;
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.sendFile(absolutePath, (err) => {
        if (err && !res.headersSent) {
          res.status(500).end();
        }
      });
    };

  for (const path of ['/oauth/callback', '/oauth/callback/']) {
    httpApp.get(path, sendNextOAuthHtml(oauthCallbackHtml));
  }
  for (const path of ['/oauth/tauri-handoff', '/oauth/tauri-handoff/']) {
    httpApp.get(path, sendNextOAuthHtml(oauthTauriHandoffHtml));
  }

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
