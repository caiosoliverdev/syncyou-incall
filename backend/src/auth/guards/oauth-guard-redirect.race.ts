import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';

function firstQueryString(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

function isIdpCallbackPath(req: Request): boolean {
  const p = req.path || '';
  return p.endsWith('/google/callback') || p.endsWith('/microsoft/callback');
}

/**
 * Alguns proxies partem a query string; o Passport só lê `req.query`.
 */
function mergeQueryFromOriginalUrl(req: Request): void {
  const raw = req.originalUrl || req.url;
  if (!raw || !raw.includes('?')) return;
  try {
    const u = new URL(raw, 'http://oauth-callback.local');
    const q = req.query as Record<string, unknown>;
    for (const key of ['code', 'error', 'state', 'error_description', 'error_uri']) {
      if (firstQueryString(q[key]) !== undefined) continue;
      const v = u.searchParams.get(key);
      if (v !== null) q[key] = v;
    }
  } catch {
    /* ignore */
  }
}

/**
 * Passport OAuth: ao redirecionar para o IdP, `strategy.redirect` faz `res.end()` sem
 * invocar o callback do `authenticate`, logo a Promise do AuthGuard do Nest nunca
 * resolve e o cliente pode ficar à espera indefinidamente.
 * No primeiro passo (sem `code`/`error` na query), fazemos race com `res.finish`.
 *
 * Em `/google/callback` ou `/microsoft/callback` **nunca** usar esse race sem `code`/`error`:
 * o Passport redireciona de novo para o IdP, `finish` resolve primeiro, o guard devolve `true`
 * e o controller corre com `req.user` undefined (TypeError em `profile.provider`).
 */
export async function raceOAuthRedirectGuard(
  context: ExecutionContext,
  run: () => Promise<boolean>,
): Promise<boolean> {
  const req = context.switchToHttp().getRequest<Request>();
  const res = context.switchToHttp().getResponse<Response>();

  if (isIdpCallbackPath(req)) {
    mergeQueryFromOriginalUrl(req);
  }

  const isCallbackLeg =
    firstQueryString(req.query?.code) !== undefined ||
    firstQueryString(req.query?.error) !== undefined;

  if (isCallbackLeg) {
    return run();
  }

  if (isIdpCallbackPath(req)) {
    throw new BadRequestException(
      'Callback OAuth sem parâmetros code/error na query. Confirma o proxy (query string até ao Node) ou inicia o login outra vez.',
    );
  }

  const finish = new Promise<boolean>((resolve) => {
    res.once('finish', () => {
      resolve(res.statusCode >= 300 && res.statusCode < 400);
    });
  });

  return Promise.race([run(), finish]);
}
