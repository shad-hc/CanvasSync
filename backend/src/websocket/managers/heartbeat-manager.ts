import { createLogger } from '@shared/logger';
import type { ConnectionManager } from './connection-manager.ts';

const logger = createLogger('HeartbeatManager');

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds
const PING_TIMEOUT_MS = 10_000;       // Client must pong within 10s

export class HeartbeatManager {
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(private readonly connManager: ConnectionManager) {}

  start(): void {
    if (this.intervalHandle) return;

    this.intervalHandle = setInterval(() => {
      this.tick();
    }, HEARTBEAT_INTERVAL_MS);

    logger.info('HeartbeatManager started', {
      intervalMs: HEARTBEAT_INTERVAL_MS,
      timeoutMs: PING_TIMEOUT_MS,
    });
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      logger.info('HeartbeatManager stopped');
    }
  }

  private tick(): void {
    const connections = this.connManager.getAll();
    let terminated = 0;

    for (const conn of connections) {
      if (!conn.isAlive) {
        // No pong received since last ping — terminate
        logger.warn('Terminating unresponsive connection', {
          connectionId: conn.id,
          userId: conn.userId,
        });
        conn.socket.terminate();
        terminated++;
        continue;
      }

      // Mark as not alive — will be reset to true when pong arrives
      conn.isAlive = false;

      try {
        conn.socket.ping();
      } catch (err) {
        logger.error('Failed to send ping', {
          connectionId: conn.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (terminated > 0) {
      logger.info('Heartbeat tick complete', {
        checked: connections.length,
        terminated,
        alive: connections.length - terminated,
      });
    }
  }
}
