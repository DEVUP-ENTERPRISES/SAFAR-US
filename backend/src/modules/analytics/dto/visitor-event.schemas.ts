import { z } from 'zod';

export const trackVisitSchema = z.object({
  sessionId: z.string().min(8).max(64),
  path: z.string().min(1).max(300),
  referrer: z.string().max(500).optional(),
  utmSource: z.string().max(100).optional(),
  utmMedium: z.string().max(100).optional(),
  utmCampaign: z.string().max(100).optional(),
});

export type TrackVisitDto = z.infer<typeof trackVisitSchema>;
