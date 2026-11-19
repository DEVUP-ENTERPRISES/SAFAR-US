import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { CLAIMS, type Claim } from './claims';
import { DISCLOSURES, DISCLOSURES_EFFECTIVE, DISCLOSURES_VERSION, type Disclosure } from './disclosures';

export type ClaimKey = keyof typeof CLAIMS;
type ApiFigure = { label: string; display: string; value?: number; asOf?: string; kind: Claim['kind'] | 'text' };
export type DisclosureDoc = { version: number; effectiveAt: string; changeNote?: string; sections: Disclosure[] };
export type DisclosureVersion = { version: number; effectiveAt: string; changeNote: string };
export type AgreementSample = { title: string; version: number; publishedAt: string; body: string };

export const legalApi = {
  claims: () => api.get<Record<string, ApiFigure | null>>('/website/claims', undefined, false),
  disclosures: () => api.get<DisclosureDoc>('/website/disclosures', undefined, false),
  versions: () => api.get<DisclosureVersion[]>('/website/disclosures/versions', undefined, false),
  version: (n: number) => api.get<DisclosureDoc>(`/website/disclosures/${n}`, undefined, false),
  partnerAgreement: () => api.get<AgreementSample>('/legal/asset-partner-agreement', undefined, false),
};

export type SiteClaims = Record<ClaimKey, Claim>;

// Approved figures from the claims register; built-in values cover a slow or failed request, and a suspended figure is hidden.
export function useSiteClaims(): { c: SiteClaims; has: (k: ClaimKey) => boolean } {
  const q = useQuery({ queryKey: ['website-claims'], queryFn: legalApi.claims, staleTime: 5 * 60_000, retry: 1 });
  const merged: Record<string, Claim> = { ...CLAIMS };
  const hidden = new Set<string>();
  for (const [k, v] of Object.entries(q.data ?? {})) {
    if (v === null) hidden.add(k);
    else merged[k] = { label: v.label, display: v.display, value: v.value, asOf: v.asOf ?? merged[k]?.asOf ?? '', kind: v.kind === 'text' ? 'reported' : v.kind };
  }
  return { c: merged as SiteClaims, has: (k) => !hidden.has(k) };
}

const FALLBACK: DisclosureDoc = { version: Number(DISCLOSURES_VERSION.split('.')[0]), effectiveAt: DISCLOSURES_EFFECTIVE, sections: DISCLOSURES };

export function useDisclosures(): DisclosureDoc {
  const q = useQuery({ queryKey: ['website-disclosures'], queryFn: legalApi.disclosures, staleTime: 5 * 60_000, retry: 1 });
  return q.data ?? FALLBACK;
}
