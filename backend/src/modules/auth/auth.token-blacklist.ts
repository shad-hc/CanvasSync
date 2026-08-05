import type { Redis } from 'ioredis';


const KEY_PREFIX = 'blacklist:token:';

export class TokenBlacklist {
  constructor(private readonly redis: Redis) {}

  // Add a token to the blacklist until it expires 
  async revoke(jti: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(`${KEY_PREFIX}${jti}`, '1', 'EX', ttlSeconds);
  }

  // Returns true if the token has been revoked 
  async isRevoked(jti: string): Promise<boolean> {
    const result = await this.redis.get(`${KEY_PREFIX}${jti}`);
    return result !== null;
  }
}
