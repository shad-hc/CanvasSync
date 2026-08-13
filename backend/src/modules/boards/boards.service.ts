import { createLogger } from '@shared/logger';
import {
  ConflictError,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '@shared/errors';
import type { BoardRepository } from './boards.repository';
import type { BoardPermissionsService } from './boards.permissions';
import type {
  CreateBoardDto,
  UpdateBoardDto,
  ListBoardsQuery,
  UpdateMemberRoleDto,
} from './boards.schemas';
import type {
  BoardSummary,
  BoardDetail,
  PaginatedBoards,
  BoardMemberSummary,
} from './boards.types';

const logger = createLogger('BoardService');



export class BoardService {
  constructor(
    private readonly boardRepo: BoardRepository,
    private readonly permissions: BoardPermissionsService,
  ) {}

  // ── Create ─────────────────────────────────────────────────────────────────

  async createBoard(
    ownerId: string,
    dto: CreateBoardDto,
  ): Promise<BoardDetail> {
    const board = await this.boardRepo.create(ownerId, dto);
    logger.info('Board created', { boardId: board.id, ownerId });

    // Fetch with full detail shape for consistent return type
    const detail = await this.boardRepo.findByIdWithDetails(board.id);
    return this.toDetail(detail!, ownerId);
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  async getBoard(
    boardId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<BoardDetail> {
    await this.permissions.assertCanView(boardId, userId, isAdmin);

    const board = await this.boardRepo.findByIdWithDetails(boardId);
    if (!board) throw new NotFoundError('Board not found', 'BOARD_NOT_FOUND');

    // Track that this user opened this board
    await this.boardRepo.trackRecent(userId, boardId);

    return this.toDetail(board, userId);
  }

  async listBoards(
    userId: string,
    query: ListBoardsQuery,
  ): Promise<PaginatedBoards> {
    const { boards: rawBoards, total } = await this.boardRepo.findManyForUser(
      userId,
      query,
    );

    const boards = (rawBoards).map(
      (b) => this.rawToSummary(b as RawBoard, userId),
    );

    const totalPages = Math.ceil(total / query.limit);

    return {
      boards,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasNextPage: query.page < totalPages,
        hasPrevPage: query.page > 1,
      },
    };
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async updateBoard(
    boardId: string,
    userId: string,
    isAdmin: boolean,
    dto: UpdateBoardDto,
  ): Promise<BoardDetail> {
    await this.permissions.assertCanEdit(boardId, userId, isAdmin);

    const board = await this.boardRepo.update(boardId, dto);
    logger.info('Board updated', { boardId, userId });

    const detail = await this.boardRepo.findByIdWithDetails(board.id);
    return this.toDetail(detail!, userId);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async deleteBoard(
    boardId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<void> {
    await this.permissions.assertCanDelete(boardId, userId, isAdmin);
    await this.boardRepo.delete(boardId);
    logger.info('Board deleted', { boardId, userId });
  }

  // ── Members ────────────────────────────────────────────────────────────────

  async getMembers(
    boardId: string,
    userId: string,
    isAdmin: boolean,
  ): Promise<BoardMemberSummary[]> {
    await this.permissions.assertCanView(boardId, userId, isAdmin);
    const members = await this.boardRepo.findAllMembers(boardId);
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      displayName: m.user.displayName,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    }));
  }

  async updateMemberRole(
    boardId: string,
    requesterId: string,
    isAdmin: boolean,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<BoardMemberSummary> {
    await this.permissions.assertCanManage(boardId, requesterId, isAdmin);

    // Prevent the owner from changing their own role — use transferOwnership instead
    const targetMember = await this.boardRepo.findMember(boardId, targetUserId);
    if (!targetMember) {
      throw new NotFoundError('Member not found', 'MEMBER_NOT_FOUND');
    }
    if (targetMember.role === 'OWNER') {
      throw new BadRequestError(
        'Cannot change the owner\'s role. Transfer ownership first.',
        'CANNOT_CHANGE_OWNER_ROLE',
      );
    }

    const updated = await this.boardRepo.updateMemberRole(
      boardId,
      targetUserId,
      dto.role,
    );
    logger.info('Member role updated', {
      boardId,
      targetUserId,
      role: dto.role,
    });

    return {
      id: updated.id,
      userId: updated.userId,
      displayName: targetMember.userId, // will be overwritten by a join in the real query
      email: '',
      avatarUrl: null,
      role: updated.role,
      joinedAt: updated.joinedAt.toISOString(),
    };
  }

  async removeMember(
    boardId: string,
    requesterId: string,
    isAdmin: boolean,
    targetUserId: string,
  ): Promise<void> {
    await this.permissions.assertCanManage(boardId, requesterId, isAdmin);

    const targetMember = await this.boardRepo.findMember(boardId, targetUserId);
    if (!targetMember) {
      throw new NotFoundError('Member not found', 'MEMBER_NOT_FOUND');
    }
    if (targetMember.role === 'OWNER') {
      throw new BadRequestError(
        'Cannot remove the board owner. Transfer ownership first.',
        'CANNOT_REMOVE_OWNER',
      );
    }

    await this.boardRepo.removeMember(boardId, targetUserId);
    logger.info('Member removed', { boardId, targetUserId, requesterId });
  }

  async leaveBoard(boardId: string, userId: string): Promise<void> {
    const member = await this.boardRepo.findMember(boardId, userId);
    if (!member) {
      throw new NotFoundError('You are not a member of this board', 'NOT_A_MEMBER');
    }
    if (member.role === 'OWNER') {
      throw new BadRequestError(
        'Board owners cannot leave. Transfer ownership or delete the board.',
        'OWNER_CANNOT_LEAVE',
      );
    }
    await this.boardRepo.removeMember(boardId, userId);
    logger.info('User left board', { boardId, userId });
  }


  
  private toDetail(
    raw: NonNullable<Awaited<ReturnType<BoardRepository['findByIdWithDetails']>>>,
    userId: string,
  ): BoardDetail {
    const userMember = raw.members.find((m) => m.userId === userId);
    return {
      id: raw.id,
      title: raw.title,
      description: raw.description,
      thumbnailUrl: raw.thumbnailUrl,
      isPublic: raw.isPublic,
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
      owner: raw.owner,
      memberCount: raw.members.length,
      userRole: userMember?.role ?? 'VIEWER',
      lastOpenedAt: null,
      members: raw.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        displayName: m.user.displayName,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
    };
  }

  private rawToSummary(raw: RawBoard, userId: string): BoardSummary {
    return {
      id: raw.id,
      title: raw.title,
      description: raw.description,
      thumbnailUrl: raw.thumbnailUrl,
      isPublic: raw.isPublic,
      createdAt: raw.createdAt.toISOString(),
      updatedAt: raw.updatedAt.toISOString(),
      owner: raw.owner,
      memberCount: raw._count.members,
      userRole: raw.members[0]?.role ?? 'VIEWER',
      lastOpenedAt: raw.recents[0]?.lastOpenedAt?.toISOString() ?? null,
    };
  }
}

interface RawBoard {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; displayName: string; avatarUrl: string | null };
  members: Array<{ role: import('@prisma/client').MemberRole; userId: string }>;
  recents: Array<{ lastOpenedAt: Date }>;
  _count: { members: number };
}



