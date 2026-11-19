import { api } from '@/lib/api/client';

export type ClaimStatus = 'draft' | 'evidence' | 'verified' | 'legal_review' | 'approved' | 'suspended';
export type ClaimFigure = { label: string; display: string; value?: number; asOf?: string; kind: 'reported' | 'forecast' | 'example' | 'text' };
export type ClaimEvidence = { _id: string; label: string; url?: string; note?: string; addedBy: string; addedAt: string };
export type ClaimEvent = { at: string; by: string; action: string; note?: string };

export interface WebsiteClaim {
  _id: string;
  key: string;
  category: string;
  owner: string;
  responsibleUserId?: string;
  wording: string;
  definition: string;
  pages: string[];
  draft: ClaimFigure;
  live: ClaimFigure | null;
  status: ClaimStatus;
  evidence: ClaimEvidence[];
  verifiedAt?: string;
  legalReviewedAt?: string;
  legalNote?: string;
  approvedAt?: string;
  firstPublishedAt?: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  history: ClaimEvent[];
  updatedAt: string;
  names?: Record<string, string>;
}

export type ClaimRules = { reviewDays: Record<string, number>; needsLegal: string[]; evidenceHint: Record<string, string>; owners: string[] };
export type DisclosureSection = { id: string; title: string; note: string; body: string[] };
export type DisclosureVersion = { _id: string; version: number; sections: DisclosureSection[]; changeNote: string; effectiveAt: string };

export type ClaimPatch = Partial<{ label: string; display: string; value: number | null; asOf: string | null; wording: string; definition: string; pages: string[]; owner: string; note: string }>;

const base = '/admin/website-claims';

export const websiteComplianceApi = {
  claims: () => api.get<WebsiteClaim[]>(base),
  rules: () => api.get<ClaimRules>(`${base}/rules`),
  claim: (key: string) => api.get<WebsiteClaim>(`${base}/${key}`),
  update: (key: string, patch: ClaimPatch) => api.patch<WebsiteClaim>(`${base}/${key}`, patch),
  addEvidence: (key: string, e: { label: string; url?: string; note?: string }) => api.post<WebsiteClaim>(`${base}/${key}/evidence`, e),
  removeEvidence: (key: string, id: string) => api.delete<WebsiteClaim>(`${base}/${key}/evidence/${id}`),
  verify: (key: string, note?: string) => api.post<WebsiteClaim>(`${base}/${key}/verify`, { note }),
  legalReview: (key: string, note: string) => api.post<WebsiteClaim>(`${base}/${key}/legal-review`, { note }),
  approve: (key: string, note?: string) => api.post<WebsiteClaim>(`${base}/${key}/approve`, { note }),
  suspend: (key: string, reason: string) => api.post<WebsiteClaim>(`${base}/${key}/suspend`, { reason }),
  reviewed: (key: string, note?: string) => api.post<WebsiteClaim>(`${base}/${key}/reviewed`, { note }),
  disclosures: () => api.get<{ current: DisclosureVersion | null; versions: { version: number; effectiveAt: string; changeNote: string }[] }>('/admin/website-disclosures'),
  publishDisclosures: (input: { sections: DisclosureSection[]; changeNote: string }) => api.post<DisclosureVersion>('/admin/website-disclosures', input),
};

export const CLAIM_STATUS: Record<ClaimStatus, { label: string; tone: 'default' | 'success' | 'warning' | 'destructive' | 'muted' }> = {
  draft: { label: 'Draft', tone: 'muted' },
  evidence: { label: 'Needs verification', tone: 'warning' },
  verified: { label: 'Ready to approve', tone: 'default' },
  legal_review: { label: 'Waiting for legal', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'destructive' },
};
