import type { ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Passport OAuth: ao redirecionar para o IdP, `strategy.redirect` faz `res.end()` sem
 * invocar o callback do `authenticate`, logo a Promise do AuthGuard do Nest nunca
 * resolve e o cliente pode ficar à espera indefinidamente.
 * No primeiro passo (sem `code`/`error` na query), fazemos race com `res.finish`.
 */
export async function raceOAuthRedirectGuard(
  context: ExecutionContext,
  run: () => Promise<boolean>,
): Promise<boolean> {
  const req = context.switchToHttp().getRequest<Request>();
  const res = context.switchToHttp().getResponse<Response>();

  const isCallbackLeg =
    typeof req.query?.code === 'string' ||
    typeof req.query?.error === 'string';

  if (isCallbackLeg) {
    return run();
  }

  const finish = new Promise<boolean>((resolve) => {
    res.once('finish', () => {
      resolve(res.statusCode >= 300 && res.statusCode < 400);
    });
  });

  return Promise.race([run(), finish]);
}
