import type { Principal } from '../../core/types/common';

/**
 * Augments Express's Request with a typed `principal` populated by the
 * authenticate middleware. Imported for its side effect.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}

export {};
