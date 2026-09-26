import type { Connection } from '../managers/connection-manager';
import type { ConnectionManager } from '../managers/connection-manager';

/**
 * handlePing — responds to application-level ping messages.
 *
 * Two ping systems exist side-by-side:
 *
 * 1. WS protocol-level ping/pong (HeartbeatManager)
 *    - Server → Client: WS PING frame
 *    - Client → Server: WS PONG frame (automatic, handled by ws library)
 *    - Purpose: detect dead TCP connections
 *
 * 2. Application-level ping/pong (this handler)
 *    - Client → Server: { type: 'ping', payload: {} }
 *    - Server → Client: { type: 'pong', payload: { serverTime } }
 *    - Purpose: measure round-trip latency on the client side
 *      The client can display "connected · 42ms" in the UI.
 *
 * Both systems are needed because:
 * - Protocol ping works even when JS is frozen; tells the server the connection is alive
 * - Application ping can be initiated by the client; tells the client its latency
 */
export const handlePing = (
  conn: Connection,
  connManager: ConnectionManager,
): void => {
  connManager.send(conn.id, {
    type: 'pong',
    payload: { serverTime: Date.now() },
  });
};
