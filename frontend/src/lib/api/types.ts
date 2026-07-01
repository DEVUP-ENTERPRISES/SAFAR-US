/** Mirrors the backend's standard response envelope exactly. */
export interface ApiMeta {
  requestId?: string;
  pagination?: { nextCursor: string | null; hasMore: boolean };
  [key: string]: unknown;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: ApiMeta;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: { field?: string; issue: string }[];
    requestId?: string;
  };
}

export interface Money {
  amount: number; // minor units
  currency: string;
}

/** Thrown by the client on non-2xx; carries the machine-readable code. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: { field?: string; issue: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
