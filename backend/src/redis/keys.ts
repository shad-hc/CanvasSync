export const BOARD_STATE_KEY = (boardId: string) =>
  `cf:board:${boardId}:state`;
export const BOARD_STATE_TTL = 60 * 60; // 1 hour

export const BOARD_OP_COUNT_KEY = (boardId: string) =>
  `cf:board:${boardId}:op_count`;


export const ROOM_KEY = (boardId: string) =>
  `cf:room:${boardId}:connections`;
export const ROOM_TTL = 24 * 60 * 60; // 24 hours (cleaned up on leave)


export const BOARD_PRESENCE_KEY = (boardId: string) =>
  `cf:board:${boardId}:presence`;
export const BOARD_PRESENCE_TTL = 90; // seconds

// ── Cursor position

export const BOARD_CURSORS_KEY = (boardId: string) =>
  `cf:board:${boardId}:cursors`;
export const BOARD_CURSORS_TTL = 10; // seconds


export const MEMBER_ROLE_KEY = (boardId: string, userId: string) =>
  `cf:board:${boardId}:member:${userId}:role`;
export const MEMBER_ROLE_TTL = 5 * 60; // 5 minutes

// ── User profile cache (avoids DB query on WS connection)
// Value: JSON { displayName, avatarUrl }

export const USER_PROFILE_KEY = (userId: string) =>
  `cf:user:${userId}:profile`;
export const USER_PROFILE_TTL = 15 * 60; // 15 minutes



export const BOARD_PUBSUB_CHANNEL = (boardId: string) =>
  `cf:pubsub:board:${boardId}`;

export const GLOBAL_PUBSUB_CHANNEL = 'cf:pubsub:global';



export const RATE_LIMIT_KEY = (userId: string, window: string) =>
  `cf:rl:${userId}:${window}`;
export const RATE_LIMIT_TTL = 60; // 1 minute window
