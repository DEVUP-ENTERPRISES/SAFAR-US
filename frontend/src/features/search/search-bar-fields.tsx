'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search, MapPin, CalendarDays, User, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useFacets } from '@/features/vehicles/hooks';
import { DateRangePicker } from './date-range-picker';
import { useSearchBar } from './search-store';

/**
 * The search bar.
 *
 * Rebuilt off native controls entirely. It previously used <input type="date">,
 * <input type="time"> and a <select>, all of which the OS draws — so the bar
 * showed "dd-mm-yyyy" placeholders and a blue system dropdown that belonged to
 * no design system at all. The old code's own comment said it was "customizing
 * native inputs to look premium", which is not possible: the picker is chrome,
 * not content.
 *
 * It also had TWO location inputs stacked — a free-text search and a city
 * select — so the same city appeared twice and it was unclear which one the
 * search actually used.
 *
 * Now: one location field, one range calendar, one age control, each in its own
 * popover, all styled by us.
 */

const TIMES = ['08:00', '09:00', '10:00', '11:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

/** Age bands, because the exact number only matters at two thresholds. */
const AGE_BANDS = [
  { value: '19', label: '18–20', note: 'Fewest cars available' },
  { value: '23', label: '21–24', note: 'Young-driver fee may apply' },
  { value: '30', label: '25 or over', note: 'All cars available' },
];

export function SearchBarFields({ variant = 'bar' }: { variant?: 'bar' | 'nav' }) {
  const router = useRouter();
  const pathname = usePathname();
  const facets = useFacets();
  const cities = facets.data?.cities ?? [];
  const s = useSearchBar();

  const [open, setOpen] = useState<'where' | 'when' | 'who' | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  // Close on an outside click or Escape — a popover that traps you feels broken.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const activeCity = cities.find((c) => c.city === s.city) ?? cities[0];
  const cityLabel = s.center?.label ?? activeCity?.city ?? 'Anywhere';
  const band = AGE_BANDS.find((b) => Number(s.age) >= 25 ? b.value === '30' : Number(s.age) >= 21 ? b.value === '23' : b.value === '19');

  const onSearch = () => {
    setOpen(null);
    if (pathname !== '/search') {
      const qs = new URLSearchParams();
      if (s.city) qs.set('city', s.city);
      if (s.fromDate) qs.set('start', s.fromDate);
      if (s.untilDate) qs.set('end', s.untilDate);
      router.push(`/search?${qs.toString()}`);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isNav = variant === 'nav';
  const fmt = (d: string) =>
    d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Add dates';

  return (
    <div ref={wrap} className="relative w-full">
      <div
        className={cn(
          'flex items-stretch bg-card transition-shadow',
          isNav
            ? 'h-[52px] w-full divide-x divide-border/50 rounded-full border border-border/50'
            : 'flex-col rounded-[1.75rem] border border-border/50 shadow-xl lg:h-[72px] lg:flex-row lg:divide-x lg:divide-border/50 lg:rounded-full lg:p-1.5',
        )}
      >
        <Field
          open={open === 'where'}
          onOpen={() => setOpen(open === 'where' ? null : 'where')}
          icon={<MapPin className="h-4 w-4" />}
          label="Where"
          value={cityLabel}
          nav={isNav}
          grow
        />
        <Field
          open={open === 'when'}
          onOpen={() => setOpen(open === 'when' ? null : 'when')}
          icon={<CalendarDays className="h-4 w-4" />}
          label="When"
          value={s.fromDate && s.untilDate ? `${fmt(s.fromDate)} — ${fmt(s.untilDate)}` : 'Add dates'}
          nav={isNav}
          grow
        />
        <Field
          open={open === 'who'}
          onOpen={() => setOpen(open === 'who' ? null : 'who')}
          icon={<User className="h-4 w-4" />}
          label="Driver age"
          value={band?.label ?? '25 or over'}
          nav={isNav}
          className={isNav ? 'hidden md:flex' : ''}
        />

        <div className={cn('flex items-center', isNav ? 'ps-3 pe-1' : 'p-3 lg:p-0 lg:pe-1')}>
          <button
            onClick={onSearch}
            className={cn(
              'flex items-center justify-center gap-2 rounded-full bg-primary font-bold text-primary-foreground',
              'transition-all hover:brightness-110 active:scale-95',
              isNav ? 'h-9 px-5 text-sm' : 'h-13 w-full py-3.5 text-base lg:h-14 lg:w-14 lg:p-0',
            )}
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
            <span className={isNav ? '' : 'lg:hidden'}>Search</span>
          </button>
        </div>
      </div>

      {/* ── Popovers ── */}
      {open === 'where' && (
        <Panel>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Cities with cars</p>
          {cities.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              {facets.isPending ? 'Loading…' : 'No cars listed yet.'}
            </p>
          ) : (
            <ul className="-mx-2">
              {cities.map((c) => {
                const on = (s.center?.label ?? activeCity?.city) === c.city;
                return (
                  <li key={c.city}>
                    <button
                      onClick={() => { s.patch({ city: c.city, center: null }); setOpen('when'); }}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-start transition-colors hover:bg-muted"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{c.city}</span>
                        {/* The price is what someone picks a city on. A raw
                            count answers a question nobody asked, and a "1"
                            beside a city reads as an empty marketplace. */}
                        <span className="block text-xs text-muted-foreground">
                          From <span className="numeric font-medium text-foreground">${Math.round(c.fromPrice / 100)}</span> a day
                        </span>
                      </span>
                      {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {open === 'when' && (
        <Panel>
          <DateRangePicker
            from={s.fromDate}
            to={s.untilDate}
            onChange={(f, t) => s.patch({ fromDate: f, untilDate: t })}
          />
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-3">
            <TimeField label="Pick-up" value={s.fromTime} onChange={(v) => s.patch({ fromTime: v })} />
            <TimeField label="Return" value={s.untilTime} onChange={(v) => s.patch({ untilTime: v })} />
          </div>
        </Panel>
      )}

      {open === 'who' && (
        <Panel>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Driver age</p>
          {/* Bands rather than a number field: the exact age only matters at two
              thresholds, and each band says what it actually changes. */}
          <div className="-mx-2">
            {AGE_BANDS.map((b) => {
              const on = band?.value === b.value;
              return (
                <button
                  key={b.value}
                  onClick={() => { s.patch({ age: b.value }); setOpen(null); }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-start transition-colors',
                    on ? 'bg-primary/5' : 'hover:bg-muted',
                  )}
                >
                  <span>
                    <span className="block font-medium">{b.label}</span>
                    <span className="block text-xs text-muted-foreground">{b.note}</span>
                  </span>
                  {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Field({
  open, onOpen, icon, label, value, nav, grow, className,
}: {
  open: boolean; onOpen: () => void; icon: React.ReactNode; label: string;
  value: string; nav: boolean; grow?: boolean; className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      className={cn(
        'flex min-w-0 items-center gap-2.5 text-start transition-colors',
        grow && 'flex-1',
        nav ? 'h-full px-4' : 'px-5 py-3 lg:py-0',
        // The open segment lifts out of the bar so it is obvious which popover
        // belongs to which field.
        open ? 'rounded-full bg-muted' : 'hover:bg-muted/60 rounded-full',
        className,
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <span className={cn('block font-bold uppercase tracking-[0.14em] text-muted-foreground', nav ? 'text-[9px]' : 'text-[10px]')}>
          {label}
        </span>
        <span className={cn('block truncate font-semibold', nav ? 'text-sm' : 'text-[15px]')}>{value}</span>
      </span>
    </button>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-x-0 top-full z-50 mt-2 rounded-2xl border border-border bg-card p-4 shadow-2xl sm:inset-x-auto sm:start-0 sm:w-auto sm:min-w-[22rem]">
      {children}
    </div>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {TIMES.map((t) => (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={cn(
              'rounded-lg px-2 py-1 text-xs font-medium transition-colors',
              value === t ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/70',
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
