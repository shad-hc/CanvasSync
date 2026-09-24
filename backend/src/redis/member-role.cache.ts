import type { Redis } from 'ioredis';
import type { MemberRole } from '@prisma/client';
import { prisma } from '@config/prisma';
import { MEMBER_ROLE_KEY, MEMBER_ROLE_TTL } from './keys';
import { createLogger } from '@shared/logger';

const logger = createLogger('MemberRoleCache');

/**
 * MemberRoleCache — caches board member roles in Redis.
 *
 * Problem: Phase 6 queries Postgres on EVERY canvas delta to check if the
 * sender has EDITOR or OWNER role. At 60fps per active user, that's
 * 60 DB queries/second per user — completely unsustainable at scale.
 *
 * Solution: cache the role in Redis with a 5-minute TTL.
 *
 * Cache-aside pattern (lazy loading):
 * 1. Check Redis for the role.
 * 2. If found → return immediately (O(1), sub-millisecond).
 * 3. If miss  → query Postgres, write to Redis, return.
 *
 * Invalidation:
 * When a member's role is changed (BoardService.updateMemberRole), we
 * call invalidate() to delete the Redis key. The next delta from that
 * user triggers a fresh DB fetch.
 *
 * Security:
 * 5-minute TTL means a removed member can still send deltas for up to
 * 5 minutes after removal. This is an acceptable trade-off for most
 * collaborative tools — the data is non-destructive (canvas deltas) and
 * the window is short. For financial or security-critical data, use a
 * shorter TTL or pub/sub invalidation.
 */
export class MemberRoleCache {
  constructor(private readonly redis: Redis) {}

  async getRole(boardId: string, userId: string): Promise<MemberRole | null> {
    const key = MEMBER_ROLE_KEY(boardId, userId);

    try {
      // L1: Redis cache
      const cached = await this.redis.get(key);
      if (cached) {
        return cached as MemberRole;
      }

      // L2: Postgres
      const member = await prisma.boardMember.findUnique({
        where: { userId_boardId: { userId, boardId } },
        select: { role: true },
      });

      if (!member) {
        // Cache negative result to avoid repeated DB misses
        await this.redis.set(key, 'NONE', 'EX', MEMBER_ROLE_TTL);
        return null;
      }

      await this.redis.set(key, member.role, 'EX', MEMBER_ROLE_TTL);
      return member.role;
    } catch (err) {
      logger.error('MemberRoleCache.getRole failed — falling back to DB', {
        boardId, userId,
        error: err instanceof Error ? err.message : String(err),
      });
      // On Redis failure, fall through to DB directly (no caching)
      try {
        const member = await prisma.boardMember.findUnique({
          where: { userId_boardId: { userId, boardId } },
          select: { role: true },
        });
        return member?.role ?? null;
      } catch {
        return null;
      }
    }
  }

  /** Invalidate when role changes — called by BoardService.updateMemberRole */
  async invalidate(boardId: string, userId: string): Promise<void> {
    try {
      await this.redis.del(MEMBER_ROLE_KEY(boardId, userId));
    } catch { /* Non-fatal */ }
  }

  /** Invalidate all role caches for a board (e.g. board deleted) */
  async invalidateBoard(boardId: string): Promise<void> {
    try {
      const pattern = `cf:board:${boardId}:member:*:role`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch { /* Non-fatal */ }
  }
}
