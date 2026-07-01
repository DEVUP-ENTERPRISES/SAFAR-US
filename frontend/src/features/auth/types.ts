export interface AuthUser {
  id: string;
  email?: string;
  roles: string[];
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessExpiresIn: number;
}

export interface AuthResult {
  user: AuthUser;
  tokens: TokenPair;
}

/** Full profile from GET /users/me. */
export interface Me {
  id: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  status: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}
