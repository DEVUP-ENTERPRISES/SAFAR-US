import { hashPassword, verifyPassword } from './password';
import { v4 as uuidv4 } from 'uuid';
import { AppError, ConflictError, UnauthorizedError, ForbiddenError } from '../../../core/errors/app-error';
import { permissionsForRoles } from '../../../shared/constants/rbac';
import { config } from '../../../config';
import { logger } from '../../../infrastructure/logging/logger';
import { verifyTotp } from '../../../shared/utils/totp';
import { userRepository } from '../../users/infrastructure/user.repository';
import { tokenService, type TokenPair } from './token.service';
import { otpService } from './otp.service';
import { attemptGuard } from './attempt-guard';
import { isSessionBlocked } from '../../users/domain/account-status';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { emit } from '../../../shared/events/event-bus';
import { EVENTS } from '../../../core/events/event-names';
import { sessionStore } from '../infrastructure/session.store';
import { platformConfigService } from '../../platform-config/application/platform-config.service';
import type { RegisterDto, LoginDto } from '../dto/auth.schemas';
import { socialAuthService } from './social-auth.service';

let dummyHashPromise: Promise<string> | undefined;
const dummyHash = (): Promise<string> => (dummyHashPromise ??= hashPassword('not-a-real-password'));

export interface AuthResult {
  user: { id: string; email?: string; roles: string[] };
  tokens: TokenPair;
}

/**
 * Orchestrates registration, login, token refresh (with rotation), and
 * logout. Business rules live here; the controller stays thin.
 */
export class AuthService {
  async register(dto: RegisterDto, ctx?: AuthCtx): Promise<AuthResult> {
    if (await userRepository.existsByEmail(dto.email)) {
      // Generic on purpose: a distinct answer would let anyone probe which emails have accounts.
      throw new ConflictError('We could not create an account with these details. If you already have one, sign in or reset your password.', 'REGISTRATION_FAILED');
    }
    const passwordHash = await hashPassword(dto.password);
    const user = await userRepository.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    // Attach referral (best-effort; never blocks signup).
    if (dto.referralCode) {
      const { referralService } = await import('../../referral/application/referral.service');
      await referralService.attach(user._id, dto.referralCode).catch(() => undefined);
    }
    // Fire-and-forget: the welcome email is a side effect, not part of the
    // transaction — a slow or failing mail send must never fail signup.
    emit(EVENTS.USER_REGISTERED, user._id, {
      userId: user._id,
      email: user.email,
      firstName: user.firstName,
    });
    return this.issueSession(user._id, user.email, user.roles, ctx);
  }

  async login(dto: LoginDto, ctx?: AuthCtx): Promise<AuthResult> {
    await attemptGuard.assertOpen('login', dto.email);
    const user = await userRepository.findByEmail(dto.email, true);

    // Unknown and password-less accounts pay the same argon2 cost, so timing reveals nothing.
    const { valid, needsRehash } = await verifyPassword(user?.passwordHash ?? (await dummyHash()), dto.password);
    if (!user?.passwordHash || !valid) {
      await attemptGuard.recordFailure('login', dto.email);
      throw new UnauthorizedError('Invalid credentials');
    }

    if (user.status !== 'active') throw new ForbiddenError('Account is not active');

    // Upgrade the stored hash in place when it was made under an older scheme
    // (weaker params, or before the pepper). Best-effort: a failed upgrade must
    // never fail the login itself.
    if (needsRehash) {
      void hashPassword(dto.password)
        .then((h) => userRepository.updatePasswordHash(user._id, h))
        .catch(() => undefined);
    }

    await this.assertMfa(user, dto.mfaToken);

    await attemptGuard.clear('login', dto.email);

    return this.issueSession(user._id, user.email, user.roles, ctx);
  }

  /** Two-factor: every way of signing in must pass it for an account that turned it on, not just the password. */
  private async assertMfa(user: { _id: string; mfa?: { enabled: boolean; secret?: string } }, mfaToken?: string): Promise<void> {
    if (!user.mfa?.enabled) return;
    if (!mfaToken) {
      throw new AppError({ code: 'MFA_REQUIRED', message: 'A 2FA code is required', httpStatus: 401 });
    }
    await attemptGuard.assertOpen('mfa', user._id);
    const secret = user.mfa.secret ?? (await userRepository.mfaSecretOf(user._id));
    if (!secret || !verifyTotp(secret, mfaToken)) {
      await attemptGuard.recordFailure('mfa', user._id);
      throw new UnauthorizedError('Invalid 2FA code');
    }
    await attemptGuard.clear('mfa', user._id);
  }

  /** An unverified account matched by a now-proven email/phone was made by someone else first: wipe its password and sessions. */
  private async adoptVerifiedContact(
    user: { _id: string; emailVerified?: boolean; phoneVerified?: boolean },
    contact: 'email' | 'phone',
  ): Promise<void> {
    if (contact === 'email' ? user.emailVerified : user.phoneVerified) return;
    await userRepository.claimVerifiedContact(user._id, contact);
    await sessionStore.revokeAllForUser(user._id);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const decoded = tokenService.verifyRefresh(refreshToken);

    // The stored jti lives in the durable session record, so this holds through a Redis outage or restart.
    const state = await sessionStore.getRefreshState(decoded.sid);
    if (!state) throw new UnauthorizedError('Session expired or revoked');

    // The token this one replaced is accepted for a short leeway: a refresh whose response was lost (a restart, a dropped connection) is retried by the client with the old token.
    const leewayMs = (await platformConfigService.get()).security.refreshRetryLeewaySeconds * 1000;
    const isRetry = decoded.jti === state.prevJti && !!state.rotatedAt && Date.now() - state.rotatedAt.getTime() <= leewayMs;

    // Any other rotated-out refresh token is treated as theft → revoke the whole session.
    if (state.jti !== decoded.jti && !isRetry) {
      await sessionStore.revoke(decoded.sid);
      throw new UnauthorizedError('Refresh token reuse detected — session revoked');
    }

    const user = await userRepository.findById(decoded.sub);
    if (!user) throw new UnauthorizedError('User no longer exists');
    if (isSessionBlocked(user.status)) {
      await sessionStore.revoke(decoded.sid);
      throw new UnauthorizedError('Session expired or revoked');
    }

    const permissions = permissionsForRoles(user.roles);
    const tokens = tokenService.issuePair({
      sub: user._id,
      sid: decoded.sid,
      roles: user.roles,
      permissions,
    });
    const newJti = tokenService.verifyRefresh(tokens.refreshToken).jti;
    await sessionStore.rotate(decoded.sid, user._id, newJti);
    return tokens;
  }

  async logout(sessionId: string): Promise<void> {
    await sessionStore.revoke(sessionId);
  }

  /** List the user's active devices/sessions, marking the current one. */
  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await sessionStore.listForUser(userId);
    return sessions.map((s) => ({ ...s, current: s.id === currentSessionId }));
  }

  /** Revoke one device (must belong to the user). */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    if (!(await sessionStore.belongsTo(sessionId, userId))) {
      throw new ForbiddenError('Not your session');
    }
    await sessionStore.revoke(sessionId);
  }

  /** Sign out everywhere except the current device. */
  async logoutOthers(userId: string, currentSessionId: string): Promise<void> {
    await sessionStore.revokeAllForUser(userId, currentSessionId);
  }

  /** Passwordless: send an email OTP. Returns the code in non-prod for testing. */
  async requestEmailOtp(email: string): Promise<{ sent: boolean; devCode?: string }> {
    const code = await otpService.request('login', email);
    // Actually deliver it. The code was only ever logged before, so a real
    // sign-in could not complete without reading the server logs.
    const res = await channelProviders.email.send({
      target: { userId: '', email },
      templateKey: 'auth.otp',
      title: `Your ${config.app.name} sign-in code`,
      body: `Your code is ${code}. It expires in 10 minutes. If you didn't request it, ignore this email.`,
    });
    if (!res.ok && config.isProd) {
      logger.error({ email, error: res.error }, 'login OTP email failed to send');
    }
    logger.info({ email, delivered: res.ok }, '📧 login OTP issued');
    return { sent: true, devCode: config.isProd ? undefined : code };
  }

  /**
   * Forgot password — step 1: issue a reset code to the email.
   *
   * Enumeration-safe: the response is identical whether or not an account
   * exists, so this endpoint can't be used to discover who has an account. The
   * code is only actually sent when there is a user with a password to reset.
   * Email may be unconfigured in this environment; the code still issues (and
   * is returned in non-prod for testing) so the flow is fully testable now.
   */
  async requestPasswordReset(email: string): Promise<{ sent: boolean; devCode?: string }> {
    const user = await userRepository.findByEmail(email, true);
    // Only issue for a real, active account that actually has a password.
    if (user && user.status === 'active' && user.passwordHash) {
      const code = await otpService.request('password_reset', email);
      const res = await channelProviders.email.send({
        target: { userId: user._id, email },
        templateKey: 'auth.password_reset',
        title: `Reset your ${config.app.name} password`,
        body: `Your password reset code is ${code}. It expires in 5 minutes. If you didn't request this, ignore this email and your password stays unchanged.`,
      });
      if (!res.ok && config.isProd) {
        logger.error({ email, error: res.error }, 'password reset email failed to send');
      }
      logger.info({ email, delivered: res.ok }, '🔑 password reset code issued');
      // Return the code in non-prod ONLY, and only when one was really issued.
      return { sent: true, devCode: config.isProd ? undefined : code };
    }
    // Same shape for a non-existent/ineligible account — no signal to an attacker.
    return { sent: true };
  }

  /**
   * Forgot password — step 2: verify the code and set the new password.
   *
   * On success every existing session is revoked: a password reset is exactly
   * the moment you want to kick out anyone who might have had access, including
   * whoever the reset was protecting against.
   */
  async resetPassword(email: string, code: string, newPassword: string, mfaToken?: string): Promise<{ reset: boolean }> {
    // Throws on a bad/expired code (attempt-capped inside otpService).
    await otpService.verify('password_reset', email, code);
    const user = await userRepository.findByEmail(email, true);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('This reset link is no longer valid.');
    }
    await this.assertMfa(user, mfaToken);
    const passwordHash = await hashPassword(newPassword);
    await userRepository.updatePasswordHash(user._id, passwordHash);
    // Sign out everywhere — old sessions must not survive a reset.
    await sessionStore.revokeAllForUser(user._id);
    logger.info({ userId: user._id }, '🔑 password reset completed; all sessions revoked');
    return { reset: true };
  }

  /** Passwordless phone: send an SMS OTP. */
  async requestPhoneOtp(phone: string): Promise<{ sent: boolean; devCode?: string }> {
    const code = await otpService.request('phone', phone);
    const res = await channelProviders.sms.send({
      target: { userId: '', phone },
      templateKey: 'auth.otp',
      title: `${config.app.name} code`,
      body: `${code} is your verification code. Expires in 10 minutes.`,
    });
    if (!res.ok && config.isProd) {
      logger.error({ phone, error: res.error }, 'phone OTP SMS failed to send');
    }
    logger.info({ phone, delivered: res.ok }, '📱 phone OTP issued');
    return { sent: true, devCode: config.isProd ? undefined : code };
  }

  async verifyPhoneOtp(phone: string, code: string, ctx?: AuthCtx, mfaToken?: string): Promise<AuthResult> {
    await otpService.verify('phone', phone, code);
    let user = await userRepository.findByPhone(phone);
    if (!user) user = await userRepository.create({ phone, phoneVerified: true });
    else await this.adoptVerifiedContact(user, 'phone');
    if (user.status !== 'active') throw new ForbiddenError('Account is not active');
    await this.assertMfa(user, mfaToken);
    return this.issueSession(user._id, user.email, user.roles, ctx);
  }

  /** Google Sign-In: verify the id_token server-side, then find-or-create. */
  async loginWithGoogle(idToken: string, ctx?: AuthCtx, mfaToken?: string): Promise<AuthResult> {
    if (!config.google.enabled) {
      throw new AppError({ code: 'OAUTH_DISABLED', message: 'Google login is not configured', httpStatus: 501 });
    }
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) throw new UnauthorizedError('Invalid Google token');
    const info = (await res.json()) as { aud?: string; email?: string; email_verified?: string };
    if (info.aud !== config.google.clientId || !info.email) throw new UnauthorizedError('Google token rejected');
    // An unverified Google email proves nothing, so it must never reach an existing account.
    if (String(info.email_verified) !== 'true') throw new UnauthorizedError('Google email is not verified');

    let user = await userRepository.findByEmail(info.email);
    if (!user) user = await userRepository.create({ email: info.email, emailVerified: true });
    else await this.adoptVerifiedContact(user, 'email');
    if (user.status !== 'active') throw new ForbiddenError('Account is not active');
    await this.assertMfa(user, mfaToken);
    return this.issueSession(user._id, user.email, user.roles, ctx);
  }

  /**
   * Apple and Facebook sign-in.
   *
   * Matched on the provider subject first, then email. Apple only returns the
   * email on the very first authorisation — every later token carries just the
   * subject — so looking a returning user up by email alone would create them a
   * brand new account on every sign-in.
   */
  async loginWithSocial(
    provider: 'apple' | 'facebook',
    token: string,
    ctx?: AuthCtx,
    mfaToken?: string,
  ): Promise<AuthResult> {
    const identity = await socialAuthService.verify(provider, token);
    const subjectKey = socialAuthService.subjectHash(provider, identity.subject);

    let user = await userRepository.findBySocialSubject(subjectKey);
    if (!user) {
      user = await userRepository.findByEmail(identity.email);
      // Linking by email needs the provider to vouch for it; otherwise anyone could claim an existing account.
      if (user && !identity.emailVerified) {
        throw new ForbiddenError('Sign in with your email and password first, then link this provider.');
      }
      if (user) await this.adoptVerifiedContact(user, 'email');
    }

    if (!user) {
      user = await userRepository.create({
        email: identity.email,
        emailVerified: identity.emailVerified,
      });
    }
    // Remember the subject so the next sign-in matches even if Apple withholds
    // the email, or the person later changes it.
    await userRepository.linkSocialSubject(user._id, subjectKey);

    if (user.status !== 'active') throw new ForbiddenError('Account is not active');
    await this.assertMfa(user, mfaToken);
    return this.issueSession(user._id, user.email, user.roles, ctx);
  }

  /** Verify email OTP → find-or-create the user and issue a session. */
  async verifyEmailOtp(email: string, code: string, ctx?: AuthCtx, mfaToken?: string): Promise<AuthResult> {
    await otpService.verify('login', email, code);
    let user = await userRepository.findByEmail(email);
    if (!user) user = await userRepository.create({ email, emailVerified: true });
    else await this.adoptVerifiedContact(user, 'email');
    if (user.status !== 'active') throw new ForbiddenError('Account is not active');
    await this.assertMfa(user, mfaToken);
    return this.issueSession(user._id, user.email, user.roles, ctx);
  }

  /**
   * Sign someone in without a credential, for a flow that has already proven
   * who they are by other means — today, a single-use Captain invite token.
   */
  async issueSessionForUser(userId: string, ctx?: AuthCtx): Promise<AuthResult> {
    const user = await userRepository.findById(userId);
    if (!user) throw new UnauthorizedError('User no longer exists');
    if (user.status !== 'active') throw new ForbiddenError('Account is not active');
    return this.issueSession(user._id, user.email, user.roles, ctx);
  }

  private async issueSession(
    userId: string,
    email: string | undefined,
    roles: string[],
    ctx?: AuthCtx,
  ): Promise<AuthResult> {
    const sessionId = uuidv4();
    const permissions = permissionsForRoles(roles);
    const tokens = tokenService.issuePair({ sub: userId, sid: sessionId, roles, permissions });
    const jti = tokenService.verifyRefresh(tokens.refreshToken).jti;
    await sessionStore.create(sessionId, userId, jti, { userAgent: ctx?.userAgent, ip: ctx?.ip });
    return { user: { id: userId, email, roles }, tokens };
  }
}

export interface AuthCtx {
  userAgent?: string;
  ip?: string;
}

export const authService = new AuthService();
