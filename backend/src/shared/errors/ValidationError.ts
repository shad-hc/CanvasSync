import { ZodError } from 'zod';
import { AppError } from './AppError';

export interface FieldError {
  field: string;
  message: string;
}


export class ValidationError extends AppError {
  public readonly fields: FieldError[];

  constructor(zodError: ZodError) {
    const fields: FieldError[] = zodError.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }));

    super('Validation failed', 422, 'VALIDATION_ERROR');
    this.fields = fields;
  }
}

export const fromZodError = (error: ZodError): ValidationError =>
  new ValidationError(error);
