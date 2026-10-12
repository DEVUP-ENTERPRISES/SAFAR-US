import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateRangeCalendar, Skeleton } from '@catodrive/ui';
import { vehicleApi } from '@catodrive/core/web/features/vehicles/api';
import { busyDayKeys, localDayKey, minNightsOf, nightlyPrice } from '@catodrive/core/web/features/vehicles/calendar-pricing';
import { leadMinutes, usePlatformConfig } from '@catodrive/core/web/features/platform/config';
import type { Vehicle } from '@catodrive/core/web/features/vehicles/types';

/**
 * The car's calendar: booked or blocked days can't be picked, the first
 * selectable day respects the platform lead time and the host's advance
 * notice, and each day shows that night's price.
 */
export function VehicleCalendar({ vehicle, from, to, onChange }: { vehicle: Vehicle; from: string; to: string; onChange: (from: string, to: string) => void }) {
  const cfg = usePlatformConfig().data;
  const calendar = useQuery({ queryKey: ['calendar', vehicle._id], queryFn: () => vehicleApi.getCalendar(vehicle._id) });
  const busy = useMemo(() => busyDayKeys(calendar.data ?? []), [calendar.data]);
  const earliest = useMemo(() => {
    const noticeMs = leadMinutes(cfg, vehicle.listing?.advanceNoticeHours ?? 0) * 60_000;
    const d = new Date(Date.now() + noticeMs);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [cfg, vehicle.listing?.advanceNoticeHours]);
  const minNights = minNightsOf(vehicle);

  if (calendar.isPending) return <Skeleton height={320} />;
  return (
    <DateRangeCalendar
      from={from}
      to={to}
      earliest={earliest}
      unavailable={busy}
      labelFor={(key) => `$${Math.round(nightlyPrice(vehicle.pricing, new Date(`${key}T12:00:00`)) / 100)}`}
      onChange={(f, t) => {
        // A range shorter than the host's minimum is extended to it, the same floor the server enforces.
        if (f && t) {
          const nights = Math.round((new Date(`${t}T12:00:00`).getTime() - new Date(`${f}T12:00:00`).getTime()) / 86_400_000);
          if (nights < minNights) {
            const end = new Date(`${f}T12:00:00`);
            end.setDate(end.getDate() + minNights);
            return onChange(f, localDayKey(end));
          }
        }
        onChange(f, t);
      }}
    />
  );
}
