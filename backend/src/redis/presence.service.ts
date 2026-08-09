import type { Redis } from 'ioredis';
import { createLogger } from '@shared/logger';
import {
  BOARD_PRESENCE_KEY,
  BOARD_PRESENCE_TTL,
} from './keys';
import type { ConnectedUserInfo } from '../websocket/protocol/messages';

const logger = createLogger('PresenceService');


export class PresenceService {
  constructor(private readonly redis: Redis) {}

  async addUser(boardId: string, user: ConnectedUserInfo): Promise<void> {
    const key = BOARD_PRESENCE_KEY(boardId);
    try {
      await this.redis
        .multi()
        .hset(key, user.userId, JSON.stringify(user))
        .expire(key, BOARD_PRESENCE_TTL)
        .exec();
    } catch (err) {
      logger.error('PresenceService.addUser failed', {
        boardId,
        userId: user.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async removeUser(boardId: string, userId: string): Promise<void> {
    const key = BOARD_PRESENCE_KEY(boardId);
    try {
      await this.redis.hdel(key, userId);
      // If the room is now empty, clean up the key immediately
      const remaining = await this.redis.hlen(key);
      if (remaining === 0) {
        await this.redis.del(key);
      }
    } catch (err) {
      logger.error('PresenceService.removeUser failed', {
        boardId, userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async getUsers(boardId: string): Promise<ConnectedUserInfo[]> {
    const key = BOARD_PRESENCE_KEY(boardId);
    try {
      const hash = await this.redis.hgetall(key);
      if (!hash) return [];
      return Object.values(hash)
        .map((v) => {
          try { return JSON.parse(v) as ConnectedUserInfo; }
          catch { return null; }
        })
        .filter((u): u is ConnectedUserInfo => u !== null);
    } catch (err) {
      logger.error('PresenceService.getUsers failed', { boardId, error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }


  async refreshPresence(boardId: string): Promise<void> {
    const key = BOARD_PRESENCE_KEY(boardId);
    try {
      await this.redis.expire(key, BOARD_PRESENCE_TTL);
    } catch { /* Non-fatal */ }
  }

  async getUserCount(boardId: string): Promise<number> {
    try {
      return await this.redis.hlen(BOARD_PRESENCE_KEY(boardId));
    } catch {
      return 0;
    }
  }
}
