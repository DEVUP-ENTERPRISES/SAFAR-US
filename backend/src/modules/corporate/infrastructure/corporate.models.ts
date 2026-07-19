import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

/** A corporate organization (tenant) that manages employee mobility. */
export interface OrgDoc {
  _id: string;
  name: string;
  billingEmail: string;
  domain?: string;
  status: 'active' | 'suspended';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const orgSchema = new Schema<OrgDoc>(
  {
    _id: { type: String, default: () => uuid() },
    name: { type: String, required: true },
    billingEmail: { type: String, required: true },
    domain: String,
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    createdBy: { type: String, required: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);
export const OrgModel = model<OrgDoc>('CorporateOrg', orgSchema);

/** An employee's membership in an org, with a corporate role. */
export type CorpRole = 'corp_admin' | 'manager' | 'employee';
export interface MemberDoc {
  _id: string;
  orgId: string;
  userId?: string; // set once the invite is accepted / user exists
  email: string;
  role: CorpRole;
  costCenterId?: string;
  status: 'invited' | 'active' | 'removed';
  createdAt: Date;
  updatedAt: Date;
}
const memberSchema = new Schema<MemberDoc>(
  {
    _id: { type: String, default: () => uuid() },
    orgId: { type: String, required: true },
    userId: String,
    email: { type: String, required: true, lowercase: true },
    role: { type: String, enum: ['corp_admin', 'manager', 'employee'], default: 'employee' },
    costCenterId: String,
    status: { type: String, enum: ['invited', 'active', 'removed'], default: 'invited' },
  },
  { timestamps: true, _id: false },
);
memberSchema.index({ orgId: 1, email: 1 }, { unique: true });
memberSchema.index({ userId: 1 });
export const MemberModel = model<MemberDoc>('CorporateMember', memberSchema);

/** A budget bucket trips are billed against. */
export interface CostCenterDoc {
  _id: string;
  orgId: string;
  name: string;
  code: string;
  budget: number; // minor units
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}
const costCenterSchema = new Schema<CostCenterDoc>(
  {
    _id: { type: String, default: () => uuid() },
    orgId: { type: String, required: true },
    name: { type: String, required: true },
    code: { type: String, required: true },
    budget: { type: Number, default: 0 },
    currency: { type: String, default: 'USD' },
  },
  { timestamps: true, _id: false },
);
costCenterSchema.index({ orgId: 1 });
export const CostCenterModel = model<CostCenterDoc>('CorporateCostCenter', costCenterSchema);

/** Org-wide travel policy enforced on trip requests. */
export interface PolicyDoc {
  _id: string;
  orgId: string;
  maxDailyPrice: number; // minor units, 0 = no cap
  allowedCategories: string[]; // empty = all
  autoApproveUnder: number; // minor units; total <= this auto-approves
  requireApprovalOver: number; // minor units; total > this always needs approval
  createdAt: Date;
  updatedAt: Date;
}
const policySchema = new Schema<PolicyDoc>(
  {
    _id: { type: String, default: () => uuid() },
    orgId: { type: String, required: true, unique: true },
    maxDailyPrice: { type: Number, default: 0 },
    allowedCategories: { type: [String], default: [] },
    autoApproveUnder: { type: Number, default: 0 },
    requireApprovalOver: { type: Number, default: 0 },
  },
  { timestamps: true, _id: false },
);
export const PolicyModel = model<PolicyDoc>('CorporatePolicy', policySchema);

/** An employee trip request routed through the approval workflow. */
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'booked';
export interface RequestDoc {
  _id: string;
  orgId: string;
  employeeUserId: string;
  employeeEmail: string;
  vehicleId: string;
  costCenterId?: string;
  start: Date;
  end: Date;
  estimatedTotal: number;
  currency: string;
  reason?: string;
  policyFlags: string[];
  status: RequestStatus;
  decidedBy?: string;
  decisionNote?: string;
  bookingId?: string;
  createdAt: Date;
  updatedAt: Date;
}
const requestSchema = new Schema<RequestDoc>(
  {
    _id: { type: String, default: () => uuid() },
    orgId: { type: String, required: true },
    employeeUserId: { type: String, required: true },
    employeeEmail: { type: String, required: true },
    vehicleId: { type: String, required: true },
    costCenterId: String,
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    estimatedTotal: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    reason: String,
    policyFlags: { type: [String], default: [] },
    status: { type: String, default: 'pending' },
    decidedBy: String,
    decisionNote: String,
    bookingId: String,
  },
  { timestamps: true, _id: false },
);
requestSchema.index({ orgId: 1, status: 1, createdAt: -1 });
requestSchema.index({ employeeUserId: 1 });
export const RequestModel = model<RequestDoc>('CorporateRequest', requestSchema);
