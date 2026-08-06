import { Router } from 'express';
import { prisma } from '@config/prisma';
import { redis } from '@config/redis';
import { validate } from '@shared/middleware';
import { authRateLimiter } from '../../redis/http-rate-limiter';
import { AuthRepository } from './auth.repository';
import { TokenBlacklist } from './auth.token-blacklist';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { createRequireAuth } from './auth.middleware';
import {
  registerSchema, loginSchema, refreshSchema, logoutSchema,
} from './auth.schemas';

const router = Router();

const authRepo = new AuthRepository(prisma);
const tokenBlacklist = new TokenBlacklist(redis);
const authService = new AuthService(authRepo, tokenBlacklist);
const authController = new AuthController(authService);
const requireAuth = createRequireAuth(tokenBlacklist);

// Phase 7: apply strict rate limiting to auth endpoints (brute-force protection)
router.post('/register', authRateLimiter, validate(registerSchema), authController.register);
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);
router.post('/refresh', authRateLimiter, validate(refreshSchema), authController.refresh);
router.post('/logout', validate(logoutSchema), authController.logout);
router.get('/me', requireAuth, authController.me);

export { router as authRouter };
export { createRequireAuth, requireRole } from './auth.middleware';
export { tokenBlacklist };
