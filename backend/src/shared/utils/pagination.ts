import type { Page } from '../../core/types/common';

/**
 * Opaque cursor pagination. A cursor encodes the last item's sort value + id
 * so lists are stable under inserts and avoid the deep-offset performance
 * cliff. Here we cursor on `createdAt` + `_id` (both present on every doc).
 */
export interface Cursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString('base64url');
}

export function decodeCursor(raw?: string): Cursor | null {
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
  } catch {
    return null;
  }
}

/** Build a Mongo filter fragment for "everything before this cursor" (desc order). */
export function cursorFilter(cursor: Cursor | null): Record<string, unknown> {
  if (!cursor) return {};
  return {
    $or: [
      { createdAt: { $lt: new Date(cursor.createdAt) } },
      { createdAt: new Date(cursor.createdAt), _id: { $lt: cursor.id } },
    ],
  };
}

/** Turn an over-fetched slice (limit+1) into a Page with nextCursor. */
export function toPage<T extends { _id: string; createdAt: Date }>(
  rows: T[],
  limit: number,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    nextCursor:
      hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last._id }) : null,
  };
}
