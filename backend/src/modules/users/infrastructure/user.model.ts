import { Schema, model } from 'mongoose';
import { v7 as uuidv7 } from 'uuid';
import { ROLES } from '../../../shared/constants/rbac';

/**
 * Persistence shape for a user. UUID v7 primary key (time-sortable →
 * good index locality, globally unique, safe when modules split into
 * services). Standard audit + soft-delete fields on every collection.
 */
export interface UserDoc {
  _id: string;
  email?: string;
  phone?: string;
  passwordHash?: string;
  firstName?: string;
  lastName?: string;
  roles: string[];
  status: 'active' | 'suspended' | 'banned';
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
    roles: { type: [String], default: [ROLES.GUEST] },
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
