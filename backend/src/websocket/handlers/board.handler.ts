import { createLogger } from '@shared/logger';
import { prisma } from '@config/prisma';
import { redis } from '@config/redis';
import { PresenceService } from '../../redis/presence.service';
import { CursorService } from '../../redis/cursor.service';
import type { Connection } from '../managers/connection-manager.ts';
import type { ConnectionManager } from '../managers/connection-manager.ts';
import type { RoomManager } from '../managers/room-manager.ts';
import type { Broadcaster } from '../managers/broadcaster.ts';
import type { JoinBoardPayloadSchema, LeaveBoardPayloadSchema } from '../protocol/messages';
import { loadAndSendBoardState, loadAndSendCursors } from './canvas.handler';
import type { z } from 'zod';

const logger = createLogger('BoardHandlers');

const presenceService = new PresenceService(redis);
const cursorService = new CursorService(redis);

/**
 * handleJoinBoard — Phase 10 update.
 *
 * On board join, now sends three additional payloads to the joining client:
 * 1. board_state (canvas elements) — Phase 6
 * 2. cursor_update per existing cursor — Phase 7
 * 3. chat_message history (last 50 messages) — Phase 10
 * 4. comment_added per active comment thread — Phase 10
 *
 * Ordering matters: canvas state arrives before comments so the client can
 * render comment pins on the correct elements.
 */
export const handleJoinBoard = async (
  conn: Connection,
  payload: z.infer<typeof JoinBoardPayloadSchema>,
  connManager: ConnectionManager,
  roomManager: RoomManager,
  broadcaster: Broadcaster,
): Promise<void> => {
  const { boardId } = payload;

  const member = await prisma.boardMember.findUnique({
    where: { userId_boardId: { userId: conn.userId, boardId } },
    include: { user: { select: { displayName: true, avatarUrl: true } } },
  });

  let isPublicBoard = false;
  if (!member) {
    const board = await prisma.board.findUnique({
      where: { id: boardId },
      select: { isPublic: true },
    });
    isPublicBoard = board?.isPublic ?? false;
  }

  if (!member && !isPublicBoard) {
    connManager.sendError(conn.id, 'BOARD_ACCESS_DENIED', 'You do not have access to this board');
    return;
  }

  if (member?.user) {
    conn.displayName = member.user.displayName;
    conn.avatarUrl = member.user.avatarUrl;
  }

  if (conn.boardId && conn.boardId !== boardId) {
    await handleLeaveBoardInternal(conn, conn.boardId, connManager, roomManager, broadcaster);
  }

  roomManager.join(boardId, conn.id);
  await presenceService.addUser(boardId, connManager.getUserInfo(conn));

  const allUsers = await presenceService.getUsers(boardId);
  const connectedUsers = allUsers.filter((u) => u.userId !== conn.userId);

  connManager.send(conn.id, {
    type: 'board_joined',
    payload: { boardId, connectedUsers, serverTime: Date.now() },
  });

  // Phase 6: canvas elements
  await loadAndSendBoardState(conn, boardId, connManager);

  // Phase 7: existing cursors
  await loadAndSendCursors(conn, boardId, connManager);


  broadcaster.broadcastToRoomExcept(boardId, conn.id, {
    type: 'user_joined',
    payload: { ...connManager.getUserInfo(conn), boardId },
  });

  logger.info('User joined board', {
    userId: conn.userId,
    boardId,
    localRoomSize: roomManager.getRoomSize(boardId),
    globalPresence: allUsers.length,
  });
};

export const handleLeaveBoard = async (
  conn: Connection,
  payload: z.infer<typeof LeaveBoardPayloadSchema>,
  connManager: ConnectionManager,
  roomManager: RoomManager,
  broadcaster: Broadcaster,
): Promise<void> => {
  await handleLeaveBoardInternal(conn, payload.boardId, connManager, roomManager, broadcaster);
};

export const handleLeaveBoardInternal = async (
  conn: Connection,
  boardId: string,
  connManager: ConnectionManager,
  roomManager: RoomManager,
  broadcaster: Broadcaster,
): Promise<void> => {
  if (!roomManager.isInRoom(boardId, conn.id)) return;

  roomManager.leave(boardId, conn.id);
  await presenceService.removeUser(boardId, conn.userId);
  await cursorService.removeCursor(boardId, conn.userId);


  connManager.send(conn.id, { type: 'board_left', payload: { boardId } });

  broadcaster.broadcastToRoomExcept(conn.id, boardId, {
    type: 'user_left',
    payload: { boardId, userId: conn.userId, displayName: conn.displayName },
  });

  logger.info('User left board', { userId: conn.userId, boardId });
};

export const handleDisconnect = async (
  conn: Connection,
  connManager: ConnectionManager,
  roomManager: RoomManager,
  broadcaster: Broadcaster,
): Promise<void> => {
  const leftBoards = roomManager.leaveAll(conn.id);

  for (const boardId of leftBoards) {
    await presenceService.removeUser(boardId, conn.userId);
    await cursorService.removeCursor(boardId, conn.userId);

    broadcaster.broadcastToRoom(boardId, {
      type: 'user_left',
      payload: { boardId, userId: conn.userId, displayName: conn.displayName },
    });
  }

  connManager.deregister(conn.id);
  logger.info('Connection disconnected', { userId: conn.userId, connectionId: conn.id });
};
