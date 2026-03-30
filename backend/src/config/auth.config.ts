import { registerAs } from '@nestjs/config';

/**
 * `AUTH_DEBUG_SKIP_EMAIL_VERIFICATION=true`: registo ativa a conta de imediato (sem email).
 * Usar só em desenvolvimento; nunca em produção.
 */
export default registerAs('auth', () => ({
  debugSkipEmailVerification:
    process.env.AUTH_DEBUG_SKIP_EMAIL_VERIFICATION === 'true',
}));
