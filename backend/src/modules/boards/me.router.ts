import { Router } from 'express';
import { prisma } from '@config/prisma';
import { redis } from '@config/redis';
import { validate} from '@shared/middleware';
import { TokenBlacklist } from '@modules/auth/auth.token-blacklist';
import {createRequireAuth } from '@modules/auth/auth.middleware';
import { BoardRepository } from '@modules/boards/boards.repository';
import { BoardPermissionsService } from '@modules/boards/boards.permissions';
import {BoardService } from '@modules/boards/boards.service';
import { BoardController } from '@modules/boards/boards.controller';


const router = Router();

const tokenBlacklist = new TokenBlacklist(redis);
const requireAuth = createRequireAuth(tokenBlacklist);

const boardRepo = new BoardRepository(prisma);
const permissions = new BoardPermissionsService(boardRepo);
const boardService = new BoardService(boardRepo, permissions);
const ctrl = new BoardController(boardService);

router.use(requireAuth);

export { router as meRouter };
