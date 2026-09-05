'use client';

import { ArrowRight, ShieldCheck } from 'lucide-react';
import { useVehicle } from '@/features/vehicles/hooks';
import { formatMoney } from '@/lib/utils/format';

/**
 * What the guest is signing in to get back to.
 *
 * "Welcome back / Enter your details" is the same page on every product ever
 * built, and it is especially wrong here: most people reaching this screen were
 * halfway through booking a specific car and got stopped. Showing that car —
 * the photo they already chose, the price they already accepted — turns a
 * checkpoint into the last step of something they started, and it tells them
 * their work was not thrown away, which is the actual anxiety.
 *
 * Silent when there is no context to show. A generic sign-in stays generic
 * rather than growing an empty box.
 */

/** `next` is already same-site validated by the caller. */
function vehicleIdFrom(next: string | null): string {
  const m = next?.match(/^\/vehicles\/([^/?#]+)/);
  return m ? m[1] : '';
}

export function ReturnContext({ next }: { next: string | null }) {
  const id = vehicleIdFrom(next);
  const vehicle = useVehicle(id);
  const v = vehicle.data;

  if (!id || !v) return null;

  const cover = v.photos?.find((p) => p.isCover)?.url ?? v.photos?.[0]?.url;

  return (
    <div className="mb-8 flex items-center gap-3.5 rounded-2xl border border-border bg-card p-3 shadow-soft">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cover}
          alt=""
          className="h-14 w-20 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span className="grid h-14 w-20 shrink-0 place-items-center rounded-xl brand-gradient text-lg font-black text-white/85">
          {v.make.slice(0, 1)}
          {v.model.slice(0, 1)}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
          <ShieldCheck className="h-3.5 w-3.5" /> Your trip is saved
        </p>
        <p className="mt-0.5 truncate text-[15px] font-semibold">
          {v.year} {v.make} {v.model}
        </p>
        <p className="numeric text-xs text-muted-foreground">
          {formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })} a day
        </p>
      </div>

      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </div>
  );
}
