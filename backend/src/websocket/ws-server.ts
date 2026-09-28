import { WebSocketServer as Wss, WebSocket } from 'ws';
import type { Server } from 'http';
import type { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@shared/logger';
import { authenticateWsUpgrade } from './middleware/ws-auth';
import { ConnectionManager } from './managers/connection-manager';
import { RoomManager } from './managers/room-manager';
import { Broadcaster } from './managers/broadcaster';
import { HeartbeatManager } from './managers/heartbeat-manager';
import { MessageDispatcher } from './message-dispatcher';
import { WsRateLimiter } from './middleware/rate-limiter';
import { handleDisconnect } from './handlers/board.handler';
import { assignCursorColor } from './protocol/messages';
import { PubSubPublisher } from '../redis/pubsub-publisher';
import { PubSubSubscriber } from '../redis/pubsub-subscriber';
import { UserProfileCache } from '../redis/user-profile.cache';

const logger = createLogger('WebSocketServer');

export class CanvasFlowWsServer {
  private wss: Wss;
  private connManager: ConnectionManager;
  private roomManager: RoomManager;
  private broadcaster: Broadcaster;
  private heartbeat: HeartbeatManager;
  private dispatcher: MessageDispatcher;
  private pubsubSubscriber: PubSubSubscriber;
  private userProfileCache: UserProfileCache;
  private colorIndex = 0;
  private readonly instanceId: string;

  constructor(private readonly redis: Redis) {
    this.instanceId = uuidv4();
    this.wss = new Wss({ noServer: true });

    this.connManager = new ConnectionManager();
    this.userProfileCache = new UserProfileCache(redis);

    const pubsubPublisher = new PubSubPublisher(redis, this.instanceId);
    this.pubsubSubscriber = new PubSubSubscriber(
      redis,
      this.connManager,
      // roomManager not yet created — injected below
      null as never,
      this.instanceId,
    );

    this.roomManager = new RoomManager(this.connManager, this.pubsubSubscriber);

    // Inject roomManager into subscriber (circular dependency resolved via setter)
    (this.pubsubSubscriber as { roomManager: RoomManager }).roomManager = this.roomManager;

    this.broadcaster = new Broadcaster(this.connManager, this.roomManager, pubsubPublisher);
    this.heartbeat = new HeartbeatManager(this.connManager);
    this.dispatcher = new MessageDispatcher(this.connManager, this.roomManager, this.broadcaster);

    logger.info('CanvasFlowWsServer created', { instanceId: this.instanceId });
  }

  attach(httpServer: Server): void {
    httpServer.on('upgrade', async (req, socket, head) => {
      const url = new URL(req.url ?? '', `http://${req.headers.host}`);
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }

      const authResult = await authenticateWsUpgrade(req, this.redis);
      if (!authResult) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // Phase 7: resolve real displayName from cache
      const profile = await this.userProfileCache.getProfile(authResult.userId);
      const enrichedAuth = {
        ...authResult,
        displayName: profile?.displayName ?? `User-${authResult.userId.slice(0, 8)}`,
        avatarUrl: profile?.avatarUrl ?? null,
      };

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req, enrichedAuth);
      });
    });

    this.wss.on(
      'connection',
      (
        ws: WebSocket,
        _req: unknown,
        auth: { userId: string; role: string; displayName: string; avatarUrl: string | null },
      ) => {
        this.onConnection(ws, auth);
      },
    );

    this.heartbeat.start();
    logger.info('WebSocket server attached', {
      path: '/ws',
      instanceId: this.instanceId,
    });
  }

  private onConnection(
    ws: WebSocket,
    auth: { userId: string; role: string; displayName: string; avatarUrl: string | null },
  ): void {
    const connectionId = uuidv4();
    const color = assignCursorColor(this.colorIndex++);

    const conn = {
      id: connectionId,
      socket: ws,
      userId: auth.userId,
      displayName: auth.displayName,
      avatarUrl: auth.avatarUrl,
      color,
      boardId: null,
      isAlive: true,
      connectedAt: Date.now(),
      rateLimitTokens: 30,
      rateLimitLastRefill: Date.now(),
    };

    WsRateLimiter.initConnection(conn);
    this.connManager.register(conn);

    logger.info('WebSocket connected', {
      connectionId, userId: auth.userId,
      total: this.connManager.count(),
      instanceId: this.instanceId,
    });

    ws.on('message', (data) => { void this.dispatcher.dispatch(conn, data as Buffer); });
    ws.on('pong', () => { this.connManager.markAlive(connectionId); });
    ws.on('close', (code, reason) => {
      logger.info('WebSocket closed', { connectionId, userId: auth.userId, code, reason: reason.toString() });
      void handleDisconnect(conn, this.connManager, this.roomManager, this.broadcaster);
    });
    ws.on('error', (err) => {
      logger.error('WebSocket error', { connectionId, userId: auth.userId, error: err.message });
    });
  }

  shutdown(): void {
    this.heartbeat.stop();
    void this.pubsubSubscriber.shutdown();
    for (const conn of this.connManager.getAll()) {
      conn.socket.close(1001, 'Server shutting down');
    }
    this.wss.close();
    logger.info('WebSocket server shut down', { instanceId: this.instanceId });
  }

  getStats() {
    return {
      instanceId: this.instanceId,
      connections: this.connManager.count(),
      ...this.roomManager.getStats(),
    };
  }
}
