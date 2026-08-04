export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    fields?: Array<{ field: string; message: string }>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;


export const successResponse = <T>(
  data: T,
  meta?: Record<string, unknown>,
): ApiSuccess<T> => ({ success: true, data, ...(meta ? { meta } : {}) });


export const errorResponse = (
  code: string,
  message: string,
  fields?: Array<{ field: string; message: string }>,
): ApiError => ({
  success: false,
  error: { code, message, ...(fields ? { fields } : {}) },
});
