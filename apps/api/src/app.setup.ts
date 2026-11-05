import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ConfigService } from './config/config.service.js';

export function configureApp(app: NestExpressApplication): void {
  const { env } = app.get(ConfigService);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.enableShutdownHooks();
}
