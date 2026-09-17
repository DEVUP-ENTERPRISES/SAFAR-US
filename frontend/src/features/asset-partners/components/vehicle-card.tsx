'use client';

import Link from 'next/link';
import { Car } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/lib/utils/format';
import type { PartnerVehicleSummary } from '@/features/asset-partners/api';

/**
 * One partner vehicle. Shared by the dashboard preview and the vehicles page,
 * so a car reads identically wherever it appears.
 *
 * Net leads and gross follows: a partner is paid the net, and leading with
 * gross is how someone reads a $2,000 month as $2,000 in their pocket.
 */
export function PartnerVehicleCard({
  vehicle,
  currency,
}: {
  vehicle: PartnerVehicleSummary;
  currency: string;
}) {
  const live = vehicle.status === 'listed';
  return (
    <Link href={`/asset-partners/vehicles/${vehicle._id}`} className="group block">
      <Card className="h-full overflow-hidden transition-colors group-hover:border-primary/40">
        <div className="relative h-36 w-full bg-muted">
          {vehicle.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={vehicle.photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground">
              <Car className="h-7 w-7" />
            </div>
          )}
        </div>
        <CardContent className="space-y-3 py-5">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate font-semibold">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </p>
            <Badge tone={live ? 'success' : 'muted'}>
              {live ? 'Live' : vehicle.status.replace(/_/g, ' ')}
            </Badge>
          </div>
          <div className="flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-sm text-muted-foreground">Your net this month</span>
            <span className="font-bold tabular-nums">
              {formatMoney({ amount: vehicle.net, currency })}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Gross</span>
            <span className="font-medium tabular-nums">
              {formatMoney({ amount: vehicle.gross, currency })}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">Trips</span>
            <span className="font-medium tabular-nums">{vehicle.trips}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
