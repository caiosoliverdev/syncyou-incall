import { registerAs } from '@nestjs/config';

/**
 * Variáveis lidas de `.env.development` / `.env.production` (via ConfigModule).
 */
export default registerAs('database', () => ({
  host: process.env.DATABASE_HOST ?? 'localhost',
  port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
  username: process.env.DATABASE_USER ?? '',
  password: process.env.DATABASE_PASSWORD ?? '',
  database: process.env.DATABASE_NAME ?? '',
}));
