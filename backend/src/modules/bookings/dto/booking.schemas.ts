import { z } from 'zod';

const isoDate = z.string().datetime().or(z.coerce.date());

const deliverySchema = z
  .object({
    mode: z.enum(['airport', 'home', 'hotel', 'business']),
    address: z.string().min(3).max(300),
    lat: z.number().optional(),
    lng: z.number().optional(),
    /**
     * Airport pickups only. A terminal alone is not enough: the host needs to
     * know WHICH flight, so a delay moves the handover instead of becoming a
     * no-show — the single most common way an airport pickup goes wrong.
     */
    flightNumber: z.string().trim().min(3).max(10).optional(),
    terminal: z.string().trim().max(20).optional(),
    /** Scheduled arrival, so the host can meet the actual landing time. */
    arrivesAt: isoDate.optional(),
  })
  .refine(
    (d) => d.mode !== 'airport' || !!d.flightNumber,
    { message: 'A flight number is required for airport delivery', path: ['flightNumber'] },
  );

export const quoteSchema = z.object({
  vehicleId: z.string().min(1),
  start: isoDate,
  end: isoDate,
  couponCode: z.string().optional(),
  addOnCodes: z.array(z.string()).optional(),
  protectionPlan: z.string().optional(),
  delivery: deliverySchema.optional(),
});

/** The signed quote returned by POST /bookings/quote. */
export const priceLockSchema = z.object({
  vehicleId: z.string(),
  guestId: z.string(),
  start: z.string(),
  end: z.string(),
  total: z.number().int(),
  currency: z.string(),
  expiresAt: z.number(),
  signature: z.string(),
});

export const createBookingSchema = quoteSchema.extend({
  useWallet: z.boolean().optional(),
  /** Optional so existing clients keep working; when present it is enforced. */
  priceLock: priceLockSchema.optional(),
});

export const cancelSchema = z.object({
  reason: z.string().max(300).default('Cancelled by user'),
});

export const extendSchema = z.object({
  newEnd: isoDate,
});

export type CreateBookingDto = z.infer<typeof createBookingSchema>;
