'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Store, Check } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useHostMe, useOnboardHost, isNotAHost } from '@/features/host/hooks';
import { useIsAssetPartner } from '@/features/asset-partners/hooks';
import { HostSidebar } from '@/features/host/components/host-sidebar';

function HostShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const hostQuery = useHostMe();
  const isAssetPartner = useIsAssetPartner();
  const onboard = useOnboardHost();
  const [displayName, setDisplayName] = useState('');

  const notAHost = isNotAHost(hostQuery.error);

  /*
   * An Asset Partner always has a Host record underneath — it is the
   * marketplace-seller plumbing a Vehicle hangs off (see AssetPartnerModel's
   * doc comment) — so hostQuery succeeds for them exactly like it does for a
   * genuine self-serve host, and without this check they land in the full
   * self-serve shell below: Listings, Fleet, Operations, Captains.
   *
   * That is not just the wrong dashboard, it is a real data-integrity hole:
   * "Add a car" here creates a Vehicle with no assetPartnerId, which bills as
   * an ordinary host booking instead of running through the partner's actual
   * management fee, insurance and detailing terms. Redirect before any of
   * that renders, rather than only hiding the nav links to this route — a
   * partner who already knows the URL (or bookmarked it) must still be routed
   * away.
   */
  useEffect(() => {
    if (isAssetPartner) router.replace('/asset-partners/dashboard');
  }, [isAssetPartner, router]);

  if (isAssetPartner || isAssetPartner === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  // Still deciding. `isPending` covers the first load; `isFetching` covers a
  // revalidation after a cached error — without it, React Query reports the old
  // error instantly and an existing host sees the signup screen flash.
  if (hostQuery.isPending || (hostQuery.isError && hostQuery.isFetching)) {
    return <Skeleton className="h-64 w-full" />;
  }

  // A real failure (network / 5xx / expired session) is NOT "you're not a host".
  // Say so and offer a retry instead of rendering an empty dashboard.
  if (hostQuery.isError && !notAHost) {
    return (
      <ErrorState
        message="Couldn't load your host profile. Check your connection and try again."
        retry={() => hostQuery.refetch()}
      />
    );
  }

  // Confirmed not a host → onboarding.
  if (notAHost) {
    return (
      <div className="mx-auto grid max-w-5xl items-center gap-10 py-8 lg:grid-cols-2">
        {/* Pitch */}
        <div className="space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-primary">
            <Store className="h-4 w-4" /> Hosting on CatoDrive
          </span>
          <h1 className="display text-5xl leading-[1.05] sm:text-6xl lg:text-7xl">
            Your car can pay
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-muted-foreground to-muted-foreground/40">for itself.</span>
          </h1>
          <p className="max-w-md text-xl leading-relaxed text-muted-foreground font-medium">
            List in minutes, set your own price, and keep control of your calendar. Set-up takes
            about a minute.
          </p>
          <ul className="space-y-4 pt-4">
            {[
              'You set the price — or let Smart Price do it for you',
              'Cash out instantly, or on the standard payout schedule',
              'Every guest is verified before they can book',
            ].map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Form */}
        <Card className="rounded-[2.5rem] shadow-soft bg-card/80 backdrop-blur border-border/50">
          <CardHeader>
            <CardTitle>Become a CatoDrive host</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Display name" htmlFor="dn" hint="Shown to guests on your listings.">
              <Input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </Field>
            <Button
              className="w-full"
              size="lg"
              disabled={!displayName}
              loading={onboard.isPending}
              onClick={() => onboard.mutate(displayName)}
            >
              Start hosting
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Free to list. You only pay when you earn.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    /*
     * No pb-24 here. It used to reserve clearance for PanelSidebar's own
     * mobile bar, back when HostSidebar rendered one — now that it's
     * suppressed (showMobileNav={false} on HostSidebar, since
     * HostMobileTabBar already covers this route), the only bottom bar left
     * is HostMobileTabBar, which reserves its own clearance via its own
     * spacer div (see host-mobile-tab-bar.tsx). Keeping pb-24 on top of that
     * would just be redundant padding stacked under redundant padding.
     */
    <div className="flex gap-8">
      <HostSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function HostLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Login is public; /host/bridge must render bare too — it's the page that
  // STORES the session, so guarding it would bounce it before it can run.
  if (pathname === '/host/login' || pathname === '/host/bridge') return <>{children}</>;
  return (
    <AuthGuard loginPath="/host/login">
      <HostShell>{children}</HostShell>
    </AuthGuard>
  );
}
