'use client';

import { Crown, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatMoney } from '@/lib/utils/format';
import { describeBenefits } from './api';
import { useMembership } from './hooks';

/** A small gold "PRO" mark for anyone with a live membership. */
export function ProBadge({ className, label = 'PRO' }: { className?: string; label?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-500 px-2 py-0.5 text-[10px] font-extrabold tracking-widest text-amber-950 shadow-sm', className)}>
      <Crown className="h-3 w-3" /> {label}
    </span>
  );
}

/** A car's daily price; members see their own price live, with the normal price struck through beside it. */
export function DailyPrice({ amount, currency, className }: { amount: number; currency: string; className?: string }) {
  const { isMember, benefits } = useMembership();
  const off = benefits?.bookingDiscountBps ?? 0;
  if (!isMember || off <= 0) return <span className={className}>{formatMoney({ amount, currency })}</span>;
  const mine = Math.round((amount * (10_000 - off)) / 10_000);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span className={cn(className, 'text-amber-500')}>{formatMoney({ amount: mine, currency })}</span>
      <span className="text-sm font-medium text-muted-foreground line-through">{formatMoney({ amount, currency })}</span>
      <ProBadge label={`−${(off / 100).toFixed(0)}%`} className="self-center" />
    </span>
  );
}

/** Every perk the member has, shown where they are about to book. */
export function MemberBanner({ className }: { className?: string }) {
  const { isMember, benefits } = useMembership();
  if (!isMember || !benefits) return null;
  return (
    <div className={cn('rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-400/15 via-amber-300/5 to-transparent p-3.5', className)}>
      <p className="flex items-center gap-2 text-sm font-bold"><ProBadge /> Your member perks are applied</p>
      <ul className="mt-2 grid gap-1 text-[13px] text-muted-foreground sm:grid-cols-2">
        {describeBenefits(benefits).map((b) => (
          <li key={b} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 shrink-0 text-amber-500" /> {b}</li>
        ))}
      </ul>
    </div>
  );
}
