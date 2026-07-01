import { v7 as uuidv7, v4 as uuidv4 } from 'uuid';

/** Time-sortable primary keys (good index locality, globally unique). */
export const uuid = (): string => uuidv7();

/** Random id for tokens / non-persisted identifiers. */
export const randomId = (): string => uuidv4();
