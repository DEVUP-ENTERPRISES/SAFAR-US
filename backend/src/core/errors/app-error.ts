/**
 * Base class for all business/domain errors.
 * Carries a stable machine-readable `code`, an HTTP status, and a
 * user-safe `message`. The central error handler maps these to the
 * standard response envelope — controllers never build error responses.
 */
export interface ErrorDetail {
  field?: string;
  issue: string;
}

export class AppError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly details?: ErrorDetail[];
  public readonly isOperational: boolean;

  constructor(params: {
    code: string;
    message: string;
    httpStatus: number;
    details?: ErrorDetail[];
  }) {
    super(params.message);
    this.name = new.target.name;
    this.code = params.code;
    this.httpStatus = params.httpStatus;
    this.details = params.details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: ErrorDetail[]) {
    super({ code: 'VALIDATION_ERROR', message, httpStatus: 422, details });
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super({ code: 'NOT_FOUND', message: `${resource} not found`, httpStatus: 404 });
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code = 'CONFLICT') {
    super({ code, message, httpStatus: 409 });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super({ code: 'UNAUTHORIZED', message, httpStatus: 401 });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super({ code: 'FORBIDDEN', message, httpStatus: 403 });
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests, please slow down') {
    super({ code: 'RATE_LIMITED', message, httpStatus: 429 });
  }
}

export class ExternalServiceError extends AppError {
  constructor(message = 'An upstream service failed') {
    super({ code: 'EXTERNAL_SERVICE_ERROR', message, httpStatus: 502 });
  }
}
