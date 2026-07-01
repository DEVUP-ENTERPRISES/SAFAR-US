import pino from 'pino';
import { config } from '../../config';

/**
 * Structured JSON logger. In dev we pretty-print; in prod we emit JSON
 * for the log aggregator. Sensitive fields are redacted centrally.
 */
export const logger = pino({
  level: config.isProd ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'password',
      'passwordHash',
      'token',
      'refreshToken',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
  transport: config.isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      },
});
