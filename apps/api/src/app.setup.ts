import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ConfigService } from './config/config.service.js';

export function configureApp(app: NestExpressApplication): void {
  const { env } = app.get(ConfigService);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1');
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.use(helmet());
  // The API reads no cookies. Sign-in sends a bearer token, so no cross-site cookies are allowed.
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: false });
  app.enableShutdownHooks();
}
