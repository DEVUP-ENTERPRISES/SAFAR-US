import { z } from 'zod';

const isoDate = z.string().datetime().or(z.coerce.date());

const deliverySchema = z.object({
  mode: z.enum(['airport', 'home', 'hotel', 'business']),
  address: z.string().min(3).max(300),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const quoteSchema = z.object({
  vehicleId: z.string().min(1),
  start: isoDate,
  end: isoDate,
  couponCode: z.string().optional(),
  addOnCodes: z.array(z.string()).optional(),
  protectionPlan: z.string().optional(),
  delivery: deliverySchema.optional(),
});

export const createBookingSchema = quoteSchema.extend({
  useWallet: z.boolean().optional(),
});

export const cancelSchema = z.object({
  reason: z.string().max(300).default('Cancelled by user'),
});

export const extendSchema = z.object({
  newEnd: isoDate,
});

export type CreateBookingDto = z.infer<typeof createBookingSchema>;
