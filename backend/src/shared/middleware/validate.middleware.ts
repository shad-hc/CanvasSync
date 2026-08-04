import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { fromZodError } from '@shared/errors';

type ValidationTarget = 'body' | 'query' | 'params';


export const validate =
  <T>(schema: ZodSchema<T>, target: ValidationTarget = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      next(fromZodError(result.error));
      return;
    }

    
    req[target] = result.data as typeof req[typeof target];
    next();
  };
