'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Car } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/rows';
import { TripCard } from '@/features/host/components/trip-card';
import { HostCalendar } from '@/features/host/components/host-calendar';
import { hostTripsApi, type HostTrip } from '@/features/host/trips.api';

type Tab = 'booked' | 'history' | 'calendar';

/** Group trips under day headings (TODAY / TOMORROW / a date) like the app does. */
function groupByDay(trips: HostTrip[], key: 'start' | 'end') {
  const groups = new Map<string, HostTrip[]>();
  for (const t of trips) {
    const d = new Date(t.period[key]);
    const label = dayLabel(d);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(t);
  }
  return [...groups.entries()];
}

function dayLabel(d: Date): string {
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (sameDay(d, today)) return 'TODAY';
  if (sameDay(d, tomorrow)) return 'TOMORROW';
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
}

export default function HostTripsPage() {
  const [tab, setTab] = useState<Tab>('booked');

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
