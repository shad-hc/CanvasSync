import type { MemberRole, InviteStatus } from '@prisma/client';


export interface BoardMemberSummary {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  role: MemberRole;
  joinedAt: string;
}

export interface BoardSummary {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  memberCount: number;
  userRole: MemberRole;
  lastOpenedAt: string | null;
}

export interface BoardDetail extends BoardSummary {
  members: BoardMemberSummary[];
}

export interface PaginatedBoards {
  boards: BoardSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}
