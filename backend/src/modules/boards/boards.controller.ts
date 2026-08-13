import { Request, Response } from 'express';
import { asyncHandler } from '@shared/middleware';
import { successResponse } from '@shared/types/api.types';
import type { BoardService } from './boards.service';
import type {
  CreateBoardDto,
  UpdateBoardDto,
  ListBoardsQuery,
  UpdateMemberRoleDto,
} from './boards.schemas';

/**
 * BoardController — HTTP concerns only.
 *
 * Pattern followed from Phase 2's AuthController:
 * - Extract typed DTOs from req (already validated by middleware)
 * - Call service method
 * - Return standardised response envelope
 *
 * `req.user!` is safe here because all routes are guarded by requireAuth
 * middleware applied at the router level before any controller method runs.
 *
 * isAdmin is derived from `req.user.role` so platform admins bypass board
 * permission checks without needing a separate code path.
 */
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  // ── Boards ─────────────────────────────────────────────────────────────────

  createBoard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const dto = req.body as CreateBoardDto;
    const board = await this.boardService.createBoard(userId, dto);
    res.status(201).json(successResponse(board));
  });

  listBoards = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const query = req.query as unknown as ListBoardsQuery;
    const result = await this.boardService.listBoards(userId, query);
    res.status(200).json(successResponse(result.boards, { pagination: result.pagination }));
  });

  getBoard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'ADMIN';
    const { boardId } = req.params as { boardId: string };
    const board = await this.boardService.getBoard(boardId, userId, isAdmin);
    res.status(200).json(successResponse(board));
  });

  updateBoard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'ADMIN';
    const { boardId } = req.params as { boardId: string };
    const dto = req.body as UpdateBoardDto;
    const board = await this.boardService.updateBoard(boardId, userId, isAdmin, dto);
    res.status(200).json(successResponse(board));
  });

  deleteBoard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'ADMIN';
    const { boardId } = req.params as { boardId: string };
    await this.boardService.deleteBoard(boardId, userId, isAdmin);
    res.status(204).send();
  });

  // ── Members ────────────────────────────────────────────────────────────────

  getMembers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const isAdmin = req.user!.role === 'ADMIN';
    const { boardId } = req.params as { boardId: string };
    const members = await this.boardService.getMembers(boardId, userId, isAdmin);
    res.status(200).json(successResponse(members));
  });

  updateMemberRole = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const requesterId = req.user!.id;
    const isAdmin = req.user!.role === 'ADMIN';
    const { boardId, memberId } = req.params as {
      boardId: string;
      memberId: string;
    };
    const dto = req.body as UpdateMemberRoleDto;
    const member = await this.boardService.updateMemberRole(
      boardId,
      requesterId,
      isAdmin,
      memberId,
      dto,
    );
    res.status(200).json(successResponse(member));
  });

  removeMember = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const requesterId = req.user!.id;
    const isAdmin = req.user!.role === 'ADMIN';
    const { boardId, memberId } = req.params as {
      boardId: string;
      memberId: string;
    };
    await this.boardService.removeMember(boardId, requesterId, isAdmin, memberId);
    res.status(204).send();
  });

  leaveBoard = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.id;
    const { boardId } = req.params as { boardId: string };
    await this.boardService.leaveBoard(boardId, userId);
    res.status(204).send();
  });

}
  