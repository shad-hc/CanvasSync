import type { Redis } from 'ioredis';
import { createLogger } from '@shared/logger';
import { BOARD_PUBSUB_CHANNEL } from './keys';
import type { OutboundMessage } from '../websocket/protocol/messages';

const logger = createLogger('PubSubPublisher');


export interface PubSubEnvelope {
  type: 'broadcast';
  sourceInstanceId: string;
  excludeConnectionId: string | null;
  boardId: string;
  message: OutboundMessage;
}

export class PubSubPublisher {
  constructor(
    private readonly redis: Redis,
    private readonly instanceId: string,
  ) {}


  async publishToBoard(
    boardId: string,
    message: OutboundMessage,
    excludeConnectionId: string | null = null,
  ): Promise<void> {
    const envelope: PubSubEnvelope = {
      type: 'broadcast',
      sourceInstanceId: this.instanceId,
      excludeConnectionId,
      boardId,
      message,
    };

    try {
      await this.redis.publish(
        BOARD_PUBSUB_CHANNEL(boardId),
        JSON.stringify(envelope),
      );
    } catch (err) {
      logger.error('PubSubPublisher.publishToBoard failed', {
        boardId,
        messageType: message.type,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
