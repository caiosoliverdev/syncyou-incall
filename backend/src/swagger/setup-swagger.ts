import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** UI em `/api/swagger`; rotas da API em `/api/v1/*` (prefixo global). */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('SyncYou API')
    .setDescription('API REST')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
        name: 'Authorization',
      },
      'JWT',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-Desktop-Updates-Token',
        description:
          'Token fixo (DESKTOP_UPDATES_PUBLISH_TOKEN). Alternativa: header Authorization com esquema Bearer.',
      },
      'desktop-updates-publish',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    ignoreGlobalPrefix: false,
  });

  SwaggerModule.setup('api/swagger', app, document, {
    useGlobalPrefix: false,
  });
}
