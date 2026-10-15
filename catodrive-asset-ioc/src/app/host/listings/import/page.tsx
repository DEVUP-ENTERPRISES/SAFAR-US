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
import { Field } from '@/components/ui/field';
import { cn } from '@/lib/utils/cn';
import { ApiError } from '@/lib/api/types';
import { LocationSearch } from '@/features/maps/components/location-search';
import { hostApi, type RowPreview, type ImportResult } from '~/features/host/api';
import { WheelbaseImport } from '~/features/host/components/wheelbase-import';
import { DEFAULT_IMPORT_ADDRESS, IMPORT_SAMPLE, importReadiness, parseImport, toImportRows } from '~/features/host/fleet-import';

/**
 * Fleet import & bulk edit - one shared address for the whole batch (set
 * once, above the box); each pasted line is a VIN plus the things a VIN
 * can't know: plate, an optional title, and a status. Re-pasting a VIN
 * already in the fleet updates that car instead of being skipped.
 */






export default function ImportPage() {
  const [text, setText] = useState('');
  const [address, setAddress] = useState(DEFAULT_IMPORT_ADDRESS);
  const [editingAddress, setEditingAddress] = useState(false);
  const [preview, setPreview] = useState<RowPreview[] | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  const { rows, errors } = useMemo(() => parseImport(text), [text]);

  const doPreview = useMutation({
    mutationFn: () => hostApi.importPreview(rows.map((r) => r.vin)),
    onSuccess: (d) => { setPreview(d); setResults(null); },
  });

  const doImport = useMutation({
    mutationFn: () =>
      hostApi.importFleet(toImportRows(rows, address)),
    onSuccess: setResults,
  });

  // A duplicate row still counts as ready when it carries an edit (plate,
  // title or status) - re-pasting a VIN already in the fleet updates it.
  const { ready: readyCount, blocked } = importReadiness(preview ?? [], rows);

  return (
    <div className="space-y-6">
      <Link href="/host/listings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to listings
      </Link>

      <PageHeader
        title="Import your fleet"
        description="Set your address once, then paste one line per car. We decode the rest from the VIN."
      />

      <WheelbaseImport />

      {/* What the VIN saves them typing, said once, up front. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 py-4">
          <Wand2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-semibold">Price isn&apos;t typed here.</p>
            <p className="mt-0.5 text-muted-foreground">
              Year, make, model, trim, body type, fuel, transmission and seats are read from the VIN, and a
              starting price is suggested from comparable listings. Every new car also gets your standard
              delivery setup (both airports, the hotel, and a 20-mile custom radius) - adjust per car on the
              listing page. Set the real price, add photos and publish from there too. Re-pasting a VIN already
              in your fleet updates its plate, title or status instead of creating a duplicate.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-5">
          {editingAddress ? (
            <Field label="Address" hint="Applied to every car in this batch">
              <LocationSearch
                placeholder={address}
                onPick={(p) => { setAddress(p.label); setEditingAddress(false); }}
              />
            </Field>
          ) : (
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Address</p>
                <p className="font-medium">{address}</p>
                <p className="text-sm text-muted-foreground">Applied to every car in this batch</p>
              </div>
              <button onClick={() => setEditingAddress(true)} className="shrink-0 text-sm font-medium text-primary hover:underline">
                Change
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">Your cars</p>
            <button
              onClick={() => setText(IMPORT_SAMPLE)}
              className="text-sm text-primary hover:underline"
            >
              Show me the format
            </button>
          </div>
          <Textarea
            rows={10}
            value={text}
            onChange={(e) => { setText(e.target.value); setPreview(null); setResults(null); }}
            placeholder={'VIN, license plate, optional title, status\n' + IMPORT_SAMPLE}
            className="font-mono text-sm"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {rows.length} car{rows.length === 1 ? '' : 's'} read
              {errors.length > 0 && <span className="text-warning"> · {errors.length} line(s) need fixing</span>}
              {rows.length > 0 && !address && <span className="text-warning"> · address required</span>}
            </p>
            <Button
              disabled={rows.length === 0 || !address}
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
                    {blocked.length} need{blocked.length === 1 ? 's' : ''} attention, but every car is still
                    attempted - you&apos;ll see the exact reason for each one below.
                  </p>
                )}
              </div>
              <Button
                disabled={rows.length === 0}
                loading={doImport.isPending}
                onClick={() => doImport.mutate()}
              >
                Import / update all {rows.length} car{rows.length === 1 ? '' : 's'}
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
                          {row?.registrationNumber && ` · ${row.registrationNumber}`}
                          {row?.status && ` · ${row.status}`}
                        </p>
                      )}
                      {p.note && <p className="mt-0.5 text-xs text-muted-foreground">{p.note}</p>}
                    </div>
                    <div className="shrink-0">
                      {p.duplicate ? (
                        <Badge tone={row?.registrationNumber || row?.title || row?.status ? 'default' : 'muted'}>
                          {row?.registrationNumber || row?.title || row?.status ? 'Already yours - will update' : 'Already yours'}
                        </Badge>
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
              {results.filter((r) => r.status === 'created').length} imported as drafts,{' '}
              {results.filter((r) => r.status === 'updated').length} updated
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              New cars land as drafts - add photos, set a real price, then publish. A car without photos will
              not attract bookings.
            </p>
            <ul className="mt-4 divide-y divide-border text-sm">
              {results.map((r) => (
                <li key={r.vin} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="font-medium">{r.label ?? r.vin}</span>
                    {r.reason && <span className="ms-2 text-xs text-muted-foreground">{r.reason}</span>}
                  </span>
                  <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs font-medium',
                    r.status === 'created' || r.status === 'updated' ? 'text-success'
                      : r.status === 'skipped' ? 'text-muted-foreground' : 'text-destructive')}>
                    {r.status === 'created' || r.status === 'updated' ? <CheckCircle2 className="h-3.5 w-3.5" />
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
