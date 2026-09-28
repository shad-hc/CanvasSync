import { createLogger } from '@shared/logger';
import { InboundMessageSchema, buildAck } from './protocol/messages';
import { handleJoinBoard, handleLeaveBoard } from './handlers/board.handler';
import { handleCanvasDelta, handleCursorMove } from './handlers/canvas.handler';
import { handlePing } from './handlers/ping.handler';
import { WsRateLimiter } from './middleware/rate-limiter';
import type { Connection } from './managers/connection-manager.ts';
import type { ConnectionManager } from './managers/connection-manager.ts';
import type { RoomManager } from './managers/room-manager.ts';
import type { Broadcaster } from './managers/broadcaster.ts';

const logger = createLogger('MessageDispatcher');

export class MessageDispatcher {
  private rateLimiter: WsRateLimiter;

  constructor(
    private readonly connManager: ConnectionManager,
    private readonly roomManager: RoomManager,
    private readonly broadcaster: Broadcaster,
  ) {
    this.rateLimiter = new WsRateLimiter(connManager);
  }

  async dispatch(conn: Connection, rawData: Buffer | ArrayBuffer | Buffer[]): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawData.toString());
    } catch {
      this.connManager.sendError(conn.id, 'INVALID_JSON', 'Message must be valid JSON');
      return;
    }

    const rawType = typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)['type']
      : undefined;
    const messageType = typeof rawType === 'string' ? rawType : 'unknown';

    if (!this.rateLimiter.check(conn, messageType)) return;

    const result = InboundMessageSchema.safeParse(parsed);
    if (!result.success) {
      const firstError = result.error.errors[0];
      this.connManager.sendError(conn.id, 'INVALID_MESSAGE', firstError?.message ?? 'Invalid message format');
      return;
    }

    const message = result.data;
    const ackId = message.ackId;

    try {
      switch (message.type) {
        case 'join_board':
          await handleJoinBoard(conn, message.payload, this.connManager, this.roomManager, this.broadcaster);
          break;
        case 'leave_board':
          await handleLeaveBoard(conn, message.payload, this.connManager, this.roomManager, this.broadcaster);
          break;
        case 'canvas_delta':
          await handleCanvasDelta(conn, message.payload, this.connManager, this.roomManager, this.broadcaster);
          break;
        case 'cursor_move':
          await handleCursorMove(conn, message.payload, this.connManager, this.roomManager, this.broadcaster);
          break;
        case 'ping':
          handlePing(conn, this.connManager);
          break;
        default: {
          const _exhaustive = message;
          void _exhaustive;
        }
      }

      if (ackId) {
        const { WebSocket: WS } = await import('ws');
        if (conn.socket.readyState === WS.OPEN) {
          conn.socket.send(buildAck(ackId, true));
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Internal server error';
      logger.error('Handler error', { messageType: message.type, userId: conn.userId, error: errorMessage });

      if (ackId) {
        const { WebSocket: WS } = await import('ws');
        if (conn.socket.readyState === WS.OPEN) {
          conn.socket.send(buildAck(ackId, false, { code: 'HANDLER_ERROR', message: errorMessage }));
        }
      } else {
        this.connManager.sendError(conn.id, 'HANDLER_ERROR', errorMessage);
      }
    }
  }
}
