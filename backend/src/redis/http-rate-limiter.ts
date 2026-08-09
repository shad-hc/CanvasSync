import { Request, Response, NextFunction } from 'express';
import { redis } from '@config/redis';
import { RATE_LIMIT_KEY, RATE_LIMIT_TTL } from './keys';
import { createLogger } from '@shared/logger';

const logger = createLogger('HttpRateLimiter');


interface RateLimitOptions {
  limit?: number;
  windowSeconds?: number;
  keyPrefix?: string;
}

export const httpRateLimiter = (opts: RateLimitOptions = {}) => {
  const { limit = 100, windowSeconds = 60, keyPrefix = 'http' } = opts;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Use userId if authenticated, IP otherwise
    const identifier = req.user?.id ?? req.ip ?? 'unknown';
    const window = Math.floor(Date.now() / (windowSeconds * 1000));
    const key = RATE_LIMIT_KEY(`${keyPrefix}:${identifier}`, String(window));

    try {
      const pipeline = redis.multi();
      pipeline.incr(key);
      pipeline.expire(key, windowSeconds);
      const results = await pipeline.exec();

      const count = results?.[0]?.[1] as number ?? 0;

      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - count));
      res.setHeader('X-RateLimit-Reset', (window + 1) * windowSeconds);

      if (count > limit) {
        logger.warn('HTTP rate limit exceeded', { identifier, count, limit, key });
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: `Too many requests. Limit: ${limit} per ${windowSeconds}s.`,
          },
        });
        return;
      }

      next();
    } catch (err) {
      // Redis failure → allow request through (fail open for availability)
      logger.error('Rate limiter Redis error — failing open', {
        error: err instanceof Error ? err.message : String(err),
      });
      next();
    }
  };
};

/** Strict rate limiter for auth endpoints (prevent brute force) */
export const authRateLimiter = httpRateLimiter({
  limit: 20,
  windowSeconds: 60,
  keyPrefix: 'auth',
});


export const apiRateLimiter = httpRateLimiter({
  limit: 100,
  windowSeconds: 60,
  keyPrefix: 'api',
});
