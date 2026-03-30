import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Pasta `out/` do Next (`output: "export"`). Em produção o `process.cwd()` pode ser
 * só `backend/`, raiz do deploy, ou outro — tentamos vários candidatos.
 */
export function resolveFrontendStaticRoot(): string {
  const env = process.env.FRONTEND_STATIC_DIR?.trim();
  if (env) {
    return env.startsWith('/') ? env : join(process.cwd(), env);
  }
  const cwd = process.cwd();
  const candidates = [
    join(cwd, '..', 'frontend', 'out'),
    join(cwd, 'frontend', 'out'),
    join(cwd, '..', '..', 'frontend', 'out'),
    join(cwd, 'out'),
  ];
  const hasCallback = (root: string) =>
    existsSync(join(root, 'oauth', 'callback.html'));

  for (const c of candidates) {
    if (hasCallback(c)) return c;
  }
  return candidates[0];
}
