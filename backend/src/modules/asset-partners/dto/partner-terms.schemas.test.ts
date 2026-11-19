import { z } from 'zod';
import { partnerTermsShape } from './partner-terms.schemas';

const schema = z.object(partnerTermsShape);

describe('partner terms limits', () => {
  it('accepts normal terms and blank fields', () => {
    expect(schema.safeParse({ managementFeeBps: 2000, insuranceMonthlyCents: 13_700, detailingMonthlyCents: 5_000, deductibleCapCents: 100_000, maintenanceApprovalCents: 50_000, payoutDayOfMonth: 5 }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('refuses huge, negative, fractional and out-of-range values', () => {
    expect(schema.safeParse({ detailingMonthlyCents: 20_040_030_020_000 }).success).toBe(false);
    expect(schema.safeParse({ payoutDayOfMonth: 2e1345644 }).success).toBe(false);
    expect(schema.safeParse({ payoutDayOfMonth: 29 }).success).toBe(false);
    expect(schema.safeParse({ payoutDayOfMonth: 0 }).success).toBe(false);
    expect(schema.safeParse({ managementFeeBps: 5_001 }).success).toBe(false);
    expect(schema.safeParse({ insuranceMonthlyCents: -1 }).success).toBe(false);
    expect(schema.safeParse({ insuranceMonthlyCents: 100.5 }).success).toBe(false);
    expect(schema.safeParse({ deductibleCapCents: 2_500_001 }).success).toBe(false);
  });
});
