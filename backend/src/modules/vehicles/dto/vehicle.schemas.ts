import { z } from 'zod';

const deliverySchema = z
  .object({
    airport: z.boolean().default(false),
    home: z.boolean().default(false),
    hotel: z.boolean().default(false),
    business: z.boolean().default(false),
    radiusKm: z.number().min(0).default(0),
    fee: z.number().int().min(0).default(0),
  })
  .default({ airport: false, home: false, hotel: false, business: false, radiusKm: 0, fee: 0 });

const photoSchema = z.object({
  url: z.string().url(),
  key: z.string().optional(),
  isCover: z.boolean().optional(),
});

export const createVehicleSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1980).max(2100),
  bodyType: z.string().min(1),
  category: z.string().default('economy'),
  transmission: z.enum(['manual', 'automatic']),
  fuelType: z.enum(['petrol', 'diesel', 'hybrid', 'ev']),
  seats: z.number().int().min(1).max(60),
  /** How to find the car once you are at the pin. Self-pickup only. */
  pickup: z
    .object({
      instructions: z.string().max(600).optional(),
      spotPhotoUrl: z.string().url().optional(),
      accessCode: z.string().max(40).optional(),
    })
    .optional(),
  vin: z.string().max(32).optional(),
  registrationNumber: z.string().max(32).optional(),
  specs: z
    .object({
      doors: z.number().int().min(0).optional(),
      color: z.string().optional(),
      mileageKm: z.number().int().min(0).optional(),
      largeBags: z.number().int().min(0).optional(),
      smallBags: z.number().int().min(0).optional(),
    })
    .optional(),
  features: z.array(z.string()).default([]),
  photos: z.array(photoSchema).default([]),
  addOns: z
    .array(z.object({
      code: z.string(),
      label: z.string(),
      priceType: z.enum(['per_trip', 'per_day']),
      amount: z.number().int().min(0),
    }))
    .default([]),
  tripRules: z.array(z.string()).default([]),
  mileageLimit: z
    .object({
      perDayKm: z.number().int().min(0).default(0),
      overageFeePerKm: z.number().int().min(0).default(0),
    })
    .optional(),
  location: z.object({
    lng: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
    address: z.string().default(''),
    city: z.string().default(''),
  }),
  listing: z.object({
    title: z.string().min(3).max(120),
    description: z.string().max(2000).default(''),
    instantBook: z.boolean().default(false),
    minTripHours: z.number().int().min(1).default(24),
    turnaroundDays: z.number().int().min(0).max(7).default(0),
    maxTripHours: z.number().int().min(1).default(24 * 30),
    cancellationPolicy: z.enum(['flexible', 'moderate', 'strict']).default('moderate'),
    delivery: deliverySchema,
  }),
  pricing: z.object({
    dailyPrice: z.number().int().positive(),
    currency: z.string().length(3).default('USD'),
    cleaningFee: z.number().int().min(0).default(0),
    weekendMultiplierBps: z.number().int().min(10000).default(10000),
    weeklyDiscountBps: z.number().int().min(0).max(9000).default(0),
    monthlyDiscountBps: z.number().int().min(0).max(9000).default(0),
    earlyBirdBps: z.number().int().min(0).max(5000).default(0),
    lastMinuteBps: z.number().int().min(0).max(5000).default(0),
    dynamicPricing: z.boolean().default(false),
  }),
});

/**
 * A PATCH body — every field optional, all the way down.
 *
 * `createVehicleSchema.partial()` is NOT this: it only relaxes the top level,
 * so a patch of `{ listing: { title } }` still demanded the rest of `listing`
 * and, worse, zod filled the omitted keys with their creation defaults. Merging
 * that into the stored document silently reset the host's Instant Book,
 * cancellation policy and delivery settings every time they renamed a listing.
 *
 * Defined explicitly (no defaults anywhere) so an absent key stays absent and
 * the service's merge only ever touches what the host actually sent.
 */
export const updateVehicleSchema = z
  .object({
    make: z.string().min(1).max(60),
    model: z.string().min(1).max(60),
    year: z.number().int().min(1900).max(new Date().getFullYear() + 1),
    bodyType: z.string().min(1).max(40),
    category: z.string().min(1).max(40),
    transmission: z.enum(['manual', 'automatic']),
    fuelType: z.enum(['petrol', 'diesel', 'hybrid', 'ev']),
    seats: z.number().int().min(1).max(20),
    features: z.array(z.string()),
    pickup: z.object({
      instructions: z.string().max(600),
      spotPhotoUrl: z.string().url(),
      accessCode: z.string().max(40),
    }).partial(),
    tripRules: z.array(z.string()),
    mileageLimit: z
      .object({
        perDayKm: z.number().int().min(0),
        overageFeePerKm: z.number().int().min(0),
      })
      .partial(),
    location: z
      .object({
        lng: z.number().min(-180).max(180),
        lat: z.number().min(-90).max(90),
        address: z.string(),
        city: z.string(),
      })
      // Coordinates are a pair: half of one is not a location.
      .partial()
      .refine(
        (l) => (l.lng === undefined) === (l.lat === undefined),
        { message: 'lng and lat must be provided together' },
      ),
    listing: z
      .object({
        title: z.string().min(3).max(120),
        description: z.string().max(2000),
        instantBook: z.boolean(),
        minTripHours: z.number().int().min(1),
        maxTripHours: z.number().int().min(1),
        turnaroundDays: z.number().int().min(0).max(7),
        advanceNoticeHours: z.number().int().min(0).max(720),
        cancellationPolicy: z.enum(['flexible', 'moderate', 'strict']),
        delivery: z
          .object({
            airport: z.boolean(),
            home: z.boolean(),
            hotel: z.boolean(),
            business: z.boolean(),
            radiusKm: z.number().min(0),
            fee: z.number().int().min(0),
          })
          .partial(),
      })
      .partial(),
  })
  .partial();

export const pricingSchema = z.object({
  dailyPrice: z.number().int().positive().optional(),
  cleaningFee: z.number().int().min(0).optional(),
  weekendMultiplierBps: z.number().int().min(10000).optional(),
  weeklyDiscountBps: z.number().int().min(0).max(9000).optional(),
  monthlyDiscountBps: z.number().int().min(0).max(9000).optional(),
  earlyBirdBps: z.number().int().min(0).max(5000).optional(),
  lastMinuteBps: z.number().int().min(0).max(5000).optional(),
  dynamicPricing: z.boolean().optional(),
  promoActive: z.boolean().optional(),
  promoDiscountBps: z.number().int().min(0).max(9000).optional(),
  seasonalRules: z
    .array(
      z.object({
        label: z.string(),
        start: z.string(),
        end: z.string(),
        multiplierBps: z.number().int().min(1000).max(30000),
      }),
    )
    .optional(),
});

export const photosSchema = z.object({ photos: z.array(photoSchema).min(1) });

export type CreateVehicleDto = z.infer<typeof createVehicleSchema>;
export type PricingDto = z.infer<typeof pricingSchema>;
