'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Star, BadgeCheck, MessageSquare, Clock, Globe, MapPin, Briefcase, ShieldCheck, CalendarX } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Skeleton } from '@/components/ui/skeleton';
import { hostApi, type HostPublicProfile } from '@/features/host/api';

export function useHostPublicProfile(hostId?: string) {
  return useQuery({
    queryKey: ['host-public', hostId],
    queryFn: () => hostApi.publicProfile(hostId!),
    enabled: !!hostId,
    staleTime: 5 * 60_000,
  });
}

/** "Joined May 2026" — month precision; the exact day is nobody's business. */
export function joinedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/** "12 min" / "about 3 hours" / "about 2 days" — a human sense of the wait. */
export function responseTimeLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `about ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `about ${days} day${days === 1 ? '' : 's'}`;
}

export function HostAvatar({
  profile,
  size = 64,
}: {
  profile: Pick<HostPublicProfile, 'displayName' | 'avatarUrl' | 'ratingAvg'>;
  size?: number;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="h-full w-full overflow-hidden rounded-full bg-muted">
        {profile.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center brand-gradient text-xl font-bold text-white/80">
            {profile.displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      {/* Only badge a rating that exists — a blank host is not a 5.0 host. */}
      {profile.ratingAvg !== null && (
        <span className="absolute -bottom-1 left-1/2 w-max -translate-x-1/2 rounded-full bg-background px-1.5 py-0.5 text-[11px] font-bold shadow-sm">
          {profile.ratingAvg.toFixed(1)} <span className="text-primary">★</span>
        </span>
      )}
    </div>
  );
}

/**
 * The "Hosted by" block on a listing. Replaces a hardcoded host — the same
 * name, trip count and rating rendered on every car regardless of who owned it.
 */
export function HostProfileCard({ hostId }: { hostId: string }) {
  const { data: h, isPending, isError } = useHostPublicProfile(hostId);

  if (isPending) return <Skeleton className="h-20 w-full max-w-sm rounded-xl" />;
  if (isError || !h) return null;

  const facts = [
    h.ratingCount > 0 && `${h.ratingCount} review${h.ratingCount === 1 ? '' : 's'}`,
    h.totalTrips > 0 && `${h.totalTrips} trip${h.totalTrips === 1 ? '' : 's'}`,
    `Joined ${joinedLabel(h.joinedAt)}`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-3">
      <Link href={`/hosts/${h._id}`} className="group flex items-center gap-4">
        <HostAvatar profile={h} />
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xl font-bold group-hover:underline">
            {h.displayName}
            {h.isSuperhost && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-primary">
                All-Star Host
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[15px] text-muted-foreground">{facts.join(' · ')}</p>
        </div>
      </Link>

      <HostTrustSignals profile={h} />
    </div>
  );
}

/** Responsiveness and verification — the things a guest actually weighs. */
export function HostTrustSignals({ profile: h }: { profile: HostPublicProfile }) {
  const verified = [
    h.verifications.identity && 'ID',
    h.verifications.email && 'email',
    h.verifications.phone && 'phone',
  ].filter(Boolean) as string[];

  const items = [
    h.responseRatePct !== null && {
      icon: MessageSquare,
      text: `${h.responseRatePct}% response rate`,
    },
    h.responseTimeMinutes !== null && {
      icon: Clock,
      text: `Responds in ${responseTimeLabel(h.responseTimeMinutes)}`,
    },
    /*
     * The question a guest is actually asking is "will I be left without a
     * car". Nobody in this market answers it, so we do — but only in the
     * direction that helps them decide: a host who reliably shows up gets the
     * credit, and a host who cancels is stated plainly rather than buried.
     */
    h.cancellationRatePct !== null &&
      (h.cancellationRatePct === 0
        ? { icon: ShieldCheck, text: 'Never cancelled a trip' }
        : { icon: CalendarX, text: `Cancels ${h.cancellationRatePct}% of trips`, warn: h.cancellationRatePct >= 10 }),
    verified.length > 0 && { icon: BadgeCheck, text: `Verified ${verified.join(', ')}` },
    h.languages.length > 0 && { icon: Globe, text: `Speaks ${h.languages.join(', ')}` },
    h.city && { icon: MapPin, text: `Lives in ${h.city}` },
    h.work && { icon: Briefcase, text: h.work },
  ].filter(Boolean) as { icon: typeof Star; text: string; warn?: boolean }[];

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
      {items.map((it) => (
        <span
          key={it.text}
          className={cn('flex items-center gap-1.5', it.warn && 'font-medium text-warning')}
        >
          <it.icon className="h-4 w-4 shrink-0" /> {it.text}
        </span>
      ))}
    </div>
  );
}
