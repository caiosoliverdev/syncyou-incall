import { join } from 'path';
import { registerAs } from '@nestjs/config';

/**
 * JWT assinado com RS256. As chaves PEM são geradas em disco na primeira execução
 * (ver `jwt-keys.util.ts`); não usa segredo simétrico em variável de ambiente.
 */
export default registerAs('jwt', () => ({
  keysDir:
    process.env.JWT_KEYS_DIR ?? join(process.cwd(), 'data', 'jwt-keys'),
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  passwordResetExpiresIn:
    process.env.JWT_PASSWORD_RESET_EXPIRES_IN ?? '15m',
  issuer: process.env.JWT_ISSUER ?? 'syncyou',
}));
