import type { MemberRole } from '@prisma/client';
import { ForbiddenError, NotFoundError } from '@shared/errors';
import type { BoardRepository } from './boards.repository';



// Roles considered to have read access 
const READ_ROLES: MemberRole[] = ['OWNER', 'EDITOR', 'VIEWER'];
const EDIT_ROLES: MemberRole[] = ['OWNER', 'EDITOR'];

const MANAGE_ROLES: MemberRole[] = ['OWNER'];

export class BoardPermissionsService {
  constructor(private readonly boardRepo: BoardRepository) {}

  async assertMembership(boardId: string, userId: string, isAdmin = false) {
    const board = await this.boardRepo.findById(boardId);
    if (!board) throw new NotFoundError('Board not found', 'BOARD_NOT_FOUND');

    if (isAdmin) return { role: 'OWNER' as MemberRole, board };

    // Public boards any authenticated user can view
    if (board.isPublic) {
      const member = await this.boardRepo.findMember(boardId, userId);
      return { role: member?.role ?? ('VIEWER' as MemberRole), board };
    }

    const member = await this.boardRepo.findMember(boardId, userId);
    if (!member) {
      throw new ForbiddenError('You do not have access to this board', 'NOT_A_MEMBER');
    }

    return { role: member.role, board };
  }

  async assertCanView(boardId: string, userId: string, isAdmin = false) {
    const result = await this.assertMembership(boardId, userId, isAdmin);
    if (!READ_ROLES.includes(result.role)) {
      throw new ForbiddenError('Insufficient permissions to view this board', 'INSUFFICIENT_PERMISSIONS');
    }
    return result;
  }

  async assertCanEdit(boardId: string, userId: string, isAdmin = false) {
    const result = await this.assertMembership(boardId, userId, isAdmin);
    if (!EDIT_ROLES.includes(result.role)) {
      throw new ForbiddenError(
        'You need Editor or Owner access to edit this board',
        'INSUFFICIENT_PERMISSIONS',
      );
    }
    return result;
  }

  async assertCanManage(boardId: string, userId: string, isAdmin = false) {
    const result = await this.assertMembership(boardId, userId, isAdmin);
    if (!MANAGE_ROLES.includes(result.role)) {
      throw new ForbiddenError(
        'Only board owners can manage members and settings',
        'INSUFFICIENT_PERMISSIONS',
      );
    }
    return result;
  }

  async assertCanDelete(boardId: string, userId: string, isAdmin = false) {
    return this.assertCanManage(boardId, userId, isAdmin);
  }
}
