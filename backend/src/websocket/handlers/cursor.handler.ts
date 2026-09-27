import type { Connection } from '../managers/connection-manager';
import type { ConnectionManager } from '../managers/connection-manager';
import type { RoomManager } from '../managers/room-manager';
import type { Broadcaster } from '../managers/broadcaster';
import type { CursorMovePayloadSchema } from '../protocol/messages';
import type { z } from 'zod';

/**
 * handleCursorMove — broadcasts a user's cursor position to room members.
 *
 * Cursor updates are the highest-frequency message type — a fast typist or
 * active drawer can send 60+ per second. Design decisions to keep this cheap:
 *
 * 1. Rate limited at 0.1 tokens (10x cheaper than canvas_delta) so we
 *    allow high frequency without starving other message types.
 *
 * 2. NO persistence — cursor positions are purely ephemeral. We never write
 *    to Postgres. Phase 7 will store current cursor in Redis with a short TTL
 *    so users joining mid-session see existing cursors immediately.
 *
 * 3. broadcastToRoomExcept — the sender doesn't need to see their own cursor.
 *    Sending it back would be wasted bandwidth.
 *
 * 4. No DB lookup — cursor moves don't need auth re-check. If the connection
 *    is registered and in the room, we trust it. The join_board handler
 *    already verified membership.
 */
export const handleCursorMove = (
  conn: Connection,
  payload: z.infer<typeof CursorMovePayloadSchema>,
  connManager: ConnectionManager,
  roomManager: RoomManager,
  broadcaster: Broadcaster,
): void => {
  const { boardId, x, y } = payload;

  if (!roomManager.isInRoom(boardId, conn.id)) return;

  broadcaster.broadcastToRoomExcept(boardId, conn.id, {
    type: 'cursor_update',
    payload: {
      boardId,
      userId: conn.userId,
      displayName: conn.displayName,
      avatarUrl: conn.avatarUrl,
      x,
      y,
      color: conn.color,
    },
  });
};
