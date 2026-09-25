import type { IncomingMessage } from 'http';
import { verifyAccessToken } from '@shared/utils/jwt.util';
import { TokenBlacklist } from '@modules/auth/auth.token-blacklist';
import { createLogger } from '@shared/logger';
import type { Redis } from 'ioredis';

const logger = createLogger('WsAuth');

export interface WsAuthResult {
  userId: string;
  role: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * authenticateWsUpgrade — Phase 7 update.
 *
 * Now returns only userId + role from the JWT (as before).
 * The WS server enriches this with real displayName/avatarUrl
 * from UserProfileCache AFTER auth succeeds, keeping auth concerns
 * cleanly separated from profile concerns.
 */
export const authenticateWsUpgrade = async (
  req: IncomingMessage,
  redis: Redis,
): Promise<WsAuthResult | null> => {
  try {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      logger.warn('WS upgrade rejected: no token');
      return null;
    }

    const payload = verifyAccessToken(token);

    const blacklist = new TokenBlacklist(redis);
    const jti = (payload as Record<string, unknown>)['jti'];
    if (typeof jti === 'string') {
      const revoked = await blacklist.isRevoked(jti);
      if (revoked) {
        logger.warn('WS upgrade rejected: token revoked', { userId: payload.sub });
        return null;
      }
    }

    // Return minimal auth result — WS server enriches with profile cache
    return {
      userId: payload.sub,
      role: payload.role,
      displayName: '', // will be replaced by UserProfileCache in ws-server
      avatarUrl: null,
    };
  } catch (err) {
    logger.warn('WS upgrade rejected: invalid token', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
};
