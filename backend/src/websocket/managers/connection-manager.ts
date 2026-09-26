import type WebSocket from 'ws';
import { createLogger } from '@shared/logger';
import { buildMessage, buildError, type OutboundMessage, type ConnectedUserInfo } from '../protocol/messages';

const logger = createLogger('ConnectionManager');

/**
 * Connection — wraps a raw WebSocket with typed metadata.
 *
 * Why wrap WebSocket instead of using it directly?
 * - We need to attach userId, boardId, and cursor color to each socket.
 *   The raw WS has no typed metadata slots — we'd need unsafe casting.
 * - The wrapper provides `send(msg)` that serializes OutboundMessage to JSON
 *   and handles the `OPEN` check in one place, so callers never send to
 *   a closed socket.
 * - `isAlive` flag is toggled by the heartbeat manager for dead connection
 *   detection — one flag per connection, owned here.
 */
export interface Connection {
  id: string;           // UUID assigned on upgrade
  socket: WebSocket;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  boardId: string | null;   // null = in lobby (connected but not in a room yet)
  isAlive: boolean;
  connectedAt: number;
  rateLimitTokens: number;
  rateLimitLastRefill: number;
}

/**
 * ConnectionManager — tracks all open WebSocket connections.
 *
 * Responsibilities:
 * - Register / deregister connections as clients connect/disconnect
 * - Send typed messages to individual connections safely
 * - Look up connections by ID or by userId
 * - Provide a snapshot of all connections for the HeartbeatManager
 *
 * NOT responsible for:
 * - Room membership (RoomManager owns that)
 * - Broadcasting to rooms (Broadcaster owns that)
 * - Message routing (MessageDispatcher owns that)
 *
 * Thread safety: Node.js is single-threaded so no locking needed.
 * All operations are synchronous lookups on a Map.
 */
export class ConnectionManager {
  private connections = new Map<string, Connection>();
  private userConnections = new Map<string, Set<string>>(); // userId → Set<connectionId>

  register(connection: Connection): void {
    this.connections.set(connection.id, connection);

    const userConns = this.userConnections.get(connection.userId) ?? new Set();
    userConns.add(connection.id);
    this.userConnections.set(connection.userId, userConns);

    logger.info('Connection registered', {
      connectionId: connection.id,
      userId: connection.userId,
      total: this.connections.size,
    });
  }

  deregister(connectionId: string): Connection | undefined {
    const conn = this.connections.get(connectionId);
    if (!conn) return undefined;

    this.connections.delete(connectionId);

    const userConns = this.userConnections.get(conn.userId);
    if (userConns) {
      userConns.delete(connectionId);
      if (userConns.size === 0) this.userConnections.delete(conn.userId);
    }

    logger.info('Connection deregistered', {
      connectionId,
      userId: conn.userId,
      remaining: this.connections.size,
    });

    return conn;
  }

  get(connectionId: string): Connection | undefined {
    return this.connections.get(connectionId);
  }

  getByUserId(userId: string): Connection[] {
    const ids = this.userConnections.get(userId) ?? new Set();
    return [...ids]
      .map((id) => this.connections.get(id))
      .filter((c): c is Connection => c !== undefined);
  }

  getAll(): Connection[] {
    return [...this.connections.values()];
  }

  count(): number {
    return this.connections.size;
  }

  /**
   * send — type-safe message send to a single connection.
   *
   * Checks socket.readyState === OPEN before sending.
   * Logs and swallows errors — a failed send should never crash the server.
   * The client's reconnection logic will re-request any missed state.
   */
  send(connectionId: string, message: OutboundMessage): boolean {
    const conn = this.connections.get(connectionId);
    if (!conn) return false;

    const { WebSocket: WS } = require('ws') as typeof import('ws');
    if (conn.socket.readyState !== WS.OPEN) return false;

    try {
      conn.socket.send(buildMessage(message));
      return true;
    } catch (err) {
      logger.error('Failed to send message', {
        connectionId,
        userId: conn.userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  sendError(connectionId: string, code: string, message: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;
    const { WebSocket: WS } = require('ws') as typeof import('ws');
    if (conn.socket.readyState !== WS.OPEN) return;
    try {
      conn.socket.send(buildError(code, message));
    } catch { /* ignore */ }
  }

  /** Mark a connection alive (called by heartbeat pong handler) */
  markAlive(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (conn) conn.isAlive = true;
  }

  /** Mark connection as being in a board room */
  setBoard(connectionId: string, boardId: string | null): void {
    const conn = this.connections.get(connectionId);
    if (conn) conn.boardId = boardId;
  }

  getUserInfo(conn: Connection): ConnectedUserInfo {
    return {
      userId: conn.userId,
      displayName: conn.displayName,
      avatarUrl: conn.avatarUrl,
      color: conn.color,
      joinedAt: conn.connectedAt,
    };
  }
}
