'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck, AlertTriangle, FileSearch, ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { api } from '@/lib/api/client';

interface Recall {
  campaignNumber: string;
  component: string;
  summary: string;
  remedy?: string;
  consequence?: string;
  reportedAt?: string;
}

interface History {
  vin?: string;
  recalls: Recall[];
  title: {
    clean: boolean | null;
    brands: string[];
    stolen: boolean | null;
    odometerMiles: number | null;
    odometerSuspect: boolean | null;
  } | null;
  titleUnavailableReason?: 'not_configured' | 'lookup_failed' | 'no_vin';
  checkedAt: string;
}

/**
 * Safety recalls and title history for a car.
 *
 * Shown to guests as well as hosts. An open recall is exactly the thing someone
 * should be able to see before they get into a stranger's car, and a platform
 * that knows and does not say is making a choice it could not defend.
 *
 * Two honesty rules are load-bearing here:
 *
 *  - RECALLS ARE BY MODEL YEAR, NOT BY CAR. NHTSA indexes them that way, so a
 *    listed recall may already have been fixed on this particular vehicle. The
 *    card says so. Implying otherwise sends hosts chasing work already done and
 *    frightens guests off cars that are fine.
 *  - "NOT CHECKED" IS NOT "CLEAN". Title history is a paid lookup. When it has
 *    not run, the card says it has not run — it never shows a green tick for a
 *    check nobody paid for.
 */
export function VehicleHistory({ vehicleId, audience }: { vehicleId: string; audience: 'guest' | 'host' }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['vehicle-history', vehicleId],
    queryFn: () => api.get<History>(`/vehicles/${vehicleId}/history`, undefined, false),
    staleTime: 60 * 60 * 1000, // Recalls change on the order of months.
    retry: false,
  });

  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  if (q.isError || !q.data) return null;

  const { recalls, title, titleUnavailableReason } = q.data;
  const hasRecalls = recalls.length > 0;

  // Nothing to report and nothing checked: on a guest page that is noise.
  if (!hasRecalls && !title && audience === 'guest') return null;

  return (
    <Card className={cn(hasRecalls && 'border-warning/40')}>
      <CardContent className="py-5">
        <p className="flex items-center gap-2 font-semibold">
          {hasRecalls ? (
            <AlertTriangle className="h-5 w-5 text-warning" />
          ) : (
            <ShieldCheck className="h-5 w-5 text-success" />
          )}
          Safety & history
        </p>

        {/* ── Recalls ── */}
        <div className="mt-3">
          {hasRecalls ? (
            <>
              <p className="text-sm">
                <span className="font-medium">
                  {recalls.length} open recall{recalls.length === 1 ? '' : 's'} for this model year.
                </span>{' '}
                <span className="text-muted-foreground">
                  Recalls are published per model year, so this may already have been fixed on this car.
                  {audience === 'host' && ' Your dealer does recall work free of charge.'}
                </span>
              </p>
              <ul className="mt-3 space-y-2">
                {recalls.slice(0, 5).map((r) => {
                  const open = expanded === r.campaignNumber;
                  return (
                    <li key={r.campaignNumber} className="rounded-lg border border-border">
                      <button
                        onClick={() => setExpanded(open ? null : r.campaignNumber)}
                        className="flex w-full items-center justify-between gap-3 p-3 text-start"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium capitalize">
                            {r.component.toLowerCase()}
                          </span>
                          <span className="block font-mono text-xs text-muted-foreground">
                            {r.campaignNumber}
                          </span>
                        </span>
                        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
                      </button>
                      {open && (
                        <div className="space-y-2 border-t border-border p-3 text-sm text-muted-foreground">
                          <p>{r.summary}</p>
                          {r.consequence && (
                            <p><span className="font-medium text-foreground">Risk:</span> {r.consequence}</p>
                          )}
                          {r.remedy && (
                            <p><span className="font-medium text-foreground">Fix:</span> {r.remedy}</p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No open safety recalls for this make, model and year.
            </p>
          )}
        </div>

        {/* ── Title history ── */}
        <div className="mt-4 border-t border-border pt-4">
          {title ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={title.clean ? 'success' : 'destructive'}>
                {title.clean ? 'Clean title' : 'Branded title'}
              </Badge>
              {title.brands.map((b) => <Badge key={b} tone="warning">{b}</Badge>)}
              {title.stolen && <Badge tone="destructive">Reported stolen</Badge>}
              {title.odometerSuspect && <Badge tone="warning">Odometer inconsistent</Badge>}
              {title.odometerMiles != null && (
                <span className="numeric text-muted-foreground">
                  {title.odometerMiles.toLocaleString('en-US')} mi on record
                </span>
              )}
            </div>
          ) : (
            // Never a green tick for a check that did not run.
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <FileSearch className="mt-0.5 h-4 w-4 shrink-0" />
              {titleUnavailableReason === 'no_vin'
                ? 'Title and odometer history needs a VIN on this listing.'
                : titleUnavailableReason === 'lookup_failed'
                  ? 'Title history could not be checked just now.'
                  : 'Title, salvage and odometer history has not been checked on this car.'}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
