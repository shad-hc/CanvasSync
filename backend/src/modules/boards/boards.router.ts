import { Router } from 'express';
import { prisma } from '@config/prisma';
import { redis } from '@config/redis';
import { validate } from '@shared/middleware';
import { TokenBlacklist } from '@modules/auth/auth.token-blacklist';
import { createRequireAuth } from '@modules/auth/auth.middleware';
import { BoardRepository } from './boards.repository';
import { BoardPermissionsService } from './boards.permissions';
import { BoardService } from './boards.service';
import { BoardController } from './boards.controller';
import {
  createBoardSchema,
  updateBoardSchema,
  listBoardsQuerySchema,
  boardIdParamSchema,
  memberIdParamSchema,

  updateMemberRoleSchema,
} from './boards.schemas';


export const router = Router();

const tokenBlacklist = new TokenBlacklist(redis);
const requireAuth = createRequireAuth(tokenBlacklist);

const boardRepo = new BoardRepository(prisma);
const permissions = new BoardPermissionsService(boardRepo);
const boardService = new BoardService(boardRepo, permissions);
const ctrl = new BoardController(boardService);


router.use(requireAuth);

router.post(
  '/',
  validate(createBoardSchema),
  ctrl.createBoard,
);

router.get(
  '/',
  validate(listBoardsQuerySchema, 'query'),
  ctrl.listBoards,
);

router.get(
  '/:boardId',
  validate(boardIdParamSchema, 'params'),
  ctrl.getBoard,
);

router.patch(
  '/:boardId',
  validate(boardIdParamSchema, 'params'),
  validate(updateBoardSchema),
  ctrl.updateBoard,
);

router.delete(
  '/:boardId',
  validate(boardIdParamSchema, 'params'),
  ctrl.deleteBoard,
);


router.get(
  '/:boardId/members',
  validate(boardIdParamSchema, 'params'),
  ctrl.getMembers,
);

router.patch(
  '/:boardId/members/:memberId',
  validate(memberIdParamSchema, 'params'),
  validate(updateMemberRoleSchema),
  ctrl.updateMemberRole,
);

router.delete(
  '/:boardId/members/:memberId',
  validate(memberIdParamSchema, 'params'),
  ctrl.removeMember,
);

router.delete(
  '/:boardId/leave',
  validate(boardIdParamSchema, 'params'),
  ctrl.leaveBoard,
);

export {router as boardsRouter};
