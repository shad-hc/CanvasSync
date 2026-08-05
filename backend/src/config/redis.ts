import Redis from 'ioredis';
import { env } from './env';
import { logger } from '@shared/logger';


const createRedisClient = (name: string): Redis => {
  const client = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    retryStrategy: (times) => Math.min(times * 100, 30_000),
    enableOfflineQueue: true,
    lazyConnect: false,
    // Connection name shows in Redis CLIENT LIST — useful for debugging
    connectionName: `canvasflow-${name}`,
  });

  client.on('connect', () => logger.info(`Redis [${name}] connected`));
  client.on('ready', () => logger.info(`Redis [${name}] ready`));
  client.on('error', (err: Error) =>
    logger.error(`Redis [${name}] error`, { message: err.message }),
  );
  client.on('reconnecting', (delay: number) =>
    logger.warn(`Redis [${name}] reconnecting`, { delay }),
  );
  client.on('close', () => logger.warn(`Redis [${name}] connection closed`));

  return client;
};
// main redis client
export const redis = createRedisClient('main');



