import { Schema, model } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { ROLES } from '../../../shared/constants/rbac';

/**
 * Persistence shape for a user. UUID v7 primary key (time-sortable →
 * good index locality, globally unique, safe when modules split into
 * services). Standard audit + soft-delete fields on every collection.
 */
export interface Address {
  id: string;
  label: string; // Home, Work, Airport…
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

export interface UserDoc {
  _id: string;
  email?: string;
  phone?: string;
  passwordHash?: string;
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
  dateOfBirth?: string;
  addresses: Address[];
  emergencyContacts: EmergencyContact[];
  roles: string[];
  mfa?: { enabled: boolean; secret?: string; pendingSecret?: string; enabledAt?: Date };
  status: 'active' | 'suspended' | 'banned';
  /** Formal warnings issued from claim settlements. Three strikes → review. */
  warnings?: { reason: string; at: Date; by: string; claimId?: string }[];
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const userSchema = new Schema<UserDoc>(
  {
    _id: { type: String, default: () => uuidv7() },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, select: false },
    firstName: String,
    lastName: String,
    avatarUrl: String,
    dateOfBirth: String,
    addresses: {
      type: [
        {
          id: String, label: String, line1: String, city: String,
          state: String, zip: String, country: String, isDefault: Boolean,
        },
      ],
      default: [],
    },
    emergencyContacts: {
      type: [{ id: String, name: String, phone: String, relation: String }],
      default: [],
    },
    mfa: {
      enabled: { type: Boolean, default: false },
      secret: { type: String, select: false },
      pendingSecret: { type: String, select: false },
      enabledAt: Date,
    },
    roles: { type: [String], default: [ROLES.GUEST] },
    warnings: {
      type: [{ _id: false, reason: String, at: Date, by: String, claimId: String }],
      default: [],
    },
    status: { type: String, default: 'active', enum: ['active', 'suspended', 'banned'] },
    emailVerified: { type: Boolean, default: false },
    phoneVerified: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ phone: 1 }, { unique: true, sparse: true });
userSchema.index({ status: 1 });

export const UserModel = model<UserDoc>('User', userSchema);
