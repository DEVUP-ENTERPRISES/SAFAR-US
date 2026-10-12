import { ApiError } from '@catodrive/core/web/lib/api/types';

/** The portal answers 403 when the account isn't enrolled - a settled answer, not a failure. */
export const isNotEnrolled = (error: unknown) => error instanceof ApiError && error.status === 403;
