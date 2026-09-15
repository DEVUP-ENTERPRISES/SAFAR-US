import { z } from 'zod';

export const createContactInquirySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  phone: z.string().trim().max(20).optional(),
  interest: z.enum(['asset_partner', 'investor', 'corporate', 'general', 'other']),
  message: z.string().trim().min(5).max(2000),
});

export type CreateContactInquiryDto = z.infer<typeof createContactInquirySchema>;

export const respondContactInquirySchema = z.object({
  notes: z.string().trim().max(1000).optional(),
});
