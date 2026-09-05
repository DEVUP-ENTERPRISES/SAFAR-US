'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils/cn';
import type { Vehicle } from '@/features/vehicles/types';

/**
 * The availability calendar.
 *
 * The version this replaces showed one month with no way to reach the next,
 * two flat colours, and no prices — so it answered "is the 14th free?" and
 * nothing else. Three things a guest actually needs, that it did not give:
 *
 *  1. WHAT A NIGHT COSTS. This platform prices weekends, seasons and lead time
 *     differently, and the guest could not see any of it until checkout. The
 *     rate is stated above the grid, computed from the same rules the quote
 *     uses, with the peak named when nights differ.
 *
 *     It is deliberately NOT printed into every cell. A figure repeated across
 *     thirty squares is chrome, not information — it competes with the shape
 *     the grid exists to show, and it forces each cell tall enough to stack two
 *     lines. Premium nights get a dot; the exact figure is a hover away, and
 *     the total for a selected range appears under the grid.
 *
 *  2. WHICH FREE DAYS ARE ACTUALLY BOOKABLE. A two-night hole between two
 *     trips is free, and useless, when the host's minimum is three nights.
 *     Every competitor paints that green and lets the guest discover it at
 *     checkout. Those runs are marked as too short, up front.
 *
 *  3. WHERE THE GOOD WINDOWS ARE. The longest open run and the cheapest night
 *     in view are stated, because scanning a grid for them is work the page
 *     should do.
 *
 * Selecting a range writes straight into the booking form.
 */

type DayState = 'past' | 'booked' | 'notice' | 'short' | 'open';

interface Day {
  key: string;
  date: Date;
  dom: number;
  state: DayState;
  priceCents: number;
  /** Length of the free run this day belongs to, in nights. */
  runLength: number;
}

const MS_DAY = 86_400_000;
const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const money = (c: number) => `$${Math.round(c / 100)}`;

export function AvailabilityCalendar({
  occupied,
  vehicle,
  onPick,
}: {
  occupied: { dayKey: string; state: string }[];
  vehicle: Vehicle;
  /** Fires with ISO datetimes when a full range is chosen. */
  onPick?: (startIso: string, endIso: string) => void;
}) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  const busy = useMemo(
    () => new Set(occupied.filter((o) => ['booked', 'blocked', 'held'].includes(o.state)).map((o) => o.dayKey)),
    [occupied],
  );

  const p = vehicle.pricing;
  const minNights = Math.max(1, Math.ceil((vehicle.listing?.minTripHours ?? 24) / 24));
  const noticeHours = vehicle.listing?.advanceNoticeHours ?? 0;

  /**
   * A night's price, from the same levers the backend quote uses. Not a
   * promise — the quote is authoritative and says so below — but a good-faith
   * figure beats no figure, which is what the guest had before.
   */
  const priceFor = (d: Date): number => {
    let cents = p.dailyPrice;
    const dow = d.getDay();
    if ((dow === 5 || dow === 6) && p.weekendMultiplierBps) {
      cents = Math.round((cents * p.weekendMultiplierBps) / 10_000);
    }
    for (const r of p.seasonalRules ?? []) {
      const s = new Date(r.start).getTime();
      const e = new Date(r.end).getTime();
      if (d.getTime() >= s && d.getTime() <= e) cents = Math.round((cents * r.multiplierBps) / 10_000);
    }
    if (p.promoActive && p.promoDiscountBps) {
      cents = Math.round(cents * (1 - p.promoDiscountBps / 10_000));
    }
    return cents;
  };

  const { days, monthLabel, cheapest, longestRun, longestFrom, baseline, varies, peak } = useMemo(() => {
    const now = new Date();
    const cursor = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const bookableFrom = now.getTime() + noticeHours * 3_600_000;

    const list: Day[] = [];
    for (let dom = 1; dom <= daysInMonth; dom += 1) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), dom);
      const key = keyOf(date);
      let state: DayState = 'open';
      if (date.getTime() < todayMid) state = 'past';
      else if (busy.has(key)) state = 'booked';
      // A day inside the host's notice window is free but not offerable —
      // distinct from "someone booked it", because the reason differs.
      else if (date.getTime() + MS_DAY <= bookableFrom) state = 'notice';
      list.push({ key, date, dom, state, priceCents: priceFor(date), runLength: 0 });
    }

    // Measure each free run so runs shorter than the minimum can be called out.
    // The run is measured across the month boundary conservatively: a run
    // touching an edge is not marked short, since it may continue.
    let i = 0;
    while (i < list.length) {
      if (list[i].state !== 'open') { i += 1; continue; }
      let j = i;
      while (j < list.length && list[j].state === 'open') j += 1;
      const len = j - i;
      const touchesEdge = i === 0 || j === list.length;
      for (let k = i; k < j; k += 1) {
        list[k].runLength = len;
        if (len < minNights && !touchesEdge) list[k].state = 'short';
      }
      i = j;
    }

    const openDays = list.filter((d) => d.state === 'open');
    const best = openDays.reduce<Day | null>((a, d) => (!a || d.priceCents < a.priceCents ? d : a), null);

    /*
     * The baseline is the most common nightly rate in view, not the lowest.
     * Using the minimum would mark a whole month as "more expensive" the moment
     * one promo night appeared, which is the opposite of useful — the guest
     * wants to know what the normal night costs and which ones break from it.
     */
    const tally = new Map<number, number>();
    for (const d of openDays) tally.set(d.priceCents, (tally.get(d.priceCents) ?? 0) + 1);
    let modal = p.dailyPrice;
    let modalCount = -1;
    for (const [cents, count] of tally) {
      if (count > modalCount) { modal = cents; modalCount = count; }
    }
    const differing = openDays.some((d) => d.priceCents !== modal);
    const dearest = openDays.reduce((m, d) => Math.max(m, d.priceCents), modal);
    const longest = openDays.reduce((m, d) => Math.max(m, d.runLength), 0);
    const longestStart = openDays.find((d) => d.runLength === longest);

    return {
      days: list,
      monthLabel: cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      cheapest: best,
      longestRun: longest,
      longestFrom: longestStart,
      baseline: modal,
      varies: differing,
      peak: dearest,
      // eslint-disable-next-line react-hooks/exhaustive-deps
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthOffset, busy, minNights, noticeHours, p.dailyPrice, p.weekendMultiplierBps, p.promoActive, p.promoDiscountBps]);

  const leadPad = days.length ? days[0].date.getDay() : 0;

  // Provisional range while the second click is pending.
  const preview = anchor && hover ? [anchor, hover].sort() : null;
  const inPreview = (k: string) => !!preview && k >= preview[0] && k <= preview[1];
  const inRange = (k: string) => !!range && k >= range.from && k <= range.to;

  const select = (d: Day) => {
    if (d.state !== 'open') return;
    if (!anchor) {
      setAnchor(d.key);
      setRange(null);
      return;
    }
    const [from, to] = [anchor, d.key].sort();
    // Refuse a range that crosses anything unbookable — silently accepting it
    // and failing at checkout is the behaviour this calendar exists to end.
    const crosses = days.some((x) => x.key >= from && x.key <= to && x.state !== 'open');
    if (crosses) { setAnchor(d.key); return; }
    setRange({ from, to });
    setAnchor(null);
    onPick?.(`${from}T10:00`, `${to}T10:00`);
  };

  const selected = range ? days.filter((d) => d.key >= range.from && d.key <= range.to) : [];
  const nights = Math.max(0, selected.length - 1);
  const subtotal = selected.slice(0, -1).reduce((s, d) => s + d.priceCents, 0);

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        {/* Month navigation — the previous calendar had none at all, so a trip
            in the following month was invisible. */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setMonthOffset((m) => Math.max(0, m - 1))}
            disabled={monthOffset === 0}
            className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-muted disabled:opacity-30"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="display text-lg">{monthLabel}</p>
          <button
            onClick={() => setMonthOffset((m) => Math.min(11, m + 1))}
            disabled={monthOffset === 11}
            className="grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-muted disabled:opacity-30"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/*
          A price on every cell is only information when the prices differ.
          This platform prices most cars flat, so the grid was repeating the
          same number thirty times — thirty pieces of chrome carrying one fact,
          which also forced every cell tall enough to stack two lines and made
          the whole calendar unusable on a phone.

          The rule is now: say the rate once, above the grid, and mark only the
          nights that depart from it. Variation becomes visible instead of being
          buried in uniformity, and a flat month reads as a clean grid of days.
        */}
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>
            <span className="numeric font-semibold text-foreground">{money(baseline)}</span> a night
          </span>
          {varies && peak > baseline && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-1 w-1 rounded-full bg-warning" />
                up to <span className="numeric font-semibold text-warning">{money(peak)}</span> on
                busier nights
              </span>
            </>
          )}
        </p>

        <div className="mt-3 grid grid-cols-7 gap-1 sm:gap-1.5">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="pb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {d}
            </div>
          ))}
          {Array.from({ length: leadPad }).map((_, i) => <div key={`pad${i}`} />)}

          {days.map((d) => {
            const open = d.state === 'open';
            const marked = inRange(d.key) || inPreview(d.key);
            const isCheapest = open && cheapest?.key === d.key && !marked;
            return (
              <button
                key={d.key}
                type="button"
                disabled={!open}
                onClick={() => select(d)}
                onMouseEnter={() => anchor && setHover(d.key)}
                title={
                  d.state === 'booked' ? 'Already booked'
                    : d.state === 'notice' ? 'Too soon — this host needs more notice'
                      : d.state === 'short' ? `Only ${d.runLength} night${d.runLength === 1 ? '' : 's'} free here; minimum is ${minNights}`
                        : d.state === 'past' ? 'In the past'
                          : `${money(d.priceCents)} a night`
                }
                className={cn(
                  'flex h-11 flex-col items-center justify-center rounded-lg border text-sm transition-all sm:h-12 sm:rounded-xl',
                  open && !marked && 'border-border bg-card hover:border-primary hover:shadow-sm',
                  marked && 'border-primary bg-primary text-primary-foreground shadow-sm',
                  d.state === 'past' && 'border-transparent text-muted-foreground/35',
                  d.state === 'booked' && 'border-transparent bg-muted/70 text-muted-foreground/60 line-through',
                  // Free but unusable reads as a warning, not as availability.
                  d.state === 'short' && 'border-dashed border-warning/50 bg-warning/5 text-warning',
                  d.state === 'notice' && 'border-transparent bg-muted/40 text-muted-foreground/50',
                  isCheapest && 'border-success ring-1 ring-success',
                )}
              >
                {/*
                  A day number, and nothing else.

                  A calendar is a grid people scan for shape — which stretches
                  are free, how long they run. A second line of type in every
                  cell competes with that, and it made each cell tall enough to
                  need two lines of its own. The rate lives above the grid now,
                  where it is said once; the exact figure for a specific night
                  is still a hover away, and the total for a chosen range
                  appears under the grid the moment it is selected.
                */}
                <span className={cn('numeric text-sm font-semibold leading-none', marked && 'text-primary-foreground')}>
                  {d.dom}
                </span>
                {/* A premium night is worth a mark — but a dot, not a number. */}
                {open && varies && d.priceCents > baseline && !marked && (
                  <span aria-hidden className="mt-1 h-1 w-1 rounded-full bg-warning" />
                )}
              </button>
            );
          })}
        </div>

        {/* What the page worked out, so the guest does not have to scan for it. */}
        <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
          {range ? (
            <p className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {nights} night{nights === 1 ? '' : 's'} selected
              </span>
              <span className="numeric text-muted-foreground">
                about {money(subtotal)} before fees and tax
              </span>
            </p>
          ) : anchor ? (
            <p className="text-muted-foreground">Pick your return day.</p>
          ) : (
            <p className="text-muted-foreground">Tap a day to start, then tap your return day.</p>
          )}

          {longestRun > 0 && longestFrom && !range && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Longest open stretch this month: {longestRun} night{longestRun === 1 ? '' : 's'} from{' '}
              {longestFrom.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>

        {/* Legend, stating what each state MEANS rather than naming a colour. */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <Key className="border-border bg-card">Open</Key>
          <Key className="border-transparent bg-muted/70">Booked</Key>
          <Key className="border-dashed border-warning/50 bg-warning/5">Too short to book</Key>
          <Key className="border-success bg-card">Cheapest night</Key>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          Nightly prices shown; the full total with fees, protection and tax is confirmed at checkout.
          {minNights > 1 && ` This host takes bookings of ${minNights} nights or more.`}
        </p>
      </CardContent>
    </Card>
  );
}

function Key({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('h-3 w-3 rounded border', className)} />
      {children}
    </span>
  );
}
