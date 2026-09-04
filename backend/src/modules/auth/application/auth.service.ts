import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { AppError, ConflictError, UnauthorizedError, ForbiddenError } from '../../../core/errors/app-error';
import { permissionsForRoles } from '../../../shared/constants/rbac';
import { config } from '../../../config';
import { logger } from '../../../infrastructure/logging/logger';
import { verifyTotp } from '../../../shared/utils/totp';
import { userRepository } from '../../users/infrastructure/user.repository';
import { tokenService, type TokenPair } from './token.service';
import { otpService } from './otp.service';
import { channelProviders } from '../../notifications/infrastructure/channel.providers';
import { sessionStore } from '../infrastructure/session.store';
import { isRedisHealthy } from '../../../infrastructure/cache/redis.client';
import type { RegisterDto, LoginDto } from '../dto/auth.schemas';
import { socialAuthService } from './social-auth.service';

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
      throw new ConflictError('An account with this email already exists', 'EMAIL_TAKEN');
    }
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
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
    return this.issueSession(user._id, user.email, user.roles, ctx);
  }

  async login(dto: LoginDto, ctx?: AuthCtx): Promise<AuthResult> {
    const user = await userRepository.findByEmail(dto.email, true);
    if (!user?.passwordHash) throw new UnauthorizedError('Invalid credentials');

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    if (user.status !== 'active') throw new ForbiddenError('Account is not active');

    // Two-factor: if enabled, a valid TOTP code is required.
    if (user.mfa?.enabled) {
      if (!dto.mfaToken) {
        throw new AppError({ code: 'MFA_REQUIRED', message: 'A 2FA code is required', httpStatus: 401 });
      }
      if (!user.mfa.secret || !verifyTotp(user.mfa.secret, dto.mfaToken)) {
        throw new UnauthorizedError('Invalid 2FA code');
      }
    }

    return this.issueSession(user._id, user.email, user.roles, ctx);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const decoded = tokenService.verifyRefresh(refreshToken);

    // Replay detection needs the stored jti. During a Redis outage we can't read
    // it, so rather than force a re-login we issue on the (verified, short-lived)
    // refresh JWT and skip the reuse check — logged, and only for the outage.
    if (isRedisHealthy()) {
      const storedJti = await sessionStore.getRefreshJti(decoded.sid);
      if (!storedJti) throw new UnauthorizedError('Session expired or revoked');

      // A rotated-out refresh token is treated as theft → revoke the whole session.
      if (storedJti !== decoded.jti) {
        await sessionStore.revoke(decoded.sid);
        throw new UnauthorizedError('Refresh token reuse detected — session revoked');
      }
    } else {
      logger.warn({ sid: decoded.sid }, 'Refresh degraded — Redis unavailable; skipping reuse check');
    }

    const user = await userRepository.findById(decoded.sub);
    if (!user) throw new UnauthorizedError('User no longer exists');

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

  async verifyPhoneOtp(phone: string, code: string, ctx?: AuthCtx): Promise<AuthResult> {
    await otpService.verify('phone', phone, code);
    let user = await userRepository.findByPhone(phone);
    if (!user) user = await userRepository.create({ phone, phoneVerified: true });
    if (user.status !== 'active') throw new ForbiddenError('Account is not active');
    return this.issueSession(user._id, user.email, user.roles, ctx);
  }

  /** Google Sign-In: verify the id_token server-side, then find-or-create. */
  async loginWithGoogle(idToken: string, ctx?: AuthCtx): Promise<AuthResult> {
    if (!config.google.enabled) {
      throw new AppError({ code: 'OAUTH_DISABLED', message: 'Google login is not configured', httpStatus: 501 });
    }
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) throw new UnauthorizedError('Invalid Google token');
    const info = (await res.json()) as { aud?: string; email?: string; email_verified?: string };
    if (info.aud !== config.google.clientId || !info.email) throw new UnauthorizedError('Google token rejected');

    let user = await userRepository.findByEmail(info.email);
    if (!user) user = await userRepository.create({ email: info.email, emailVerified: true });
    if (user.status !== 'active') throw new ForbiddenError('Account is not active');
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
  ): Promise<AuthResult> {
    const identity = await socialAuthService.verify(provider, token);
    const subjectKey = socialAuthService.subjectHash(provider, identity.subject);

    let user = await userRepository.findBySocialSubject(subjectKey);
    if (!user) user = await userRepository.findByEmail(identity.email);

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
    return this.issueSession(user._id, user.email, user.roles, ctx);
  }

  /** Verify email OTP → find-or-create the user and issue a session. */
  async verifyEmailOtp(email: string, code: string, ctx?: AuthCtx): Promise<AuthResult> {
    await otpService.verify('login', email, code);
    let user = await userRepository.findByEmail(email);
    if (!user) {
      user = await userRepository.create({ email, emailVerified: true });
    } else if (!user.emailVerified) {
      await userRepository.setStatus(user._id, user.status); // no-op guard
    }
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
