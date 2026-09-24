'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import type { Attachment } from './hooks';

export interface InquiryMessage {
  _id: string;
  vehicleId: string;
  hostId: string;
  guestId: string;
  senderId: string;
  body: string;
  attachments: Attachment[];
  readBy?: string[];
  createdAt: string;
}

export interface InquiryThread {
  vehicleId: string;
  guestId: string;
  vehicle: { title: string; photo?: string };
  counterpart: { name: string; avatar?: string };
  last: { preview: string; at: string; fromMe: boolean };
  unread: number;
}

/** A guest's own pre-booking question thread on one car — poll, no socket (Turo doesn't real-time-push these either). */
export function useVehicleInquiry(vehicleId: string, myUserId?: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['inquiry', vehicleId, myUserId],
    queryFn: () => api.get<InquiryMessage[]>(`/inquiries/${vehicleId}`),
    enabled: !!vehicleId && !!myUserId,
    refetchInterval: 15_000,
  });

  const send = async (body: string, attachments: Attachment[] = []) => {
    await api.post(`/inquiries/${vehicleId}`, { body, attachments });
    qc.invalidateQueries({ queryKey: ['inquiry', vehicleId, myUserId] });
  };

  return { messages: query.data ?? [], isLoading: query.isLoading, send };
}

/** The host side of one guest's thread on one of their cars. */
export function useInquiryThread(vehicleId: string, guestId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['inquiry-thread', vehicleId, guestId],
    queryFn: () => api.get<InquiryMessage[]>(`/inquiries/${vehicleId}/${guestId}`),
    enabled: !!vehicleId && !!guestId,
    refetchInterval: 15_000,
  });

  const send = async (body: string, attachments: Attachment[] = []) => {
    await api.post(`/inquiries/${vehicleId}/${guestId}`, { body, attachments });
    qc.invalidateQueries({ queryKey: ['inquiry-thread', vehicleId, guestId] });
  };
  const markRead = () => api.post(`/inquiries/${vehicleId}/${guestId}/read`, {});

  return { messages: query.data ?? [], isLoading: query.isLoading, send, markRead };
}

/** The caller's inbox — their own threads if a guest, every guest's inquiry if a host. */
export function useInquiryInbox(enabled = true) {
  return useQuery({
    queryKey: ['inquiry-inbox'],
    queryFn: () => api.get<InquiryThread[]>('/inquiries'),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useInquiryUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: ['inquiry-unread'],
    queryFn: () => api.get<{ count: number }>('/inquiries/unread-count'),
    enabled,
    refetchInterval: 60_000,
  });
}
