import jwt from 'jsonwebtoken';
import { tokenService } from './token.service';
import { config } from '../../../config';

/**
 * JWT issue + verify. Pure — no database, no Redis. Covers the token security
 * boundaries: expiry, tampering, wrong secret, and cross-use between the access
 * and refresh secrets.
 */
const claims = { sub: 'user_1', sid: 'sess_1', roles: ['guest'], permissions: ['booking:create'] };

describe('tokenService — issue & verify', () => {
  it('round-trips access-token claims', () => {
    const { accessToken } = tokenService.issuePair(claims);
    const decoded = tokenService.verifyAccess(accessToken);
    expect(decoded.sub).toBe('user_1');
    expect(decoded.sid).toBe('sess_1');
    expect(decoded.roles).toEqual(['guest']);
    expect(decoded.permissions).toEqual(['booking:create']);
  });

  it('issues a refresh token carrying sub, sid and a unique jti', () => {
    const a = tokenService.issuePair(claims);
    const b = tokenService.issuePair(claims);
    const ja = tokenService.verifyRefresh(a.refreshToken);
    const jb = tokenService.verifyRefresh(b.refreshToken);
    expect(ja.sub).toBe('user_1');
    expect(ja.jti).toBeTruthy();
    expect(ja.jti).not.toBe(jb.jti); // each issue is a distinct token
  });

  it('rejects an expired access token', () => {
    const expired = jwt.sign(claims, config.jwt.accessSecret, { expiresIn: -10 });
    expect(() => tokenService.verifyAccess(expired)).toThrow(/invalid or expired/i);
  });

  it('rejects a tampered payload', () => {
    const { accessToken } = tokenService.issuePair(claims);
    const [h, , s] = accessToken.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, roles: ['super_admin'] })).toString('base64url');
    expect(() => tokenService.verifyAccess(`${h}.${forged}.${s}`)).toThrow(/invalid or expired/i);
  });

  it('rejects a token signed with the wrong secret', () => {
    const forged = jwt.sign(claims, 'a-different-attacker-secret-0123456789');
    expect(() => tokenService.verifyAccess(forged)).toThrow(/invalid or expired/i);
  });

  it('will not accept a refresh token as an access token (secret separation)', () => {
    const { refreshToken } = tokenService.issuePair(claims);
    expect(() => tokenService.verifyAccess(refreshToken)).toThrow(/invalid or expired/i);
  });

  it('rejects malformed garbage', () => {
    expect(() => tokenService.verifyAccess('not.a.jwt')).toThrow();
    expect(() => tokenService.verifyRefresh('')).toThrow();
  });
});
