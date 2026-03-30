import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.getOrThrow<{
          host: string;
          port: number;
          username: string;
          password: string;
          database: string;
        }>('database');
        /**
         * `synchronize`: o TypeORM cria/altera tabelas conforme as entidades ao arrancar.
         * - Ativo em `NODE_ENV=development` (padrão local).
         * - Em produção/staging pode ativar com `DATABASE_SYNCHRONIZE=true` se não usar migrations
         *   (evite em bases com dados críticos: alterações podem ser destrutivas).
         */
        const syncFromEnv =
          process.env.DATABASE_SYNCHRONIZE === 'true' ||
          process.env.DATABASE_SYNCHRONIZE === '1';
        const synchronize =
          process.env.NODE_ENV === 'development' || syncFromEnv;

        return {
          type: 'postgres' as const,
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          autoLoadEntities: true,
          synchronize,
          /** Arranque / reconexão após falha transitória. */
          retryAttempts: 5,
          retryDelay: 2000,
          /**
           * Opções do pool `pg`: reduzem ECONNRESET quando o servidor fecha ligações idle
           * ou há reset de rede — TCP keep-alive + reciclar clientes inativos a tempo.
           */
          extra: {
            max: 20,
            idleTimeoutMillis: 25_000,
            connectionTimeoutMillis: 15_000,
            keepAlive: true,
            keepAliveInitialDelayMillis: 10_000,
          },
        };
      },
    }),
  ],
})
export class DatabaseModule {}
