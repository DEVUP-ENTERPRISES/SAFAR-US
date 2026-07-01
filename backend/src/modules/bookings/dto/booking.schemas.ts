import { z } from 'zod';

const isoDate = z.string().datetime().or(z.coerce.date());

export const quoteSchema = z.object({
  vehicleId: z.string().min(1),
  start: isoDate,
  end: isoDate,
  couponCode: z.string().optional(),
});

export const createBookingSchema = quoteSchema;

export const cancelSchema = z.object({
  reason: z.string().max(300).default('Cancelled by user'),
});

export const extendSchema = z.object({
  newEnd: isoDate,
});

export type CreateBookingDto = z.infer<typeof createBookingSchema>;
