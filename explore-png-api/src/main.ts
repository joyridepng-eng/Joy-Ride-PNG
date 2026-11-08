import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { createApiSecurityHeadersMiddleware } from './common/security/security-headers';

type LogLevel = 'error' | 'warn' | 'log' | 'debug' | 'verbose';

function buildLoggerLevels(configuredLevel: LogLevel): LogLevel[] {
  const levels: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

  return levels.slice(0, levels.indexOf(configuredLevel) + 1);
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false;
  }

  const [first, second] = parts;

  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isAllowedDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    const isLocalHost =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1';

    const isLanHost = isPrivateIpv4(url.hostname);

    const port = Number(url.port);

    const isExpoDevelopmentPort =
      Number.isInteger(port) && port >= 8081 && port <= 8099;

    return (isLocalHost || isLanHost) && isExpoDevelopmentPort;
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  const host = config.getOrThrow<string>('HOST');
  const port = config.getOrThrow<number>('PORT');
  const nodeEnv = config.getOrThrow<string>('NODE_ENV');

  if (nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(createApiSecurityHeadersMiddleware(nodeEnv));

  const corsOrigins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const configuredLogLevel = config.getOrThrow<LogLevel>('LOG_LEVEL');

  app.useLogger(
    buildLoggerLevels(
      nodeEnv === 'production' ? configuredLogLevel : 'verbose',
    ),
  );

  app.enableCors({
    origin: (origin, callback) => {
      // Native mobile clients and server-to-server requests may not send Origin.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      if (nodeEnv !== 'production' && isAllowedDevelopmentOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS`), false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Driver-Id'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(port, host);
}

void bootstrap();
