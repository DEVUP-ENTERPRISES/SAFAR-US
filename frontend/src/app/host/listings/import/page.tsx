'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { Upload, ArrowLeft, CheckCircle2, AlertTriangle, SkipForward, Wand2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import { cn } from '@/lib/utils/cn';
import { ApiError } from '@/lib/api/types';
import { hostApi, type RowPreview, type ImportResult } from '@/features/host/api';

/**
 * Fleet import.
 *
 * A host arriving with a hundred cars already listed elsewhere faces a day of
 * transcription — and almost none of it is judgement. Make, model, year, body,
 * fuel, transmission and seats are all encoded in the VIN, so the host pastes
 * four columns and the rest is decoded.
 *
 * The flow is paste, then LOOK, then commit. A hundred cars appearing live
 * unreviewed would be worse for the marketplace than a slow onboarding, so
 * everything lands as a draft and the preview shows exactly what will be
 * created — including which rows still need something and which are already in
 * the fleet — before anything is written.
 */

interface ParsedRow {
  vin: string;
  dailyPrice: number;
  address: string;
  title?: string;
}

/** VIN, price, address, optional title — one row per car. */
const SAMPLE = `4T1C11AK5NU123456, 65, 500 Main St, Dallas TX
5YJ3E1EA7KF317834, 120, 500 Main St, Dallas TX, Tesla Model 3 Long Range`;

function parse(text: string): { rows: ParsedRow[]; errors: string[] } {
  const rows: ParsedRow[] = [];
  const errors: string[] = [];

  text.split('\n').map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
    // Tolerate tabs (a paste from a spreadsheet) as well as commas.
    const parts = line.split(/\t|,(?![^(]*\))/).map((p) => p.trim());
    const [vin, price, ...rest] = parts;
    if (!vin || vin.length < 11) { errors.push(`Line ${i + 1}: that does not look like a VIN`); return; }

    const dollars = Number(String(price ?? '').replace(/[^0-9.]/g, ''));
    if (!dollars) { errors.push(`Line ${i + 1}: missing a daily price`); return; }

    // The address may itself contain commas, so anything between the price and
    // an optional trailing title is treated as the address.
    const hasTitle = rest.length > 2;
    const address = (hasTitle ? rest.slice(0, -1) : rest).join(', ').trim();
    if (address.length < 4) { errors.push(`Line ${i + 1}: missing an address`); return; }

    rows.push({
      vin: vin.toUpperCase(),
      dailyPrice: Math.round(dollars * 100),
      address,
      title: hasTitle ? rest[rest.length - 1] : undefined,
    });
  });

  return { rows, errors };
}

export default function ImportPage() {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<RowPreview[] | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const { rows, errors } = useMemo(() => parse(text), [text]);

  const doPreview = useMutation({
    mutationFn: () => hostApi.importPreview(rows.map((r) => r.vin)),
    onSuccess: (d) => { setPreview(d); setResults(null); },
  });

  const doImport = useMutation({
    mutationFn: () => hostApi.importFleet(rows),
    onSuccess: setResults,
  });

  const readyCount = (preview ?? []).filter((p) => p.ok && !p.duplicate && p.missing.length === 0).length;
  const blocked = (preview ?? []).filter((p) => !p.ok || p.missing.length > 0);

  return (
    <div className="space-y-6">
      <Link href="/host/listings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to listings
      </Link>

      <PageHeader
        title="Import your fleet"
        description="Paste one line per car. We decode the rest from the VIN."
      />

      {/* What the VIN saves them typing, said once, up front. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 py-4">
          <Wand2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-semibold">You only type four things per car.</p>
            <p className="mt-0.5 text-muted-foreground">
              VIN, daily price, address, and optionally a title. Year, make, model, trim, body type, fuel,
              transmission and seats are read from the VIN. Everything imports as a draft — nothing goes live
              until you add photos and publish it.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">Your cars</p>
            <button
              onClick={() => setText(SAMPLE)}
              className="text-sm text-primary hover:underline"
            >
              Show me the format
            </button>
          </div>
          <Textarea
            rows={10}
            value={text}
            onChange={(e) => { setText(e.target.value); setPreview(null); setResults(null); }}
            placeholder={'VIN, price per day, address, optional title\n' + SAMPLE}
            className="font-mono text-sm"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {rows.length} car{rows.length === 1 ? '' : 's'} read
              {errors.length > 0 && <span className="text-warning"> · {errors.length} line(s) need fixing</span>}
            </p>
            <Button
              disabled={rows.length === 0}
              loading={doPreview.isPending}
              onClick={() => doPreview.mutate()}
            >
              <Upload className="h-4 w-4" /> Decode {rows.length || ''} VIN{rows.length === 1 ? '' : 's'}
            </Button>
          </div>

          {errors.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-warning/5 p-3 text-xs text-warning">
              {errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
              {errors.length > 8 && <li>…and {errors.length - 8} more</li>}
            </ul>
          )}
          {doPreview.isError && (
            <p className="text-sm text-destructive">
              {doPreview.error instanceof ApiError ? doPreview.error.message : 'Could not decode those VINs'}
            </p>
          )}
        </CardContent>
      </Card>

      {doPreview.isPending && <Skeleton className="h-64 w-full" />}

      {/* Look before committing. */}
      {preview && !results && (
        <Card>
          <CardContent className="py-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{readyCount} ready to import</p>
                {blocked.length > 0 && (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {blocked.length} need{blocked.length === 1 ? 's' : ''} attention — the rest still import.
                  </p>
                )}
              </div>
              <Button
                disabled={readyCount === 0}
                loading={doImport.isPending}
                onClick={() => doImport.mutate()}
              >
                Import {readyCount} car{readyCount === 1 ? '' : 's'} as drafts
              </Button>
            </div>

            <ul className="mt-4 divide-y divide-border">
              {preview.map((p) => {
                const row = rows.find((r) => r.vin === p.vin);
                return (
                  <li key={p.vin} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {p.ok ? `${p.year} ${p.make} ${p.model}${p.trim ? ` ${p.trim}` : ''}` : p.vin}
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">{p.vin}</p>
                      {p.ok && (
                        <p className="text-xs text-muted-foreground">
                          {[p.bodyType, p.fuelType, p.transmission, p.seats && `${p.seats} seats`]
                            .filter(Boolean).join(' · ')}
                          {row && ` · $${Math.round(row.dailyPrice / 100)}/day`}
                        </p>
                      )}
                      {p.note && <p className="mt-0.5 text-xs text-muted-foreground">{p.note}</p>}
                    </div>
                    <div className="shrink-0">
                      {p.duplicate ? (
                        <Badge tone="muted">Already yours</Badge>
                      ) : !p.ok ? (
                        <Badge tone="destructive">{p.error ?? 'Could not decode'}</Badge>
                      ) : p.missing.length > 0 ? (
                        <Badge tone="warning">Needs {p.missing.join(', ')}</Badge>
                      ) : (
                        <Badge tone="success">Ready</Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* What actually happened. */}
      {results && (
        <Card>
          <CardContent className="py-5">
            <p className="font-semibold">
              {results.filter((r) => r.status === 'created').length} imported as drafts
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Add photos to each, then publish. A car without photos will not attract bookings.
            </p>
            <ul className="mt-4 divide-y divide-border text-sm">
              {results.map((r) => (
                <li key={r.vin} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="font-medium">{r.label ?? r.vin}</span>
                    {r.reason && <span className="ms-2 text-xs text-muted-foreground">{r.reason}</span>}
                  </span>
                  <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs font-medium',
                    r.status === 'created' ? 'text-success'
                      : r.status === 'skipped' ? 'text-muted-foreground' : 'text-destructive')}>
                    {r.status === 'created' ? <CheckCircle2 className="h-3.5 w-3.5" />
                      : r.status === 'skipped' ? <SkipForward className="h-3.5 w-3.5" />
                        : <AlertTriangle className="h-3.5 w-3.5" />}
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/host/listings"
              className="mt-4 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Go add photos
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
