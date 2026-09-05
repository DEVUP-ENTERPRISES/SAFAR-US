import { registerSchema } from './auth.schemas';

/**
 * The registration boundary must not be a role-escalation vector.
 *
 * A client can put anything in a request body, so the guarantee cannot be "the
 * client won't send roles" — it has to be "roles sent are discarded". Zod
 * strips unknown keys from an object schema by default; these tests pin that,
 * because a future switch to .passthrough() would silently open the door and
 * nothing else would fail.
 */
describe('registerSchema — no privilege in the body', () => {
  it('drops an injected roles field', () => {
    const parsed = registerSchema.parse({
      email: 'attacker@example.com',
      password: 'hunter2hunter2',
      roles: ['super_admin'],
      permissions: ['*'],
      status: 'active',
    } as Record<string, unknown>);

    expect(parsed).not.toHaveProperty('roles');
    expect(parsed).not.toHaveProperty('permissions');
    expect(parsed).not.toHaveProperty('status');
  });

  it('keeps only the declared fields', () => {
    const parsed = registerSchema.parse({
      email: 'user@example.com',
      password: 'hunter2hunter2',
      firstName: 'Sam',
    });
    expect(Object.keys(parsed).sort()).toEqual(['email', 'firstName', 'password']);
  });
});
