'use client';

import { useQuery } from '@tanstack/react-query';
import { Flame } from 'lucide-react';
import { vehicleApi } from '@/features/vehicles/api';

/**
 * A real interest signal, sourced from actual pageview analytics — never a
 * fabricated countdown or a made-up "3 people are looking at this" line.
 * Renders nothing below the threshold: a quiet listing showing "1 view" is
 * worse than showing nothing, and it's honest to stay silent rather than
 * invent urgency that isn't there.
 */
export function DemandBadge({ vehicleId }: { vehicleId: string }) {
  const { data } = useQuery({
    queryKey: ['vehicle-interest', vehicleId],
    queryFn: () => vehicleApi.interest(vehicleId),
    staleTime: 5 * 60_000,
  });

  if (!data || data.viewersLast24h < 3) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-[13px] font-semibold text-warning">
      <Flame className="h-3.5 w-3.5" />
      {data.viewersLast24h} people viewed this car today
    </span>
  );
}
