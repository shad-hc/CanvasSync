export type GlobalRole = 'ADMIN' | 'USER';
export type MemberRole = 'OWNER' | 'EDITOR' | 'VIEWER';


export interface JwtAccessPayload {
  sub: string;       // User UUID
  role: GlobalRole;
  type: 'access';
}

export interface JwtRefreshPayload {
  sub: string;       // User UUID
  family: string;    // Token family UUID for rotation tracking
  tokenId: string;   // RefreshToken record UUID
  type: 'refresh';
}

export interface AuthenticatedUser {
  id: string;
  role: GlobalRole;
}
