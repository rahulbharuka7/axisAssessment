/**
 * Uniform error envelope — docs/05 §8.
 * Every failure leaves the API as { success: false, error: {...} }.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (code: string, message: string, field?: string) =>
  new ApiError(400, code, message, field);

export const unauthenticated = (message = 'Authentication required') =>
  new ApiError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = 'Not permitted for this role') =>
  new ApiError(403, 'FORBIDDEN', message);

export const notFound = (code: string, message: string) =>
  new ApiError(404, code, message);

export const conflict = (code: string, message: string) =>
  new ApiError(409, code, message);

export const unavailable = (code: string, message: string) =>
  new ApiError(503, code, message);
