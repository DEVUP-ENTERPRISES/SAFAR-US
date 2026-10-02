import { api } from '@/lib/api/client';

export type TripPaper = 'registration' | 'insurance';

export type TripDocumentsStatus =
  | { live: false; viewSeconds: number }
  | {
      live: true;
      viewSeconds: number;
      requestedAt: string | null;
      documents: { category: TripPaper; label: string; available: boolean; expired: boolean }[];
    };

export interface TripDocumentsView {
  token: string;
  expiresAt: string;
  viewSeconds: number;
  documents: { id: string; category: TripPaper; label: string }[];
}

export interface TripDocumentFile {
  category: TripPaper;
  contentType: 'image/jpeg' | 'application/pdf';
  data: string;
  expiresAt: string;
}

const base = (bookingId: string) => `/trips/booking/${bookingId}/documents`;

export const tripDocumentsApi = {
  status: (bookingId: string) => api.get<TripDocumentsStatus>(base(bookingId)),
  open: (bookingId: string) => api.post<TripDocumentsView>(`${base(bookingId)}/open`),
  file: (bookingId: string, documentId: string, token: string) =>
    api.post<TripDocumentFile>(`${base(bookingId)}/${documentId}/file`, { token }),
  request: (bookingId: string) =>
    api.post<{ requestedAt: string; missing: TripPaper[]; alerted: boolean }>(`${base(bookingId)}/request`),
  history: (bookingId: string) => api.get<{ action: 'opened' | 'requested'; at: string }[]>(`${base(bookingId)}/history`),
};
