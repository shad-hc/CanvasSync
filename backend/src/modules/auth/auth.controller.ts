import { Request, Response } from 'express';
import { asyncHandler } from '@shared/middleware';
import { successResponse } from '@shared/types/api.types';
import { UnauthorizedError } from '@shared/errors';
import type { AuthService } from './auth.service';
import type { RegisterDto, LoginDto, RefreshDto, LogoutDto } from './auth.schemas';


export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const dto = req.body as RegisterDto;
    const result = await this.authService.register(dto);

    res.status(201).json(
      successResponse(result, { message: 'Registration successful' }),
    );
  });

  login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const dto = req.body as LoginDto;
    const result = await this.authService.login(dto);

    res.status(200).json(successResponse(result));
  });

  refresh = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const dto = req.body as RefreshDto;
    const tokens = await this.authService.refresh(dto);

    res.status(200).json(successResponse(tokens));
  });

  logout = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const dto = req.body as LogoutDto;

    // Extract the access token from the Authorization header to blacklist it
    const authHeader = req.headers['authorization'];
    const accessToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : '';

    if (!accessToken) {
      throw new UnauthorizedError('No access token provided', 'NO_ACCESS_TOKEN');
    }

    await this.authService.logout(dto, accessToken);

    res.status(200).json(successResponse({ message: 'Logged out successfully' }));
  });

  me = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    // req.user is guaranteed by requireAuth middleware applied on this route
    const userId = req.user!.id;
    const user = await this.authService.getMe(userId);

    res.status(200).json(successResponse(user));
  });
}
