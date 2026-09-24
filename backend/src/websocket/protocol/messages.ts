import { z } from 'zod';

export const PointSchema = z.object({ x: z.number(), y: z.number() });

export const CanvasDeltaSchema = z.object({
  op: z.enum(['add', 'update', 'delete', 'batch']),
  elementId: z.string().uuid(),
  patch: z.record(z.unknown()).optional(),
  timestamp: z.number(),
});

export type CanvasDelta = z.infer<typeof CanvasDeltaSchema>;



export const DeleteCommentPayloadSchema = z.object({
  boardId: z.string().uuid(),
  commentId: z.string().uuid(),
});

// ── Existing schemas ──────────────────────────────────────────────────────────

export const JoinBoardPayloadSchema = z.object({ boardId: z.string().uuid() });
export const LeaveBoardPayloadSchema = z.object({ boardId: z.string().uuid() });
export const CanvasDeltaPayloadSchema = z.object({
  boardId: z.string().uuid(),
  delta: CanvasDeltaSchema,
});
export const CursorMovePayloadSchema = z.object({
  boardId: z.string().uuid(),
  x: z.number(),
  y: z.number(),
});
export const PingPayloadSchema = z.object({});

const BaseInboundSchema = z.object({
  ackId: z.string().optional(),
  timestamp: z.number().default(() => Date.now()),
});

export const InboundMessageSchema = z.discriminatedUnion('type', [
  BaseInboundSchema.extend({ type: z.literal('join_board'), payload: JoinBoardPayloadSchema }),
  BaseInboundSchema.extend({ type: z.literal('leave_board'), payload: LeaveBoardPayloadSchema }),
  BaseInboundSchema.extend({ type: z.literal('canvas_delta'), payload: CanvasDeltaPayloadSchema }),
  BaseInboundSchema.extend({ type: z.literal('cursor_move'), payload: CursorMovePayloadSchema }),
  BaseInboundSchema.extend({ type: z.literal('ping'), payload: PingPayloadSchema }),
]);

export type InboundMessage = z.infer<typeof InboundMessageSchema>;

// ── Outbound message types ────────────────────────────────────────────────────

export interface ConnectedUserInfo {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  color: string;
  joinedAt: number;
}

export interface BoardJoinedMessage {
  type: 'board_joined';
  payload: { boardId: string; connectedUsers: ConnectedUserInfo[]; serverTime: number };
}

export interface BoardStateMessage {
  type: 'board_state';
  payload: { boardId: string; elements: unknown[] };
}

export interface BoardLeftMessage {
  type: 'board_left';
  payload: { boardId: string };
}

export interface UserJoinedMessage {
  type: 'user_joined';
  payload: ConnectedUserInfo & { boardId: string };
}

export interface UserLeftMessage {
  type: 'user_left';
  payload: { boardId: string; userId: string; displayName: string };
}

export interface CanvasDeltaOutMessage {
  type: 'canvas_delta';
  payload: { boardId: string; delta: CanvasDelta; userId: string; displayName: string };
}

export interface DeltaConflictMessage {
  type: 'delta_conflict';
  payload: { boardId: string; elementId: string; currentElement: unknown };
}

export interface CursorUpdateMessage {
  type: 'cursor_update';
  payload: { boardId: string; userId: string; displayName: string; avatarUrl: string | null; x: number; y: number; color: string };
}

export interface AckMessage {
  type: 'ack';
  payload: { ackId: string; success: boolean; error?: { code: string; message: string } };
}

export interface PongMessage {
  type: 'pong';
  payload: { serverTime: number };
}

export interface WsErrorMessage {
  type: 'error';
  payload: { code: string; message: string };
}

export interface RateLimitedMessage {
  type: 'rate_limited';
  payload: { retryAfterMs: number };
}

export type OutboundMessage =
  | BoardJoinedMessage | BoardStateMessage | BoardLeftMessage
  | UserJoinedMessage | UserLeftMessage
  | CanvasDeltaOutMessage | DeltaConflictMessage | CursorUpdateMessage
  | AckMessage | PongMessage | WsErrorMessage | RateLimitedMessage;

export const buildMessage = <T extends OutboundMessage>(msg: T): string =>
  JSON.stringify(msg);

export const buildAck = (
  ackId: string,
  success: boolean,
  error?: { code: string; message: string },
): string =>
  buildMessage<AckMessage>({ type: 'ack', payload: { ackId, success, error } });

export const buildError = (code: string, message: string): string =>
  buildMessage<WsErrorMessage>({ type: 'error', payload: { code, message } });

export const CURSOR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
] as const;

export const assignCursorColor = (index: number): string =>
  CURSOR_COLORS[index % CURSOR_COLORS.length] ?? '#3b82f6';
