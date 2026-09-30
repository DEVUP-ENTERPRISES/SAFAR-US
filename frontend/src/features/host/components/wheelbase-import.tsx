'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadCloud, CheckCircle2, AlertTriangle, SkipForward, PlusCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ApiError } from '@/lib/api/types';
import { formatMoney } from '@/lib/utils/format';
import { hostApi, type WheelbasePreview, type WheelbaseImportResult } from '@/features/host/api';

const FILL_LABEL: Record<string, string> = { photos: 'photos', description: 'description', features: 'features', insurance: 'insurance link' };

/** Brings the host's Wheelbase fleet in: fills and links the cars already here, creates drafts for the rest. */
export function WheelbaseImport() {
  const qc = useQueryClient();
  const access = useQuery({ queryKey: ['wheelbase-import-available'], queryFn: () => hostApi.wheelbaseAvailable(), staleTime: 10 * 60_000 });
  const [preview, setPreview] = useState<WheelbasePreview | null>(null);
  const [results, setResults] = useState<WheelbaseImportResult[] | null>(null);

  const load = useMutation({
    mutationFn: () => hostApi.wheelbasePreview(),
    onSuccess: (p) => { setPreview(p); setResults(null); },
  });
  const run = useMutation({
    mutationFn: () => hostApi.wheelbaseImport(),
    onSuccess: (r) => {
      setResults(r);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ['my-vehicles'] });
      qc.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
  const error = load.error ?? run.error;

  // Only the CatoDrive fleet account imports from Wheelbase; everyone else never sees this card.
  if (!access.data?.available) return null;

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-start gap-3">
          <DownloadCloud className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold">Import from Wheelbase</p>
            <p className="text-sm text-muted-foreground">
              Cars you already have here are filled in with their Wheelbase photos, description and features, and linked to
              their insurance. Anything you set yourself is kept. Cars not here yet come in as drafts. Nothing is duplicated.
            </p>
          </div>
        </div>

        <Button variant="outline" loading={load.isPending} onClick={() => load.mutate()}>
          <RefreshCw className="h-4 w-4" /> Preview what will be imported
        </Button>

        {error && (
          <p className="text-sm text-destructive">{error instanceof ApiError ? error.message : 'Wheelbase could not be reached. Please try again.'}</p>
        )}

        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="success">{preview.toUpdate} car{preview.toUpdate === 1 ? '' : 's'} to fill in</Badge>
              <Badge tone="default">{preview.toCreate} new draft{preview.toCreate === 1 ? '' : 's'}</Badge>
              {preview.toChoose > 0 && <Badge tone="warning">{preview.toChoose} need a choice</Badge>}
              <span className="text-muted-foreground">from {preview.listings} Wheelbase listings</span>
            </div>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {preview.rows.map((r) => (
                <li key={r.listingId} className="flex flex-wrap items-start gap-3 p-3 text-sm">
                  {r.action === 'update' ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" /> : r.action === 'create' ? <PlusCircle className="mt-0.5 h-4 w-4 text-primary" /> : <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {r.name}
                      <span className="font-normal text-muted-foreground"> · {r.photos} photos{r.pricePerDayCents ? ` · ${formatMoney({ amount: r.pricePerDayCents, currency: 'USD' })}/day on Wheelbase` : ''}</span>
                    </p>
                    {r.action === 'update' && r.cars.map((c) => (
                      <p key={c.id} className="text-xs text-muted-foreground">
                        {c.name} ({c.status}): {c.fills.length ? `adds ${c.fills.map((f) => FILL_LABEL[f] ?? f).join(', ')}` : 'already complete'}
                      </p>
                    ))}
                    {r.action === 'create' && <p className="text-xs text-muted-foreground">Not on CatoDrive yet: a new draft will be created.</p>}
                    {r.note && <p className="text-xs text-amber-700 dark:text-amber-400">{r.note}</p>}
                  </div>
                </li>
              ))}
            </ul>
            <Button loading={run.isPending} onClick={() => run.mutate()}>
              <DownloadCloud className="h-4 w-4" /> Import {preview.toUpdate + preview.toCreate} car{preview.toUpdate + preview.toCreate === 1 ? '' : 's'}
            </Button>
          </div>
        )}

        {results && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              Done: {results.filter((r) => r.outcome === 'updated').length} filled in, {results.filter((r) => r.outcome === 'created').length} created
              {results.some((r) => r.outcome === 'failed') ? `, ${results.filter((r) => r.outcome === 'failed').length} failed` : ''}.
            </p>
            <ul className="space-y-1 text-sm">
              {results.map((r) => (
                <li key={r.listingId} className="flex items-start gap-2">
                  {r.outcome === 'failed' ? <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" /> : r.outcome === 'skipped' ? <SkipForward className="mt-0.5 h-4 w-4 text-muted-foreground" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />}
                  <span>
                    {r.name}: {r.outcome}
                    {r.detail ? <span className="text-muted-foreground"> · {r.detail}</span> : null}
                    {r.vehicleIds.length === 1 && (
                      <> · <Link href={`/host/listings/${r.vehicleIds[0]}`} className="text-primary underline underline-offset-2">open</Link></>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">New cars are drafts: set the price and location, then submit them for review from Listings.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
