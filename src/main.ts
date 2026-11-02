import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port', 5000);
  const apiPrefix = configService.get<string>('app.apiPrefix', 'api');
  const frontendUrl = configService.get<string>('app.frontendUrl', 'http://localhost:5173');

  // Prefix all endpoints with /api
  app.setGlobalPrefix(apiPrefix);

  // Strict payload validation & sanitization
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Cross-Origin Resource Sharing
  app.enableCors({
    origin: [frontendUrl, 'http://localhost:5173', 'http://localhost:4173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Socket-ID'],
  });

  // Enable graceful shutdown hooks (SIGTERM, SIGINT)
  app.enableShutdownHooks();

  await app.listen(port);
  logger.log(`Course Rep V2 Backend running on: http://localhost:${port}/${apiPrefix}`);
}

bootstrap();

