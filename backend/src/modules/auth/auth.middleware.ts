import { Request, Response, NextFunction } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { verifyAccessToken } from '@shared/utils/jwt.util';
import { UnauthorizedError, ForbiddenError } from '@shared/errors';
import type { GlobalRole } from '@shared/types/domain.types';
import type { TokenBlacklist } from './auth.token-blacklist';


export const createRequireAuth = (blacklist: TokenBlacklist) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      next(new UnauthorizedError('No token provided', 'NO_TOKEN'));
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = verifyAccessToken(token);

      // Check Redis blacklist (logout / password change invalidation)
      const jti = (payload as unknown as Record<string, unknown>)['jti'];
      if (typeof jti === 'string') {
        const revoked = await blacklist.isRevoked(jti);
        if (revoked) {
          next(new UnauthorizedError('Token has been revoked', 'TOKEN_REVOKED'));
          return;
        }
      }

      req.user = { id: payload.sub, role: payload.role };
      next();
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        next(new UnauthorizedError('Access token expired', 'TOKEN_EXPIRED'));
        return;
      }
      if (err instanceof JsonWebTokenError) {
        next(new UnauthorizedError('Invalid access token', 'INVALID_TOKEN'));
        return;
      }
      next(err);
    }
  };

export const requireRole =
  (...roles: GlobalRole[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new UnauthorizedError('Not authenticated', 'NOT_AUTHENTICATED'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(
        new ForbiddenError(
          `Access requires one of: ${roles.join(', ')}`,
          'INSUFFICIENT_ROLE',
        ),
      );
      return;
    }

    next();
  };
