import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../../config';
import { UnauthorizedError } from '../../../core/errors/app-error';

export interface AccessTokenClaims {
  sub: string; // userId
  sid: string; // sessionId
  roles: string[];
  permissions: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
}

/**
 * Issues and verifies JWTs. Access tokens are short-lived and stateless;
 * refresh tokens are long-lived and rotated (see session store).
 */
export class TokenService {
  issuePair(claims: AccessTokenClaims): TokenPair {
    const accessToken = jwt.sign(claims, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessTtl,
    });
    const refreshToken = jwt.sign(
      { sub: claims.sub, sid: claims.sid, jti: uuidv4() },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshTtl },
    );
    return { accessToken, refreshToken, accessExpiresIn: config.jwt.accessTtl };
  }

  verifyAccess(token: string): AccessTokenClaims {
    try {
      return jwt.verify(token, config.jwt.accessSecret) as AccessTokenClaims;
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }

  verifyRefresh(token: string): { sub: string; sid: string; jti: string } {
    try {
      return jwt.verify(token, config.jwt.refreshSecret) as {
        sub: string;
        sid: string;
        jti: string;
      };
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  }
}

export const tokenService = new TokenService();
