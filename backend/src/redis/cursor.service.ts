import type { Redis } from 'ioredis';
import { BOARD_CURSORS_KEY, BOARD_CURSORS_TTL } from './keys';
import { createLogger } from '@shared/logger';

const logger = createLogger('CursorService');

export interface CursorPosition {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  x: number;
  y: number;
  updatedAt: number;
}


 
export class CursorService {
  constructor(private readonly redis: Redis) {}

  async updateCursor(boardId: string, cursor: CursorPosition): Promise<void> {
    const key = BOARD_CURSORS_KEY(boardId);
    try {
      await this.redis
        .multi()
        .hset(key, cursor.userId, JSON.stringify({ ...cursor, updatedAt: Date.now() }))
        .expire(key, BOARD_CURSORS_TTL)
        .exec();
    } catch (err) {
      logger.error('CursorService.updateCursor failed', {
        boardId, userId: cursor.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async getCursors(boardId: string): Promise<CursorPosition[]> {
    const key = BOARD_CURSORS_KEY(boardId);
    try {
      const hash = await this.redis.hgetall(key);
      if (!hash) return [];
      const now = Date.now();
      const staleThreshold = 10_000; // 10s

      return Object.values(hash)
        .map((v) => {
          try { return JSON.parse(v) as CursorPosition; }
          catch { return null; }
        })
        .filter((c): c is CursorPosition =>
          c !== null && now - (c.updatedAt ?? 0) < staleThreshold,
        );
    } catch {
      return [];
    }
  }

  async removeCursor(boardId: string, userId: string): Promise<void> {
    try {
      await this.redis.hdel(BOARD_CURSORS_KEY(boardId), userId);
    } catch { /* Non-fatal */ }
  }
}
