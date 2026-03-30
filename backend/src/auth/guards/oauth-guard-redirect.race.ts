import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { parse as parseQuerystring } from 'node:querystring';
import type { Request, Response } from 'express';

function firstQueryString(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

function isIdpCallbackPath(req: Request): boolean {
  const p = (req.path || '').replace(/\/+$/, '');
  return /\/google\/callback$/.test(p) || /\/microsoft\/callback$/.test(p);
}

/** Preferir `originalUrl` com query; se o proxy a truncar, usar `url` (pode ainda ter `?code=`). */
function rawUrl(req: Request): string {
  const a = (req.originalUrl || '').split('#')[0];
  const b = (req.url || '').split('#')[0];
  if (a.includes('?')) return a;
  if (b.includes('?')) return b;
  return a || b;
}

function rawUrlLooksLikeOAuthCallback(req: Request): boolean {
  const s = rawUrl(req);
  return /(?:^|[?&])code=/.test(s) || /(?:^|[?&])error=/.test(s);
}

/**
 * Proxies ou stacks estranhos podem deixar `req.query` vazio; o Passport só lê `req.query`.
 * Reatribuímos o objeto inteiro para garantir que o Passport vê `code` / `state`.
 */
function mergeQueryFromOriginalUrl(req: Request): void {
  const full = rawUrl(req);
  const qMark = full.indexOf('?');
  if (qMark < 0) return;
  const qs = full.slice(qMark + 1);
  if (!qs) return;
  try {
    const parsed = parseQuerystring(qs);
    const fromUrl: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.length > 0) {
        fromUrl[k] = v;
      } else if (Array.isArray(v)) {
        const strings = v.filter((x): x is string => typeof x === 'string' && x.length > 0);
        if (strings.length === 1) fromUrl[k] = strings[0];
        else if (strings.length > 1) fromUrl[k] = strings;
      }
    }
    const prev = req.query as Record<string, unknown>;
    const merged = { ...prev, ...fromUrl } as Request['query'];
    (req as Request & { query: Request['query'] }).query = merged;
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
      'Callback OAuth sem parâmetros code/error (nem em req.query nem na URL bruta). ' +
        'Confirma o proxy (ex.: nginx `proxy_pass` com `$request_uri` ou `$is_args$args`) ou inicia o login outra vez.',
    );
  }

  const finish = new Promise<boolean>((resolve) => {
    res.once('finish', () => {
      resolve(res.statusCode >= 300 && res.statusCode < 400);
    });
  });

  return Promise.race([run(), finish]);
}
