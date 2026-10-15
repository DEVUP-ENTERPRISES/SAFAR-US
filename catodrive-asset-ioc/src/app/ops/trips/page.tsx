'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Car } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/rows';
import { TripCard } from '~/features/host/components/trip-card';
import { HostCalendar } from '~/features/host/components/host-calendar';
import { hostTripsApi } from '~/features/host/trips.api';
import { groupByDay } from '~/features/host/trip-timing';

type Tab = 'booked' | 'history' | 'calendar';

export default function HostTripsPage() {
  const [tab, setTab] = useState<Tab>('booked');
  const router = useRouter();
  // Emails and alerts link here with ?booking=; open that booking, where Accept and Decline live.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('booking');
    if (id && /^[\w-]{6,64}$/.test(id)) router.replace(`/ops/trips/${id}`);
  }, [router]);

  const booked = useQuery({
    queryKey: ['host-trips', 'booked'],
    queryFn: () => hostTripsApi.booked(),
    enabled: tab === 'booked',
  });
  const history = useQuery({
    queryKey: ['host-trips', 'history'],
    queryFn: () => hostTripsApi.history(),
    enabled: tab === 'history',
  });

  const active = tab === 'booked' ? booked : history;
  const grouped = useMemo(
    () => (active.data ? groupByDay(active.data, tab === 'booked' ? 'start' : 'end') : []),
    [active.data, tab],
  );

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Host" title="Trips" />

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'booked', label: 'Booked' },
          { key: 'history', label: 'History' },
          { key: 'calendar', label: 'Calendar' },
        ]}
      />

      {tab === 'calendar' ? (
        <HostCalendar />
      ) : active.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : !active.data || active.data.length === 0 ? (
        <EmptyState
          icon={tab === 'booked' ? <Car className="h-10 w-10" /> : <CalendarDays className="h-10 w-10" />}
          title={tab === 'booked' ? 'No upcoming trips' : 'No past trips'}
          description={
            tab === 'booked'
              ? 'When a guest books one of your cars, the trip appears here.'
              : 'Completed and cancelled trips show up here.'
          }
        />
      ) : (
        <div className="space-y-8">
          {grouped.map(([label, trips]) => (
            <section key={label}>
              <div className="mb-3 border-y border-border py-2 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {label}
              </div>
              <div className="space-y-3">
                {trips.map((t) => (
                  <TripCard key={t.bookingId} trip={t} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
