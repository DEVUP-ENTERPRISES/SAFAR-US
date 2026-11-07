'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Plus, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { partnerManageApi, type AddCarResult } from '@/features/asset-partners/manage-api';
import { ApiError } from '@/lib/api/types';

const manage = partnerManageApi('/ioc');
const MAX = 25;

interface Car { _id: string; year: number; make: string; model: string; trim?: string; plate?: string; vin?: string; status: string; assetPartnerEndedAt?: string }

/** One car per line: the VIN, then the plate if known, separated by a comma, tab or space. */
export function parseRows(text: string): { vin: string; plate?: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [vin, plate] = line.split(/[\s,;\t]+/);
      return { vin: vin.toUpperCase(), plate: plate?.toUpperCase() };
    });
}

/** The partner's cars, with ops adding several at once by VIN or undoing one put on the wrong partner. */
export function PartnerCarsCard({ partnerId, cars, active }: { partnerId: string; cars: Car[]; active: boolean }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [address, setAddress] = useState('');
  const [results, setResults] = useState<AddCarResult[]>();
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-asset-partner', partnerId] });
  const rows = parseRows(text);

  const add = useMutation({
    mutationFn: () => manage.addPartnerCars(partnerId, { rows, address: address.trim() || undefined }),
    onSuccess: (r) => {
      setResults(r);
      if (r.every((x) => x.status !== 'failed')) setText('');
      else setText(r.filter((x) => x.status === 'failed').map((x) => rows.find((row) => row.vin === x.vin)).filter(Boolean).map((row) => [row!.vin, row!.plate].filter(Boolean).join(', ')).join('\n'));
      void refresh();
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t go through. Try again.' }),
  });

  const unlink = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => manage.unlinkCar(id, reason),
    onSuccess: () => { toast({ tone: 'success', title: 'Car unlinked' }); void refresh(); },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t go through. Try again.' }),
  });

  const askUnlink = async (car: Car) => {
    const { ok, reason } = await confirm({
      title: `Unlink the ${car.year} ${car.make} ${car.model}?`,
      description: 'Only for a car put on the wrong partner. It stays on the fleet but no longer belongs to this partner. A car that has had bookings with them must be returned to the owner instead.',
      confirmLabel: 'Unlink',
      tone: 'destructive',
      reason: { label: 'Why', required: true },
    });
    if (ok && reason) unlink.mutate({ id: car._id, reason });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-lg">Vehicles {cars.length ? `· ${cars.length}` : ''}</CardTitle>
        {active && !adding && <Button size="sm" variant="outline" onClick={() => { setAdding(true); setResults(undefined); }}><Plus className="h-4 w-4" /> Add cars</Button>}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {adding && (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <Field label="VINs, one car per line" htmlFor="car-rows" hint={`Add the plate after a comma if you have it, e.g. “4T1B11HK5KU123456, ABC1234”. Up to ${MAX} at a time.`}>
              <Textarea id="car-rows" rows={5} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
            </Field>
            <Field label="Where the cars are based (optional)" htmlFor="car-address" hint="Leave blank to use the fleet’s usual address.">
              <Input id="car-address" maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            {rows.length > MAX && <p role="alert" className="text-destructive">That’s {rows.length} lines; add up to {MAX} at a time.</p>}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => { setAdding(false); setText(''); setResults(undefined); }}>Close</Button>
              <Button disabled={!rows.length || rows.length > MAX} loading={add.isPending} onClick={() => add.mutate()}>
                Add {rows.length || ''} car{rows.length === 1 ? '' : 's'}
              </Button>
            </div>
            {results && (
              <ul className="space-y-1.5" aria-label="Results">
                {results.map((r) => (
                  <li key={r.vin} className="flex items-start gap-2">
                    {r.status === 'failed' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
                    <span className="min-w-0 break-words"><span className="font-mono text-xs">{r.vin}</span> · {r.status === 'added' ? 'Added as a draft' : r.status === 'already' ? 'Already with this partner' : r.reason}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {cars.length ? (
          cars.map((v) => (
            <div key={v._id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5 last:border-0 last:pb-0">
              <div className="min-w-0">
                <p className="font-medium">{v.year} {v.make} {v.model}{v.trim ? ` ${v.trim}` : ''}</p>
                <p className="break-words text-xs text-muted-foreground">{v.plate ? `Plate ${v.plate}` : 'No plate on file'}{v.vin ? ` · VIN ${v.vin}` : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={v.assetPartnerEndedAt ? 'muted' : v.status === 'listed' ? 'success' : 'muted'}>{v.assetPartnerEndedAt ? 'Returned' : v.status}</Badge>
                {!v.assetPartnerEndedAt && (
                  <Button size="sm" variant="ghost" loading={unlink.isPending && unlink.variables?.id === v._id} onClick={() => void askUnlink(v)} aria-label={`Unlink ${v.year} ${v.make} ${v.model}`}>Unlink</Button>
                )}
              </div>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">No cars yet. Use “Add cars” to put this partner’s cars on the fleet by VIN.</p>
        )}
      </CardContent>
    </Card>
  );
}
