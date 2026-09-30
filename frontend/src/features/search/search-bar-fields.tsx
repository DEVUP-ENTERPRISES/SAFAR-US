'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { Search, MapPin, Calendar, Clock, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatClock } from '@/lib/utils/format';
import { useFacets } from '@/features/vehicles/hooks';
import { DateRangePicker } from './date-range-picker';
import { useSearchBar } from './search-store';

// ─── Time options (30-min slots, 6 AM → 11:30 PM) ───────────────────────────

const TIMES: string[] = [];
for (let h = 6; h <= 23; h++) {
  TIMES.push(`${String(h).padStart(2, '0')}:00`);
  if (h < 23) TIMES.push(`${String(h).padStart(2, '0')}:30`);
}

/** 14:00 -> 2:00 PM, how US guests read times. */
const formatTime = formatClock;

function fmtDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

type FieldId = 'place' | 'from-date' | 'from-time' | 'until-date' | 'until-time';

// ─── Component ───────────────────────────────────────────────────────────────

export function SearchBarFields({
  variant = 'bar',
  calendarPlacement = 'overlay',
}: {
  variant?: 'bar' | 'nav';
  calendarPlacement?: 'overlay' | 'flow';
}) {
  const router = useRouter();
  const pathname = usePathname();
  const facets = useFacets();
  const cities = facets.data?.cities ?? [];
  const s = useSearchBar();
  const phone = useIsPhone();

  const [open, setOpen] = useState<FieldId | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  // Each field segment registers its button ref here so the overlay can
  // anchor directly below the clicked field, not the whole bar.
  const segRefs = useRef<Partial<Record<FieldId, HTMLButtonElement | null>>>({});

  // Lock body scroll while any panel is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (
        wrap.current &&
        !wrap.current.contains(t) &&
        !t.closest?.('[data-search-panel]')
      )
        setOpen(null);
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
  const placeLabel = s.center?.label ?? activeCity?.city ?? '';

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
  const flow = calendarPlacement === 'flow';

  // ── Shared panel renderer ──────────────────────────────────────────────────

  const renderPanel = (id: FieldId) => {
    if (open !== id) return null;
    const anchorEl = segRefs.current[id] ?? null;

    // Place picker
    if (id === 'place') {
      return (
        <Panel flow={flow} phone={phone} onClose={() => setOpen(null)} wide={false} anchorEl={anchorEl}>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Select a city
          </p>
          {cities.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {facets.isPending ? 'Loading…' : 'No cities yet.'}
            </p>
          ) : (
            <ul className="-mx-2">
              {cities.map((c) => {
                const on = (s.center?.label ?? s.city) === c.city;
                return (
                  <li key={c.city}>
                    <button
                      onClick={() => {
                        s.patch({ city: c.city, center: null });
                        setOpen('from-date');
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-start transition-colors hover:bg-muted"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{c.city}</p>
                        <p className="text-xs text-muted-foreground">
                          From{' '}
                          <span className="numeric font-medium text-foreground">
                            ${Math.round(c.fromPrice / 100)}
                          </span>{' '}
                          / day
                        </p>
                      </div>
                      {on && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      );
    }

    if (id === 'from-date' || id === 'until-date') {
      return (
        <Panel flow={flow} phone={phone} onClose={() => setOpen(null)} wide anchorEl={anchorEl}>
          <DateRangePicker
            from={s.fromDate}
            to={s.untilDate}
            onChange={(f, t) => {
              s.patch({ fromDate: f, untilDate: t });
              if (f && t) setOpen('from-time');
            }}
          />
        </Panel>
      );
    }

    if (id === 'from-time' || id === 'until-time') {
      const isFrom = id === 'from-time';
      const current = isFrom ? s.fromTime : s.untilTime;
      const onChange = (v: string) =>
        isFrom ? s.patch({ fromTime: v }) : s.patch({ untilTime: v });
      const label = isFrom ? 'Pick-up time' : 'Return time';
      const nextField: FieldId | null = isFrom ? (s.untilDate ? 'until-time' : 'until-date') : null;

      return (
        <Panel flow={flow} phone={phone} onClose={() => setOpen(null)} wide={false} anchorEl={anchorEl}>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <ul className="max-h-64 overflow-y-auto -mx-1">
            {TIMES.map((t) => (
              <li key={t}>
                <button
                  onClick={() => {
                    onChange(t);
                    if (nextField) setOpen(nextField);
                    // Last step with both dates set: run the search without a separate tap.
                    else if (s.fromDate && s.untilDate) onSearch();
                    else setOpen(null);
                  }}
                  className={cn(
                    'flex w-full items-center rounded-lg px-3 py-2 text-sm transition-colors',
                    current === t
                      ? 'bg-primary/10 font-semibold text-primary'
                      : 'hover:bg-muted text-foreground',
                  )}
                >
                  {formatTime(t)}
                  {current === t && <Check className="ms-auto h-4 w-4 text-primary" />}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      );
    }

    return null;
  };

  // ── Nav variant (compact navbar pill) ────────────────────────────────────

  if (isNav) {
    return (
      <div ref={wrap} className="relative w-full">
        <div className="flex h-[52px] w-full items-stretch divide-x divide-border/50 rounded-full border border-border/50 bg-card">
          <Seg
            id="place"
            icon={<MapPin className="h-3.5 w-3.5" />}
            label="Where"
            value={placeLabel || 'Anywhere'}
            open={open === 'place'}
            onOpen={() => setOpen(open === 'place' ? null : 'place')}
            grow
          />
          <Seg
            id="from-date"
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="From"
            value={s.fromDate ? `${fmtDate(s.fromDate)} ${formatTime(s.fromTime)}` : 'Add dates'}
            open={open === 'from-date'}
            onOpen={() => setOpen(open === 'from-date' ? null : 'from-date')}
          />
          <Seg
            id="until-date"
            icon={<Calendar className="h-3.5 w-3.5" />}
            label="Until"
            value={s.untilDate ? `${fmtDate(s.untilDate)} ${formatTime(s.untilTime)}` : 'Add dates'}
            open={open === 'until-date'}
            onOpen={() => setOpen(open === 'until-date' ? null : 'until-date')}
          />
          <div className="flex items-center pe-1 ps-2">
            <button
              onClick={onSearch}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-all hover:brightness-110 active:scale-95"
              aria-label="Search"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
        </div>
        {renderPanel('place')}
        {renderPanel('from-date')}
        {renderPanel('until-date')}
        {renderPanel('from-time')}
        {renderPanel('until-time')}
      </div>
    );
  }

  // ── Bar variant (hero + search page) ─────────────────────────────────────
  // Turo layout: Where | From date | From time | Until date | Until time | 🔍
  // Single horizontal pill on sm+, stacked on mobile.

  return (
    <div ref={wrap} className="w-full" data-search-root>
      <div
        className={cn(
          'flex items-stretch bg-card',
          'flex-col overflow-hidden rounded-2xl border border-border/50 shadow-2xl',
          'sm:h-[72px] sm:flex-row sm:rounded-full',
        )}
      >
        {/* Where */}
        <Seg
          id="place"
          segRefs={segRefs}
          icon={<MapPin className="h-4 w-4" />}
          label="Place"
          value={placeLabel}
          placeholder="Where are you going?"
          open={open === 'place'}
          onOpen={() => setOpen(open === 'place' ? null : 'place')}
          grow
          divider
          bar
        />

        {/* From date */}
        <Seg
          id="from-date"
          segRefs={segRefs}
          icon={<Calendar className="h-4 w-4" />}
          label="Pickup date"
          value={s.fromDate ? fmtDate(s.fromDate) : ''}
          placeholder="Add date"
          open={open === 'from-date'}
          onOpen={() => setOpen(open === 'from-date' ? null : 'from-date')}
          divider
          bar
        />

        {/* From time */}
        <Seg
          id="from-time"
          segRefs={segRefs}
          icon={<Clock className="h-4 w-4" />}
          label="Pickup time"
          value={s.fromDate ? formatTime(s.fromTime) : ''}
          placeholder="10:00 AM"
          open={open === 'from-time'}
          onOpen={() => setOpen(open === 'from-time' ? null : 'from-time')}
          divider
          bar
        />

        {/* Until date */}
        <Seg
          id="until-date"
          segRefs={segRefs}
          icon={<Calendar className="h-4 w-4" />}
          label="Return date"
          value={s.untilDate ? fmtDate(s.untilDate) : ''}
          placeholder="Add date"
          open={open === 'until-date'}
          onOpen={() => setOpen(open === 'until-date' ? null : 'until-date')}
          divider
          bar
        />

        {/* Until time */}
        <Seg
          id="until-time"
          segRefs={segRefs}
          icon={<Clock className="h-4 w-4" />}
          label="Return time"
          value={s.untilDate ? formatTime(s.untilTime) : ''}
          placeholder="10:00 AM"
          open={open === 'until-time'}
          onOpen={() => setOpen(open === 'until-time' ? null : 'until-time')}
          bar
        />

        {/* Search */}
        <div className="flex items-center p-2.5 sm:pe-2.5">
          <button
            onClick={onSearch}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-bold text-primary-foreground transition-all hover:brightness-110 active:scale-95 sm:h-12 sm:w-12"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
            <span className="sm:hidden">Search</span>
          </button>
        </div>
      </div>

      {/* Panels */}
      {renderPanel('place')}
      {renderPanel('from-date')}
      {renderPanel('from-time')}
      {renderPanel('until-date')}
      {renderPanel('until-time')}
    </div>
  );
}

// ─── Seg (field segment) ─────────────────────────────────────────────────────

function Seg({
  id, segRefs, icon, label, value, placeholder, open, onOpen, grow, divider, bar,
}: {
  id: FieldId;
  segRefs?: React.MutableRefObject<Partial<Record<FieldId, HTMLButtonElement | null>>>;
  icon: React.ReactNode;
  label: string;
  value: string;
  placeholder?: string;
  open: boolean;
  onOpen: () => void;
  grow?: boolean;
  divider?: boolean;
  bar?: boolean;
}) {
  return (
    <button
      type="button"
      ref={segRefs ? (el) => { segRefs.current[id] = el; } : undefined}
      onClick={onOpen}
      aria-expanded={open}
      className={cn(
        'flex min-w-0 items-center gap-2 text-start transition-colors',
        grow ? 'flex-1' : '',
        bar
          ? cn(
              'px-5 py-4 sm:py-0',
              divider && 'border-b border-border/50 sm:border-b-0 sm:border-r sm:border-border/40',
              open ? 'bg-muted/40' : 'hover:bg-muted/20',
            )
          : cn('h-full px-3', open ? 'bg-muted/50' : 'hover:bg-muted/30'),
      )}
    >
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0">
        <span
          className={cn(
            'block font-bold uppercase tracking-[0.13em] text-muted-foreground',
            bar ? 'text-[10px]' : 'text-[8px]',
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            'block truncate font-semibold leading-tight',
            bar ? 'text-sm' : 'text-xs',
            value ? 'text-foreground' : 'text-muted-foreground/55',
          )}
        >
          {value || placeholder || '—'}
        </span>
      </span>
    </button>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────────

function Panel({
  children, flow, phone, onClose, wide, anchorEl,
}: {
  children: React.ReactNode;
  flow: boolean;
  phone: boolean;
  onClose: () => void;
  wide: boolean;
  anchorEl: HTMLElement | null;
}) {
  if (phone) {
    return createPortal(
      <>
        <div className="fixed inset-0 z-[90] bg-black/50" onClick={onClose} aria-hidden />
        <div
          data-search-panel
          data-lenis-prevent
          role="dialog"
          aria-modal="true"
          className="fixed inset-x-0 bottom-0 z-[91] max-h-[calc(100dvh-3rem)] overflow-y-auto overscroll-contain rounded-t-3xl border-t border-border bg-card p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl"
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden />
          {children}
        </div>
      </>,
      document.body,
    );
  }

  if (!flow) {
    return createPortal(
      <PortaledOverlay onClose={onClose} wide={wide} anchorEl={anchorEl}>
        {children}
      </PortaledOverlay>,
      document.body,
    );
  }

  return (
    <div
      data-search-panel
      role="dialog"
      className={cn(
        'z-50 mt-3 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-5 shadow-2xl ring-1 ring-black/5',
        'max-h-[min(36rem,calc(100dvh-8rem))]',
        wide ? 'w-fit' : 'min-w-[16rem] w-[min(22rem,calc(100vw-2rem))]',
      )}
    >
      {children}
    </div>
  );
}

// ─── PortaledOverlay ─────────────────────────────────────────────────────────
// Rendered into document.body so it never shifts any parent layout.
// Measures the search bar wrapper and positions the panel centered below it.

function PortaledOverlay({
  children, onClose, wide, anchorEl,
}: {
  children: React.ReactNode;
  onClose: () => void;
  wide: boolean;
  anchorEl: HTMLElement | null;
}) {
  const [style, setStyle] = useState<React.CSSProperties>({ opacity: 0 });

  const reposition = useCallback(() => {
    const anchor = anchorEl ?? (document.querySelector('[data-search-root]') as HTMLElement | null);
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const panelW = wide
      ? Math.min(680, window.innerWidth - 16)
      : Math.min(320, window.innerWidth - 16);
    // Centre under the anchor, clamped to viewport
    const left = Math.max(8, Math.min(
      rect.left + rect.width / 2 - panelW / 2,
      window.innerWidth - panelW - 8,
    ));
    setStyle({
      position: 'fixed',
      top: rect.bottom + 8,
      left,
      width: panelW,
      zIndex: 9999,
      opacity: 1,
    });
  }, [anchorEl, wide]);

  useEffect(() => {
    reposition();
    window.addEventListener('scroll', reposition, { passive: true });
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition);
      window.removeEventListener('resize', reposition);
    };
  }, [reposition]);

  return createPortal(
    <>
      {/* Full-screen backdrop — prevents scroll, closes on click */}
      <div
        className="fixed inset-0 z-[9998]"
        style={{ touchAction: 'none' }}
        onClick={onClose}
        aria-hidden
      />
      <div
        data-search-panel
        data-lenis-prevent
        role="dialog"
        aria-modal="true"
        style={style}
        className="max-h-[min(42rem,calc(100dvh-8rem))] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-5 shadow-2xl transition-opacity duration-100"
      >
        {children}
      </div>
    </>,
    document.body,
  );
}

// ─── useIsPhone ───────────────────────────────────────────────────────────────

function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return phone;
}
