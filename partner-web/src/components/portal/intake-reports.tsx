'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { assetPartnerApi, type IntakeReport, type IntakeStatus } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';
import { formatDate } from '@/lib/utils/format';
import { saveFile } from '@/lib/utils/save-file';

const STATUS: Record<IntakeStatus, { label: string; tone: 'warning' | 'success' | 'destructive' | 'muted' }> = {
  awaiting_partner: { label: 'Needs your review', tone: 'warning' },
  acknowledged: { label: 'Signed', tone: 'success' },
  objected: { label: 'You objected', tone: 'destructive' },
  deemed_accepted: { label: 'Accepted', tone: 'muted' },
};
const FUEL = { full: 'Full', three_quarters: '3/4', half: '1/2', quarter: '1/4' } as const;

function Review({ report, onDone }: { report: IntakeReport; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'sign' | 'object'>('sign');
  const [name, setName] = useState('');
  const [objection, setObjection] = useState('');
  const respond = useMutation({
    meta: { silentError: true },
    mutationFn: () => assetPartnerApi.respondIntake(report._id, mode === 'sign' ? { kind: 'acknowledged', signedName: name } : { kind: 'objected', objection }),
    onSuccess: () => {
      toast({ tone: 'success', title: mode === 'sign' ? 'Intake report signed' : 'Your objection was sent to CatoDrive' });
      onDone();
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t work' }),
  });
  const v = report.vehicle;
  return (
    <div className="mt-3 space-y-4 rounded-xl bg-muted/40 p-4 text-sm">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {([
          ['Vehicle', [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ')],
          ['Color', v.color || '-'],
          ['VIN', v.vin],
          ['Plate', v.plate],
          ['Odometer', `${report.odometer.toLocaleString('en-US')} miles`],
          ['Fuel / charge', FUEL[report.fuelLevel]],
          ['Intake date', formatDate(report.intakeDate)],
          ['Location', report.location],
        ] as const).map(([k, val]) => (
          <div key={k} className="min-w-0"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-words font-medium">{val}</dd></div>
        ))}
      </dl>
      <div><p className="text-xs text-muted-foreground">Pre-existing damage</p><p className="whitespace-pre-wrap">{report.preExistingDamage}</p></div>
      {report.conditionNotes && <div><p className="text-xs text-muted-foreground">Condition notes</p><p className="whitespace-pre-wrap">{report.conditionNotes}</p></div>}
      {report.photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {report.photos.map((p, i) => (
            <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="block h-16 w-20 overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Intake photo ${i + 1}`} className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">If you don’t reply by {formatDate(report.respondBy)}, this report stands as the car’s condition at intake (agreement section 2.5).</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={mode === 'sign' ? 'primary' : 'outline'} onClick={() => setMode('sign')}>It’s correct</Button>
        <Button size="sm" variant={mode === 'object' ? 'primary' : 'outline'} onClick={() => setMode('object')}>Something’s wrong</Button>
      </div>
      {mode === 'sign' ? (
        <Field label="Sign by typing your full legal name"><Input value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} /></Field>
      ) : (
        <Field label="What’s wrong with the report?"><Textarea rows={3} maxLength={2000} value={objection} onChange={(e) => setObjection(e.target.value)} /></Field>
      )}
      <Button className="w-full sm:w-auto" disabled={mode === 'sign' ? name.trim().length < 2 : objection.trim().length < 10} loading={respond.isPending} onClick={() => respond.mutate()}>
        {mode === 'sign' ? 'Sign intake report' : 'Send objection'}
      </Button>
    </div>
  );
}

export function IntakeReports() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['partner-intakes'], queryFn: () => assetPartnerApi.intakes() });
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  if (!q.data?.length) return null;

  const download = async (id: string) => {
    setBusy(id);
    try {
      const { blob, filename } = await assetPartnerApi.downloadIntake(id);
      saveFile(blob, filename ?? 'intake-report.pdf');
    } catch {
      toast({ tone: 'error', title: 'That download didn’t work. Try again.' });
    } finally {
      setBusy('');
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-primary" /> Intake reports</CardTitle></CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {q.data.map((r) => (
          <div key={r._id} className="px-6 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">{r.vehicle.year} {r.vehicle.make} {r.vehicle.model} <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge></p>
                <p className="text-xs text-muted-foreground">Recorded {formatDate(r.intakeDate)} by {r.catodriveSignature.name}{r.status === 'awaiting_partner' ? ` · reply by ${formatDate(r.respondBy)}` : ''}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {r.status === 'awaiting_partner' && <Button size="sm" onClick={() => setOpen(open === r._id ? null : r._id)}>{open === r._id ? 'Close' : 'Review'}</Button>}
                <Button size="sm" variant="outline" loading={busy === r._id} onClick={() => void download(r._id)}><Download className="h-4 w-4" /> PDF</Button>
              </div>
            </div>
            {open === r._id && <Review report={r} onDone={() => { setOpen(null); void qc.invalidateQueries({ queryKey: ['partner-intakes'] }); }} />}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
