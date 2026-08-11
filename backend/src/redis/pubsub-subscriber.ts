import type { Redis } from 'ioredis';
import { createLogger } from '@shared/logger';
import { BOARD_PUBSUB_CHANNEL } from './keys';
import type { ConnectionManager } from '../websocket/managers/connection-manager';
import type { RoomManager } from '../websocket/managers/room-manager';
import type { PubSubEnvelope } from './pubsub-publisher';

const logger = createLogger('PubSubSubscriber');


export class PubSubSubscriber {
  private subscriber: Redis;
  private subscribedChannels = new Set<string>();

  constructor(
    private readonly redisClient: Redis,
    private readonly connManager: ConnectionManager,
    private readonly roomManager: RoomManager,
    private readonly instanceId: string,
  ) {
    // Duplicate creates a new connection in subscribe-only mode
    this.subscriber = redisClient.duplicate();
    this.subscriber.on('error', (err) => {
      logger.error('PubSub subscriber error', { error: err.message });
    });
    this.subscriber.on('message', (channel: string, rawMessage: string) => {
      this.handleMessage(channel, rawMessage);
    });
  }

  
  async subscribeToBoard(boardId: string): Promise<void> {
    const channel = BOARD_PUBSUB_CHANNEL(boardId);
    if (this.subscribedChannels.has(channel)) return; // return if alreeady subscribed

    try {
      await this.subscriber.subscribe(channel);
      this.subscribedChannels.add(channel);
      logger.debug('Subscribed to board channel', { boardId, channel });
    } catch (err) {
      logger.error('Failed to subscribe to board channel', {
        boardId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Unsubscribe when no local connections are in the room 
  async unsubscribeFromBoard(boardId: string): Promise<void> {
    const channel = BOARD_PUBSUB_CHANNEL(boardId);
    if (!this.subscribedChannels.has(channel)) return;

    
    const localConnCount = this.roomManager.getRoomSize(boardId);
    if (localConnCount > 0) return;// Only unsubscribe if no local connections remain in this room

    try {
      await this.subscriber.unsubscribe(channel);
      this.subscribedChannels.delete(channel);
      logger.debug('Unsubscribed from board channel', { boardId });
    } catch (err) {
      logger.error('Failed to unsubscribe from board channel', {
        boardId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private handleMessage(channel: string, rawMessage: string): void {
    let envelope: PubSubEnvelope;
    try {
      envelope = JSON.parse(rawMessage) as PubSubEnvelope;
    } catch {
      logger.warn('PubSub: failed to parse message', { channel });
      return;
    }

    // Skip messages published by this same instance (already handled locally)
    if (envelope.sourceInstanceId === this.instanceId) return;

    const { boardId, message, excludeConnectionId } = envelope;

    // Fan out to local connections in this room
    const localConnectionIds = this.roomManager.getConnectionIds(boardId);

    let sent = 0;
    for (const connId of localConnectionIds) {
      if (connId === excludeConnectionId) continue;
      if (this.connManager.send(connId, message)) sent++;
    }

    if (sent > 0) {
      logger.debug('PubSub fan-out complete', {
        boardId,
        messageType: message.type,
        instanceId: this.instanceId,
        sent,
      });
    }
  }

  async shutdown(): Promise<void> {
    try {
      if (this.subscribedChannels.size > 0) {
        await this.subscriber.unsubscribe(...this.subscribedChannels);
      }
      this.subscriber.disconnect();
      logger.info('PubSub subscriber disconnected');
    } catch { /* Best-effort on shutdown */ }
  }
}
