import { PrismaClient, User, RefreshToken } from '@prisma/client';


export class AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  // ── User operations 

  async findUserByEmail(email: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { email } });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { id } });
  }

  async createUser(data: {
    email: string;
    displayName: string;
    passwordHash: string;
  }): Promise<User> {
    return this.db.user.create({ data });
  }

  // ── Refresh token operations

  async createRefreshToken(data: {
    tokenHash: string;
    family: string;
    userId: string;
    expiresAt: Date;
  }): Promise<RefreshToken> {
    return this.db.refreshToken.create({ data });
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.db.refreshToken.findUnique({ where: { tokenHash } });
  }

  async findRefreshTokenById(id: string): Promise<RefreshToken | null> {
    return this.db.refreshToken.findUnique({ where: { id } });
  }

 
  async rotateRefreshToken(
    oldTokenId: string,
    newToken: {
      tokenHash: string;
      family: string;
      userId: string;
      expiresAt: Date;
    },
  ): Promise<RefreshToken> {
    return this.db.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: oldTokenId },
        data: { isRevoked: true, lastUsedAt: new Date() },
      });
      return tx.refreshToken.create({ data: newToken });
    });
  }

  /** Revoke a single token (logout from one device) */
  async revokeRefreshToken(id: string): Promise<void> {
    await this.db.refreshToken.update({
      where: { id },
      data: { isRevoked: true },
    });
  }


  async revokeTokenFamily(family: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { family },
      data: { isRevoked: true },
    });
  }

  //Revoke all refresh tokens for a user (logout everywhere / password change) 
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { userId },
      data: { isRevoked: true },
    });
  }

  // Cleanup job helper — remove expired tokens to keep the table lean 
  async deleteExpiredTokens(): Promise<number> {
    const result = await this.db.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}
