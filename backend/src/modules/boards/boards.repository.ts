import { PrismaClient, Board, BoardMember, BoardInvite, MemberRole, InviteStatus } from '@prisma/client';
import type { CreateBoardDto, UpdateBoardDto, ListBoardsQuery } from './boards.schemas';


export class BoardRepository {
  constructor(private readonly db: PrismaClient) {}


  async create(ownerId: string, dto: CreateBoardDto): Promise<Board> {
    return this.db.$transaction(async (tx) => {
      const board = await tx.board.create({
        data: {
          title: dto.title,
          isPublic: dto.isPublic,
          ownerId,
        },
      });

      await tx.boardMember.create({
        data: { boardId: board.id, userId: ownerId, role: 'OWNER' },
      });

      return board;
    });
  }

  async findById(boardId: string): Promise<Board | null> {
    return this.db.board.findUnique({ where: { id: boardId } });
  }

  async findByIdWithDetails(boardId: string) {
    return this.db.board.findUnique({
      where: { id: boardId },
      include: {
        owner: { select: { id: true, displayName: true, avatarUrl: true } },
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        _count: {
          select: {
            invites: { where: { status: 'PENDING' } },
          },
        },
      },
    });
  }

  async update(boardId: string, dto: UpdateBoardDto): Promise<Board> {
    return this.db.board.update({
      where: { id: boardId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
      },
    });
  }

  async delete(boardId: string): Promise<void> {
    await this.db.board.delete({ where: { id: boardId } });
  }
 
  async findManyForUser(
  userId: string,
  query: ListBoardsQuery,
): Promise<{ boards: unknown[]; total: number }> {
  const { search, page, limit, filter } = query;
  const skip = (page - 1) * limit;

  const membershipFilter = (() => {
    switch (filter) {
      case 'owned':
        return { ownerId: userId };

      case 'shared':
        return {
          ownerId: { not: userId },
          members: { some: { userId } },
        };

      case 'recent':
        return { recents: { some: { userId } } };

      default:
        return { members: { some: { userId } } };
    }
  })();

  const searchFilter = search
    ? { title: { contains: search, mode: 'insensitive' as const } }
    : {};

  const where = { ...membershipFilter, ...searchFilter };

  const [boards, total] = await Promise.all([
    this.db.board.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        owner: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        members: {
          where: { userId },
          select: { role: true },
        },
        recents: {
          where: { userId },
          select: { lastOpenedAt: true },
        },
        _count: {
          select: { members: true },
        },
      },
    }),

    this.db.board.count({ where }),
  ]);

  return { boards, total };
}

  async findMember(boardId: string, userId: string): Promise<BoardMember | null> {
    return this.db.boardMember.findUnique({
      where: { userId_boardId: { userId, boardId } },
    });
  }

  async findAllMembers(boardId: string) {
    return this.db.boardMember.findMany({
      where: { boardId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async updateMemberRole(
    boardId: string,
    userId: string,
    role: MemberRole,
  ): Promise<BoardMember> {
    return this.db.boardMember.update({
      where: { userId_boardId: { userId, boardId } },
      data: { role },
    });
  }

  async removeMember(boardId: string, userId: string): Promise<void> {
    await this.db.boardMember.delete({
      where: { userId_boardId: { userId, boardId } },
    });
  }

  async addMember(
    boardId: string,
    userId: string,
    role: MemberRole,
  ): Promise<BoardMember> {
    return this.db.boardMember.create({
      data: { boardId, userId, role },
    });
  }

  async trackRecent(userId: string, boardId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      await tx.recentBoard.upsert({
        where: { userId_boardId: { userId, boardId } },
        create: { userId, boardId },
        update: { lastOpenedAt: new Date() },
      });

      // Enforce cap of 20 recent boards per user
      const count = await tx.recentBoard.count({ where: { userId } });
      if (count > 20) {
        const oldest = await tx.recentBoard.findMany({
          where: { userId },
          orderBy: { lastOpenedAt: 'asc' },
          take: count - 20,
          select: { id: true },
        });
        await tx.recentBoard.deleteMany({
          where: { id: { in: oldest.map((r) => r.id) } },
        });
      }
    });
  }
}
