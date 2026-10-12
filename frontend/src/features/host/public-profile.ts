import { useQuery } from '@tanstack/react-query';
import { hostApi } from './api';

export function useHostPublicProfile(hostId?: string) {
  return useQuery({
    queryKey: ['host-public', hostId],
    queryFn: () => hostApi.publicProfile(hostId!),
    enabled: !!hostId,
    staleTime: 5 * 60_000,
  });
}

/** "Joined May 2026" - month precision; the exact day is nobody's business. */
export function joinedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "12 min" / "about 3 hours" / "about 2 days" - a human sense of the wait. */
export function responseTimeLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `about ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `about ${days} day${days === 1 ? '' : 's'}`;
}
