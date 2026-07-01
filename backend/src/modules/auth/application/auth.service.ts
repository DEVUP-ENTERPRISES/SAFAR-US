import argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { ConflictError, UnauthorizedError, ForbiddenError } from '../../../core/errors/app-error';
import { permissionsForRoles } from '../../../shared/constants/rbac';
import { userRepository } from '../../users/infrastructure/user.repository';
import { tokenService, type TokenPair } from './token.service';
import { sessionStore } from '../infrastructure/session.store';
import type { RegisterDto, LoginDto } from '../dto/auth.schemas';

export interface AuthResult {
  user: { id: string; email?: string; roles: string[] };
  tokens: TokenPair;
}

/**
 * Orchestrates registration, login, token refresh (with rotation), and
 * logout. Business rules live here; the controller stays thin.
 */
export class AuthService {
  async register(dto: RegisterDto): Promise<AuthResult> {
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
    return this.issueSession(user._id, user.email, user.roles);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await userRepository.findByEmail(dto.email, true);
    if (!user?.passwordHash) throw new UnauthorizedError('Invalid credentials');

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedError('Invalid credentials');

    if (user.status !== 'active') throw new ForbiddenError('Account is not active');

    return this.issueSession(user._id, user.email, user.roles);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const decoded = tokenService.verifyRefresh(refreshToken);

    const storedJti = await sessionStore.getRefreshJti(decoded.sid);
    if (!storedJti) throw new UnauthorizedError('Session expired or revoked');

    // Replay detection: a rotated-out refresh token is treated as theft →
    // revoke the whole session.
    if (storedJti !== decoded.jti) {
      await sessionStore.revoke(decoded.sid);
      throw new UnauthorizedError('Refresh token reuse detected — session revoked');
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

  private async issueSession(
    userId: string,
    email: string | undefined,
    roles: string[],
  ): Promise<AuthResult> {
    const sessionId = uuidv4();
    const permissions = permissionsForRoles(roles);
    const tokens = tokenService.issuePair({ sub: userId, sid: sessionId, roles, permissions });
    const jti = tokenService.verifyRefresh(tokens.refreshToken).jti;
    await sessionStore.create(sessionId, userId, jti);
    return { user: { id: userId, email, roles }, tokens };
  }
}

export const authService = new AuthService();
