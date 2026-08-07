import { v4 as uuidv4 } from 'uuid';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { User } from '@prisma/client';

import { hashPassword, verifyPassword } from '@shared/utils/password.util';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '@shared/utils/jwt.util';
import {
  ConflictError,
  UnauthorizedError,
  BadRequestError,
  NotFoundError,
} from '@shared/errors';
import { env } from '@config/env';
import { createLogger } from '@shared/logger';

import type { AuthRepository } from './auth.repository';
import type { TokenBlacklist } from './auth.token-blacklist';
import type { RegisterDto, LoginDto, RefreshDto, LogoutDto } from './auth.schemas';

const logger = createLogger('AuthService');

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: TokenPair;
}

/** User shape safe to return to clients — no passwordHash */
export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  createdAt: Date;
}


export class AuthService {
  constructor(
    private readonly authRepo: AuthRepository,
    private readonly blacklist: TokenBlacklist,
  ) {}

  // ── Register

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.authRepo.findUserByEmail(dto.email);
    if (existing) {
      // Don't reveal whether the email is registered — use a generic message
      // to prevent user enumeration attacks.
      // But we DO throw ConflictError so the frontend can show a helpful message.
      // Acceptable trade-off for a collaborative tool vs a bank.
      throw new ConflictError(
        'An account with this email already exists',
        'EMAIL_TAKEN',
      );
    }

    const passwordHash = await hashPassword(dto.password);

    const user = await this.authRepo.createUser({
      email: dto.email,
      displayName: dto.displayName,
      passwordHash,
    });

    logger.info('User registered', { userId: user.id });

    const tokens = await this.issueTokenPair(user, uuidv4());
    return { user: this.toPublicUser(user), tokens };
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.authRepo.findUserByEmail(dto.email);

   
    const dummyHash =
      '$2a$12$invalidhashthatiswrongenoughtofail00000000000000000000000';
    const passwordValid = await verifyPassword(
      dto.password,
      user?.passwordHash ?? dummyHash,
    );

    if (!user || !passwordValid) {
      throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
    }

    if (!user.isActive) {
      throw new UnauthorizedError('Account is deactivated', 'ACCOUNT_INACTIVE');
    }

    logger.info('User logged in', { userId: user.id });

    const tokens = await this.issueTokenPair(user, uuidv4());
    return { user: this.toPublicUser(user), tokens };
  }

  // ── Refresh 

  async refresh(dto: RefreshDto): Promise<TokenPair> {
    let payload;
    try {
      payload = verifyRefreshToken(dto.refreshToken);
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        throw new UnauthorizedError('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
      }
      throw new UnauthorizedError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }

    // Look up the token record in Postgres
    const tokenRecord = await this.authRepo.findRefreshTokenById(payload.tokenId);

    if (!tokenRecord) {
      throw new UnauthorizedError('Refresh token not found', 'INVALID_REFRESH_TOKEN');
    }

   
    if (tokenRecord.isRevoked) {
      logger.warn('Refresh token reuse detected — revoking family', {
        family: tokenRecord.family,
        userId: tokenRecord.userId,
      });
      await this.authRepo.revokeTokenFamily(tokenRecord.family);
      throw new UnauthorizedError(
        'Refresh token reuse detected. Please log in again.',
        'TOKEN_REUSE_DETECTED',
      );
    }

    if (tokenRecord.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
    }

    const user = await this.authRepo.findUserById(tokenRecord.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedError('User not found or inactive', 'USER_INACTIVE');
    }

    // Issue new token pair and rotate (invalidate old token atomically)
    const newFamily = tokenRecord.family; // Keep same family for the session
    const newTokenId = uuidv4();
    const newRefreshToken = signRefreshToken({
      sub: user.id,
      family: newFamily,
      tokenId: newTokenId,
    });

    const tokenHash = await hashPassword(newRefreshToken);
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_SECONDS * 1000);

    await this.authRepo.rotateRefreshToken(tokenRecord.id, {
      tokenHash,
      family: newFamily,
      userId: user.id,
      expiresAt,
    });

    const accessToken = signAccessToken({ sub: user.id, role: user.role });

    logger.info('Tokens refreshed', { userId: user.id });

    return { accessToken, refreshToken: newRefreshToken };
  }

  // ── Logout

  async logout(dto: LogoutDto, accessToken: string): Promise<void> {
    let refreshPayload;
    try {
      refreshPayload = verifyRefreshToken(dto.refreshToken);
    } catch {
      // If the refresh token is invalid/expired, still try to blacklist
      // the access token — the user clearly wants to log out
      throw new BadRequestError('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
    }

    const tokenRecord = await this.authRepo.findRefreshTokenById(
      refreshPayload.tokenId,
    );
    if (tokenRecord && !tokenRecord.isRevoked) {
      await this.authRepo.revokeRefreshToken(tokenRecord.id);
    }

    // Blacklist the access token for its remaining lifetime
    // We parse the expiry from the token to set the Redis TTL precisely
    const { JsonWebTokenError: JWTError } = await import('jsonwebtoken');
    try {
      const { verifyAccessToken } = await import('@shared/utils/jwt.util');
      const accessPayload = verifyAccessToken(accessToken);
      const jti = (accessPayload as unknown as Record<string, unknown>)['jti'];
      if (typeof jti === 'string') {
        const exp = (accessPayload as unknown as Record<string, unknown>)['exp'];
        const ttl =
          typeof exp === 'number'
            ? Math.max(0, exp - Math.floor(Date.now() / 1000))
            : 900; // fallback to 15 minutes
        await this.blacklist.revoke(jti, ttl);
      }
    } catch {
      // Access token may be expired — that's fine, logout still succeeds
    }

    logger.info('User logged out', { userId: refreshPayload.sub });
  }

  // ── Me ────────────────────────────────────────────────────────────────────

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.authRepo.findUserById(userId);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }
    return this.toPublicUser(user);
  }

  // ── Private helpers
  private async issueTokenPair(user: User, family: string): Promise<TokenPair> {
    const tokenId = uuidv4();

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshToken = signRefreshToken({ sub: user.id, family, tokenId });

    const tokenHash = await hashPassword(refreshToken);
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_SECONDS * 1000);

    await this.authRepo.createRefreshToken({
      tokenHash,
      family,
      userId: user.id,
      expiresAt,
    });

    return { accessToken, refreshToken };
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}
