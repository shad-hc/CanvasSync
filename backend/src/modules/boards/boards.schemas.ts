import { z } from 'zod';

export const createBoardSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(100, 'Title must be at most 100 characters')
    .trim(),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .trim()
    .optional(),
  isPublic: z.boolean().default(false),
});

export const updateBoardSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(100, 'Title must be at most 100 characters')
    .trim()
    .optional(),
  description: z
    .string()
    .max(500, 'Description must be at most 500 characters')
    .trim()
    .nullable()
    .optional(),
  isPublic: z.boolean().optional(),
});


export const listBoardsQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  filter: z
    .enum(['all', 'owned', 'shared', 'recent', 'favorite'])
    .default('all'),
});

export const boardIdParamSchema = z.object({
  boardId: z.string().uuid('Invalid board ID'),
});


export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  role: z.enum(['EDITOR', 'VIEWER']).default('VIEWER'),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['EDITOR', 'VIEWER'], {
    errorMap: () => ({ message: 'Role must be EDITOR or VIEWER' }),
  }),
});

export const memberIdParamSchema = z.object({
  boardId: z.string().uuid('Invalid board ID'),
  memberId: z.string().uuid('Invalid member ID'),
});


export const inviteIdParamSchema = z.object({
  inviteId: z.string().uuid('Invalid invite ID'),
});

export const respondToInviteSchema = z.object({
  action: z.enum(['accept', 'decline']),
});


export type CreateBoardDto = z.infer<typeof createBoardSchema>;
export type UpdateBoardDto = z.infer<typeof updateBoardSchema>;
export type ListBoardsQuery = z.infer<typeof listBoardsQuerySchema>;
export type BoardIdParam = z.infer<typeof boardIdParamSchema>;
export type InviteMemberDto = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberRoleDto = z.infer<typeof updateMemberRoleSchema>;
export type MemberIdParam = z.infer<typeof memberIdParamSchema>;
export type RespondToInviteDto = z.infer<typeof respondToInviteSchema>;
