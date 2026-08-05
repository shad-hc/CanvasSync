import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { env } from '@config/env';
import type { JwtAccessPayload, JwtRefreshPayload } from '@shared/types/domain.types';


const ACCESS_ALGORITHM = 'HS256' as const;
const REFRESH_ALGORITHM = 'HS256' as const;

// ── Access Token 

export const signAccessToken = (payload: Omit<JwtAccessPayload, 'type'>): string =>
  jwt.sign(
    { ...payload, type: 'access', jti: uuidv4() }, // jti enables per-token blacklisting
    env.JWT_ACCESS_SECRET,
    { algorithm: ACCESS_ALGORITHM, expiresIn : env.JWT_ACCESS_EXPIRES_IN},
  );

export const verifyAccessToken = (token: string): JwtAccessPayload & { jti?: string; exp?: number } => {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: [ACCESS_ALGORITHM],
  });

  if (typeof decoded === 'string' || decoded['type'] !== 'access') {
    throw new jwt.JsonWebTokenError('Invalid access token type');
  }

  return decoded as JwtAccessPayload & { jti?: string; exp?: number };
};

// ── Refresh Token 

export const signRefreshToken = (payload: Omit<JwtRefreshPayload, 'type'>): string =>
  jwt.sign(
    { ...payload, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { algorithm: REFRESH_ALGORITHM, expiresIn: env.JWT_REFRESH_EXPIRES_IN },
  );

export const verifyRefreshToken = (token: string): JwtRefreshPayload => {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET, {
    algorithms: [REFRESH_ALGORITHM],
  });

  if (typeof decoded === 'string' || decoded['type'] !== 'refresh') {
    throw new jwt.JsonWebTokenError('Invalid refresh token type');
  }

  return decoded as JwtRefreshPayload;
};

export const decodeToken = (token: string): jwt.JwtPayload | null => {
  const decoded = jwt.decode(token);
  return typeof decoded === 'object' ? decoded : null;
};
