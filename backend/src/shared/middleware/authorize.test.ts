import type { Request, Response, NextFunction } from 'express';
import { authorize } from './authorize';
import { ForbiddenError, UnauthorizedError } from '../../core/errors/app-error';

/**
 * RBAC guard. Pure. Verifies it fails closed: a missing permission is a 403,
 * an absent principal is a 401, and only the '*' superuser bypasses the check.
 */
function run(perms: string[] | null, required: string[]): Error | undefined {
  const req = (perms === null ? {} : { principal: { permissions: perms } }) as Request;
  let captured: Error | undefined;
  const next: NextFunction = (err?: unknown) => { captured = err as Error | undefined; };
  authorize(...required)(req, {} as Response, next);
  return captured;
}

describe('authorize', () => {
  it('rejects an unauthenticated caller with 401', () => {
    expect(run(null, ['booking:read'])).toBeInstanceOf(UnauthorizedError);
  });

  it('allows a caller holding the required permission', () => {
    expect(run(['booking:read'], ['booking:read'])).toBeUndefined();
  });

  it('rejects a caller missing the required permission with 403', () => {
    expect(run(['booking:read'], ['user:manage'])).toBeInstanceOf(ForbiddenError);
  });

  it('requires ALL listed permissions, not just one', () => {
    expect(run(['booking:read'], ['booking:read', 'user:manage'])).toBeInstanceOf(ForbiddenError);
    expect(run(['booking:read', 'user:manage'], ['booking:read', 'user:manage'])).toBeUndefined();
  });

  it('the * superuser permission passes any check', () => {
    expect(run(['*'], ['user:manage', 'payment:refund'])).toBeUndefined();
  });

  it('an empty permission set cannot pass a real requirement', () => {
    expect(run([], ['booking:read'])).toBeInstanceOf(ForbiddenError);
  });
});
