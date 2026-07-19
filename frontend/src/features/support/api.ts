import { api } from '@/lib/api/client';

export interface Ticket {
  _id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  messages: { authorId: string; body: string; internal: boolean; at: string }[];
  createdAt: string;
}

export const supportApi = {
  list: () => api.get<Ticket[]>('/support/tickets'),
  get: (id: string) => api.get<Ticket>(`/support/tickets/${id}`),
  create: (input: { subject: string; body: string; category?: string; priority?: string; relatedType?: string; relatedId?: string }) =>
    api.post<Ticket>('/support/tickets', input),
  reply: (id: string, body: string) => api.post<Ticket>(`/support/tickets/${id}/messages`, { body }),
};
