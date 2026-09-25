import { createLogger } from '@shared/logger';
import type { ConnectionManager } from './connection-manager.ts';

const logger = createLogger('HeartbeatManager');

/**
 * HeartbeatManager — detects and terminates dead WebSocket connections.
 *
 * Problem: TCP connections can appear open at the socket level but be
 * silently dead — the client machine lost power, the network dropped, or
 * a proxy timed out the connection. The server has no way to know without
 * actively probing.
 *
 * Solution: WebSocket ping/pong at the protocol level.
 * Every INTERVAL ms, the server sends a WS `ping` frame to every connection.
 * If the client's `pong` response doesn't arrive before the next interval,
 * the connection is terminated and the server cleans it up.
 *
 * Implementation:
 * - `isAlive` flag starts true on each connection.
 * - Before sending each ping, we check `isAlive`. If false (no pong since
 *   last ping), we terminate the socket.
 * - We set `isAlive = false` after sending the ping.
 * - The `pong` event handler (in MessageDispatcher) calls
 *   `connectionManager.markAlive(connId)` which sets `isAlive = true`.
 *
 * Why not application-level ping/pong (our custom `ping` message)?
 * - WS protocol-level ping/pong works even if the client's JS is frozen
 *   or the tab is backgrounded. Application-level messages require the
 *   JS event loop to be running.
 * - We implement BOTH: protocol-level for dead connection detection,
 *   application-level for latency measurement on the client side.
 */

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
