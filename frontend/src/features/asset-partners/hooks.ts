'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/store';
import { ApiError } from '@/lib/api/types';
import { assetPartnerApi } from './api';

/**
 * Is the signed-in user an Asset Partner?
 *
 * Mirrors useIsHost()'s shape on purpose (see features/host/hooks.ts) — same
 * `undefined` = still deciding, `true`/`false` = a real answer — because both
 * gate the same kind of question: which dashboard does this person belong in.
 *
 * Why this has to exist at all: every Asset Partner also has a Host record
 * underneath (marketplace plumbing a Vehicle hangs off — see
 * AssetPartnerModel's own doc comment), so useIsHost() alone cannot tell a
 * self-serve host from a partner. Anywhere chrome decides "show the host
 * dashboard" has to check this too, or every partner reads as a host with
 * full self-serve tools — including Add a car, which would list a vehicle
 * with no assetPartnerId and silently bill it as a regular host booking
 * instead of running it through the partner's actual terms.
 */
export function useIsAssetPartner(): boolean | undefined {
  const status = useAuthStore((s) => s.status);
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['asset-partner-me'],
    queryFn: () => assetPartnerApi.me(),
    enabled: status === 'authenticated',
    staleTime: 60_000,
    // A 404 is a settled answer, not a blip — retrying it just spams the log.
    retry: (count, e) => !(e instanceof ApiError && e.status === 404) && count < 2,
  });
  if (status !== 'authenticated') return false;
  // Not fetched yet on this load — don't guess, same as useIsHost().
  if (isPending) return undefined;
  // 404 means no partner record (or an API without this route at all) — a real
  // "no". Returning undefined here left every caller waiting forever, which is
  // what blanked the host dashboard behind a permanent skeleton.
  if (error instanceof ApiError && error.status === 404) return false;
  // Any other failure is genuinely unknown — never guess "not a partner", or a
  // transient blip drops a partner into the self-serve host tools.
  if (isError) return undefined;
  return !!data;
}
