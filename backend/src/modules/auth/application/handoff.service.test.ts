/** The cross-site sign-in code: it opens a session once, and only within its minute. */
import { handoffService } from './handoff.service';
import { authService } from './auth.service';

jest.mock('./auth.service', () => ({
  authService: { issueSessionForUser: jest.fn(async (userId: string) => ({ user: { id: userId, roles: [] }, tokens: { accessToken: 'a', refreshToken: 'r' } })) },
}));

beforeEach(() => jest.clearAllMocks());

describe('handoff', () => {
  it('redeems a code once for the user it was made for', async () => {
    const { code } = await handoffService.create('user-1');
    const result = await handoffService.redeem(code);
    expect(result.user.id).toBe('user-1');
    await expect(handoffService.redeem(code)).rejects.toThrow('already been used');
    expect(authService.issueSessionForUser).toHaveBeenCalledTimes(1);
  });

  it('refuses a code it never issued', async () => {
    await expect(handoffService.redeem('x'.repeat(43))).rejects.toThrow('expired');
    expect(authService.issueSessionForUser).not.toHaveBeenCalled();
  });

  it('lets only one of two simultaneous redemptions through', async () => {
    const { code } = await handoffService.create('user-2');
    const results = await Promise.allSettled([handoffService.redeem(code), handoffService.redeem(code)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});
