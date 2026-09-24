import type { Redis } from 'ioredis';
import { prisma } from '@config/prisma';
import { USER_PROFILE_KEY, USER_PROFILE_TTL } from './keys';
import { createLogger } from '@shared/logger';

const logger = createLogger('UserProfileCache');

export interface UserProfile {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * UserProfileCache — caches user display info in Redis.
 *
 * Called on WS upgrade (authenticateWsUpgrade) to resolve a JWT userId
 * into a displayName + avatarUrl without a DB query on every connection.
 *
 * Cache-aside with 15-minute TTL. Invalidated when the user updates
 * their profile (Phase 10+ user settings endpoint).
 *
 * Phase 5 used a placeholder displayName from the JWT sub. This cache
 * replaces that with real user data on the first connection, then serves
 * subsequent connections from Redis.
 */
export class UserProfileCache {
  constructor(private readonly redis: Redis) {}

  async getProfile(userId: string): Promise<UserProfile | null> {
    const key = USER_PROFILE_KEY(userId);

    try {
      const cached = await this.redis.get(key);
      if (cached) {
        return JSON.parse(cached) as UserProfile;
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, displayName: true, avatarUrl: true },
      });

      if (!user) return null;

      const profile: UserProfile = {
        userId: user.id,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      };

      await this.redis.set(key, JSON.stringify(profile), 'EX', USER_PROFILE_TTL);
      return profile;
    } catch (err) {
      logger.error('UserProfileCache.getProfile failed', {
        userId, error: err instanceof Error ? err.message : String(err),
      });
      // Fallback to DB
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, displayName: true, avatarUrl: true },
        });
        return user ? { userId: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl } : null;
      } catch {
        return null;
      }
    }
  }

  async invalidate(userId: string): Promise<void> {
    try {
      await this.redis.del(USER_PROFILE_KEY(userId));
    } catch { /* Non-fatal */ }
  }
}
