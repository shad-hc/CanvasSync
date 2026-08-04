import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '@shared/errors';
import { errorResponse } from '@shared/types/api.types';
import { logger } from '@shared/logger';
import { env } from '@config/env';


export const errorHandlerMiddleware = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  const requestId = req.requestId;

  if (err instanceof ValidationError) {
    logger.warn('Validation error', { requestId, fields: err.fields });
    res.status(422).json(errorResponse(err.code, err.message, err.fields));
    return;
  }

  if (err instanceof AppError && err.isOperational) {
    logger.warn('Operational error', {
      requestId,
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
    });
    res.status(err.statusCode).json(errorResponse(err.code, err.message));
    return;
  }


  const message =
    err instanceof Error ? err.message : 'An unexpected error occurred';
  const stack = err instanceof Error ? err.stack : undefined;

  logger.error('Unhandled error', { requestId, message, stack });

  res.status(500).json({
    ...errorResponse('INTERNAL_SERVER_ERROR', 'An unexpected error occurred'),
    ...(env.NODE_ENV === 'development' ? { stack } : {}),
  });
};


export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
