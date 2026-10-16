import 'reflect-metadata';
import compress from '@fastify/compress';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';

/**
 * L'app configurée, sans `listen()`. Partagée entre le serveur local (`main.ts`) et la
 * fonction Vercel (`/api/index.js`), qui n'écoute aucun port : elle reçoit les requêtes.
 */
export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  // Fastify ne compresse rien par défaut : le catalogue de sorts passe de 200 à 31 Ko.
  await app.register(compress, { encodings: ['gzip', 'deflate'], threshold: 1024 });
  app.setGlobalPrefix('api');
  return app;
}
