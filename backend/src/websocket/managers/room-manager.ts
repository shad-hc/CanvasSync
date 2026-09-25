import { createLogger } from '@shared/logger';
import type { ConnectionManager } from './connection-manager.ts';
import type { PubSubSubscriber } from '../../redis/pubsub-subscriber.ts';

const logger = createLogger('RoomManager');

export class RoomManager {
  private rooms = new Map<string, Set<string>>();

  constructor(
    private readonly connManager: ConnectionManager,
    private readonly pubsubSubscriber: PubSubSubscriber | null = null,
  ) {}

  join(boardId: string, connectionId: string): void {
    const room = this.rooms.get(boardId) ?? new Set();
    room.add(connectionId);
    this.rooms.set(boardId, room);
    this.connManager.setBoard(connectionId, boardId);

    // Subscribe to Redis Pub/Sub channel for cross-instance messages
    if (this.pubsubSubscriber) {
      void this.pubsubSubscriber.subscribeToBoard(boardId);
    }

    logger.debug('Connection joined room', {
      boardId, connectionId, roomSize: room.size,
    });
  }

  leave(boardId: string, connectionId: string): void {
    const room = this.rooms.get(boardId);
    if (!room) return;

    room.delete(connectionId);
    this.connManager.setBoard(connectionId, null);

    if (room.size === 0) {
      this.rooms.delete(boardId);
      // Unsubscribe from Redis channel — no local connections remain
      if (this.pubsubSubscriber) {
        void this.pubsubSubscriber.unsubscribeFromBoard(boardId);
      }
      logger.debug('Room empty — unsubscribed from channel', { boardId });
    } else {
      logger.debug('Connection left room', {
        boardId, connectionId, roomSize: room.size,
      });
    }
  }

  leaveAll(connectionId: string): string[] {
    const leftBoards: string[] = [];
    for (const [boardId, room] of this.rooms) {
      if (room.has(connectionId)) {
        this.leave(boardId, connectionId);
        leftBoards.push(boardId);
      }
    }
    return leftBoards;
  }

  getConnectionIds(boardId: string): string[] {
    return [...(this.rooms.get(boardId) ?? [])];
  }

  getRoomSize(boardId: string): number {
    return this.rooms.get(boardId)?.size ?? 0;
  }

  isInRoom(boardId: string, connectionId: string): boolean {
    return this.rooms.get(boardId)?.has(connectionId) ?? false;
  }

  getActiveBoards(): string[] {
    return [...this.rooms.keys()];
  }

  getStats(): { activeRooms: number; totalConnections: number } {
    let total = 0;
    for (const room of this.rooms.values()) total += room.size;
    return { activeRooms: this.rooms.size, totalConnections: total };
  }
}
