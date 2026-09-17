import { api } from '@/lib/api/client';

/**
 * The documents endpoint has existed on the backend with no caller at all —
 * insurance, registration and title were collected on the Asset Partner
 * application and then never surfaced or renewable anywhere.
 *
 * Always scoped server-side to the signed-in owner; passing a vehicleId
 * narrows within your own documents, it does not widen to someone else's.
 */
export type DocumentCategory =
  | 'registration'
  | 'insurance'
  | 'pollution'
  | 'fitness'
  | 'kyc'
  | 'claim';

export interface PartnerDocument {
  _id: string;
  ownerId: string;
  vehicleId?: string;
  category: DocumentCategory;
  url: string;
  key?: string;
  expiresAt?: string;
  verification?: { status: 'pending' | 'verified' | 'rejected'; verifiedAt?: string };
  createdAt: string;
}

export interface CreateDocumentInput {
  vehicleId?: string;
  category: DocumentCategory;
  url: string;
  key?: string;
  /** ISO date — surfaced as an expiry warning before the policy lapses. */
  expiresAt?: string;
}

export const documentsApi = {
  list: (vehicleId?: string) =>
    api.get<PartnerDocument[]>('/documents', vehicleId ? { vehicleId } : {}),
  create: (input: CreateDocumentInput) => api.post<PartnerDocument>('/documents', input),
};
