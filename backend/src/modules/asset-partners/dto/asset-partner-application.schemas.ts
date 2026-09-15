import { z } from 'zod';

const yn = z.enum(['yes', 'no']);

export const createApplicationSchema = z.object({
  // Step 1
  fullName: z.string().trim().min(2).max(120),
  businessName: z.string().trim().max(160).optional(),
  partnerType: z.enum(['individual', 'business', 'fleet']),
  email: z.string().trim().email(),
  phone: z.string().trim().min(7).max(20),
  address: z.string().trim().min(3).max(200),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(2).max(2),
  zip: z.string().trim().min(3).max(10),
  referral: z.string().trim().max(80).optional(),

  // Step 2
  vehicle: z.object({
    year: z.string().trim().regex(/^\d{4}$/, 'Enter a 4-digit year'),
    make: z.string().trim().min(1).max(60),
    model: z.string().trim().min(1).max(60),
    trim: z.string().trim().max(60).optional(),
    mileage: z.coerce.number().int().min(0).max(500_000),
    exteriorColor: z.string().trim().max(40).optional(),
    interiorColor: z.string().trim().max(40).optional(),
    vin: z.string().trim().length(17, 'VIN must be 17 characters'),
    plate: z.string().trim().min(2).max(20),
  }),

  // Step 3
  ownership: z.enum(['owned', 'financed', 'leased']),
  lienholder: z.string().trim().max(120).optional(),
  lienAccountLast4: z.string().trim().max(4).optional(),
  estimatedMarketValue: z.string().trim().max(40).optional(),

  // Step 4
  accident: yn,
  accidentDetail: z.string().trim().max(600).optional(),
  smokeFree: yn,
  petFree: yn,
  hasMaintenanceRecords: yn.optional(),
  photos: z
    .array(z.object({ url: z.string().url(), key: z.string().optional(), label: z.string().max(30).optional() }))
    .max(12)
    .optional(),

  // Step 5
  insurance: z.object({
    carrier: z.string().trim().min(1).max(80),
    policyNumber: z.string().trim().min(1).max(60),
    coverageType: z.enum(['full', 'liability', 'unsure']),
    policyExpiry: z.coerce.date().optional(),
  }),

  // Step 6
  availability: z.enum(['fulltime', 'parttime', 'seasonal']),
  preferredZone: z.string().trim().max(60).optional(),
  targetStartDate: z.coerce.date().optional(),
  notes: z.string().trim().max(1000).optional(),
  acknowledgedAccurate: z.literal(true, { errorMap: () => ({ message: 'Required' }) }),
  acknowledgedInspection: z.literal(true, { errorMap: () => ({ message: 'Required' }) }),
  acknowledgedTerms: z.literal(true, { errorMap: () => ({ message: 'Required' }) }),
  signature: z.string().trim().min(2).max(120),
  signDate: z.coerce.date(),
});

export type CreateApplicationDto = z.infer<typeof createApplicationSchema>;

export const reviewApplicationSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  notes: z.string().trim().max(1000).optional(),
});
