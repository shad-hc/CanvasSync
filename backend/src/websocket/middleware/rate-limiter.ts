import type { Connection } from '../managers/connection-manager.ts';
import type { ConnectionManager } from '../managers/connection-manager.ts';
import { createLogger } from '@shared/logger';

const logger = createLogger('WsRateLimiter');

const BUCKET_CAPACITY = 30;
const REFILL_RATE = 10;

const MESSAGE_COSTS: Record<string, number> = {
  canvas_delta:   1,
  cursor_move:    0.1,
  join_board:     5,
  leave_board:    1,
  ping:           0,
};

export class WsRateLimiter {
  constructor(private readonly connManager: ConnectionManager) {}

  check(conn: Connection, messageType: string): boolean {
    const cost = MESSAGE_COSTS[messageType] ?? 1;
    if (cost === 0) return true;

    const now = Date.now();
    const elapsed = (now - conn.rateLimitLastRefill) / 1000;
    conn.rateLimitTokens = Math.min(BUCKET_CAPACITY, conn.rateLimitTokens + elapsed * REFILL_RATE);
    conn.rateLimitLastRefill = now;

    if (conn.rateLimitTokens < cost) {
      const retryAfterMs = Math.ceil(((cost - conn.rateLimitTokens) / REFILL_RATE) * 1000);
      logger.warn('Rate limit exceeded', { connectionId: conn.id, userId: conn.userId, messageType });
      this.connManager.send(conn.id, { type: 'rate_limited', payload: { retryAfterMs } });
      return false;
    }

    conn.rateLimitTokens -= cost;
    return true;
  }

  static initConnection(conn: Connection): void {
    conn.rateLimitTokens = BUCKET_CAPACITY;
    conn.rateLimitLastRefill = Date.now();
  }
}
