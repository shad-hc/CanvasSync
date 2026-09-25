import { createLogger } from '@shared/logger';
import type { OutboundMessage } from '../protocol/messages';
import type { ConnectionManager } from './connection-manager.ts';
import type { RoomManager } from './room-manager.ts';
import type { PubSubPublisher } from '../../redis/pubsub-publisher';

const logger = createLogger('Broadcaster');


export class Broadcaster {
  constructor(
    private readonly connManager: ConnectionManager,
    private readonly roomManager: RoomManager,
    private readonly pubsub: PubSubPublisher | null = null,
  ) {}

  broadcastToRoom(boardId: string, message: OutboundMessage): number {
    const connectionIds = this.roomManager.getConnectionIds(boardId);
    let sent = 0;

    for (const connId of connectionIds) {
      if (this.connManager.send(connId, message)) sent++;
    }

    // Cross-instance broadcast (no excludeConnectionId — send to all)
    if (this.pubsub) {
      void this.pubsub.publishToBoard(boardId, message, null);
    }

    logger.debug('Broadcast to room', {
      boardId, messageType: message.type, targets: connectionIds.length, sent,
    });

    return sent;
  }

  
  broadcastToRoomExcept(
    boardId: string,
    exceptConnectionId: string,
    message: OutboundMessage,
  ): number {
    const connectionIds = this.roomManager
      .getConnectionIds(boardId)
      .filter((id) => id !== exceptConnectionId);

    let sent = 0;
    for (const connId of connectionIds) {
      if (this.connManager.send(connId, message)) sent++;
    }

    // Cross-instance broadcast with sender exclusion
    if (this.pubsub) {
      void this.pubsub.publishToBoard(boardId, message, exceptConnectionId);
    }

    logger.debug('Broadcast to room (excluding sender)', {
      boardId, messageType: message.type, targets: connectionIds.length, sent,
    });

    return sent;
  }

 
  sendToUser(userId: string, message: OutboundMessage): number {
    const connections = this.connManager.getByUserId(userId);
    let sent = 0;
    for (const conn of connections) {
      if (this.connManager.send(conn.id, message)) sent++;
    }
    return sent;
  }
}
