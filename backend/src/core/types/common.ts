export type Nullable<T> = T | null;

export interface Principal {
  userId: string;
  roles: string[];
  permissions: string[];
  sessionId: string;
}

export interface PaginationParams {
  limit: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: Nullable<string>;
  hasMore: boolean;
}
