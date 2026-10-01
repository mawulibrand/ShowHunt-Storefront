import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { RequestMethod } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { Request, Response, NextFunction } from 'express';
import { parseEnvironment } from '@showhunt/validation';
import { AppModule } from './app.module.js';
const env = parseEnvironment(process.env);
const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
app.use((req: Request, res: Response, next: NextFunction) => {
  const supplied = req.header('X-Request-ID');
  const requestId = supplied && /^[a-zA-Z0-9_-]{1,64}$/.test(supplied) ? supplied : randomUUID();
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('Cache-Control', 'no-store');
  const started = performance.now();
  res.on('finish', () => console.log(JSON.stringify({ level: 'info', event: 'http_request', requestId, method: req.method, status: res.statusCode, durationMs: Math.round(performance.now() - started) })));
  next();
});
app.setGlobalPrefix('api/v1', { exclude: [{ path: 'health/live', method: RequestMethod.GET }, { path: 'health/ready', method: RequestMethod.GET }] });
if (env.mode !== 'production') {
  const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('ShowHunt API').setVersion('1').build());
  SwaggerModule.setup('api/v1/docs', app, document);
}
if (process.env.VERCEL !== '1') app.enableShutdownHooks();
await app.listen(env.port, '0.0.0.0');
