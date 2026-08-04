import morgan, { StreamOptions } from 'morgan';
import { Request, Response } from 'express';
import { logger } from '@shared/logger';

/**
 * Pipes Morgan's HTTP access logs into Winston so all logs go through
 * a single structured pipeline — critical for log aggregation in production.
 *
 * We use a custom token to include the request ID on every access log line,
 * so you can filter all logs related to a single HTTP request in one query.
 */
const stream: StreamOptions = {
  write: (message) => logger.http(message.trim()),
};

morgan.token('request-id', (req: Request) => req.requestId ?? '-');
morgan.token('body', (req: Request) => {
  // Never log request bodies in production — may contain sensitive data
  if (process.env['NODE_ENV'] === 'production') return '';
  return JSON.stringify(req.body);
});

const format =
  ':request-id :method :url :status :res[content-length] - :response-time ms';

export const httpLoggerMiddleware = morgan(format, { stream });
