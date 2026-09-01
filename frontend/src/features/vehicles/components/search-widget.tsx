'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, CalendarDays, Search } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useFacets } from '@/features/vehicles/hooks';
import { Select } from '@/components/ui/select';


function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * The hero search widget — Where / From / Until in one tactile card.
 * Dates are real: they flow through to the availability-aware search API,
 * so an unavailable car never shows up in the results.
 */
export function SearchWidget({ variant = 'hero' }: { variant?: 'hero' | 'inline' }) {
  const router = useRouter();
  // Cities come from live supply, so a host listing somewhere new is findable
  // the moment their car is verified — no code change, no hardcoded list.
  const facets = useFacets();
  const cities = facets.data?.cities ?? [];
  const [city, setCity] = useState('');
  const selected = city || cities[0]?.city || '';
  const [start, setStart] = useState(addDays(3));
  const [end, setEnd] = useState(addDays(6));

  const submit = () => {
    if (!selected) return;
    const qs = new URLSearchParams({ city: selected, start, end });
    router.push(`/search?${qs.toString()}`);
  };

  const isHero = variant === 'hero';

  return (
    <div
      className={cn(
        'flex w-full flex-col gap-1 rounded-2xl border bg-card p-2 sm:flex-row sm:items-center',
        isHero ? 'border-white/15 shadow-float' : 'border-border shadow-card',
      )}
    >
      <Segment icon={<MapPin className="h-4 w-4" />} label="Where">
        <Select
          value={selected}
          onChange={(e) => setCity(e.target.value)}
          disabled={cities.length === 0}
          className="w-full bg-transparent text-sm font-medium focus:outline-none disabled:opacity-60"
          aria-label="City"
        >
          {cities.length === 0 && (
            <option>{facets.isPending ? 'Loading cities…' : 'No cities available yet'}</option>
          )}
          {cities.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city} ({c.vehicles})
            </option>
          ))}
        </Select>
      </Segment>

      <Divider />

      <Segment icon={<CalendarDays className="h-4 w-4" />} label="From">
        <input
          type="date"
          value={start}
          min={addDays(0)}
          onChange={(e) => setStart(e.target.value)}
          className="w-full bg-transparent text-sm font-medium focus:outline-none"
          aria-label="Start date"
        />
      </Segment>

      <Divider />

      <Segment icon={<CalendarDays className="h-4 w-4" />} label="Until">
        <input
          type="date"
          value={end}
          min={start}
          onChange={(e) => setEnd(e.target.value)}
          className="w-full bg-transparent text-sm font-medium focus:outline-none"
          aria-label="End date"
        />
      </Segment>

      <button
        onClick={submit}
        disabled={!selected}
        className="disabled:cursor-not-allowed disabled:opacity-50 mt-2 sm:mt-0 flex h-12 w-full sm:w-auto shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <Search className="h-5 w-5" />
        <span>Search</span>
      </button>
    </div>
  );
}

function Segment({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-1 cursor-pointer items-center gap-3 rounded-xl px-4 py-2 transition-colors hover:bg-accent/60">
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {children}
      </span>
    </label>
  );
}

function Divider() {
  return <span className="hidden h-8 w-px shrink-0 bg-border sm:block" />;
}
