import { api } from '@/lib/api/client';

export type ContactInterest = 'asset_partner' | 'investor' | 'corporate' | 'general' | 'other';

export interface CreateContactInquiryInput {
  fullName: string;
  email: string;
  phone?: string;
  interest: ContactInterest;
  message: string;
}

export const contactApi = {
  submit: (input: CreateContactInquiryInput) => api.post<{ id: string }>('/contact', input),
};
