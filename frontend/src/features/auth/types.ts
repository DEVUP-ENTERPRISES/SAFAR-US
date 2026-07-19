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

export interface Address {
  id: string;
  label: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  isDefault: boolean;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relation?: string;
}

/** Full profile from GET /users/me. */
export interface Me {
  id: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  dateOfBirth?: string;
  addresses: Address[];
  emergencyContacts: EmergencyContact[];
  emailVerified?: boolean;
  phoneVerified?: boolean;
  roles: string[];
  status: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  referralCode?: string;
}

export interface LoginInput {
  email: string;
  password: string;
  mfaToken?: string;
}
