import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { loadEnvFile } from '@hireflow/shared/node';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { ConfigService } from './config/config.service.js';

loadEnvFile();

const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
configureApp(app);
await app.listen(app.get(ConfigService).env.PORT);
// Tells the start script the API is answering, so it can start the worker without slowing this.
process.send?.('ready');
