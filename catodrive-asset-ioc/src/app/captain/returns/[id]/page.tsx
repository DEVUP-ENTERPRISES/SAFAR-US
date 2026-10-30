'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, MapPin, Phone } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { RETURN_STATUS, runnerReturnsApi, type RunnerReturn } from '@/features/asset-partners/returns-api';
import { ApiError } from '@/lib/api/types';
import { formatDate } from '@/lib/utils/format';
import { CarChecklist, HandoverForm } from '~/features/partners/return-checklist';

function RunnerReturn() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['runner-return', id], queryFn: () => runnerReturnsApi.detail(id) });
  const set = (x: RunnerReturn) => {
    qc.setQueryData(['runner-return', id], x);
    void qc.invalidateQueries({ queryKey: ['runner-returns'] });
  };
  const start = useMutation({
    mutationFn: () => runnerReturnsApi.start(id),
    onSuccess: set,
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t start. Try again.' }),
  });

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-24 w-full" /><Skeleton className="h-96 w-full" /></div>;
  if (q.isError || !q.data) return <ErrorState message="We couldn’t load this return. It may have been moved to someone else." retry={() => void q.refetch()} />;
  const d = q.data;
  const s = RETURN_STATUS[d.status];
  const who = d.receiver;
  const allowed = d.reason === 'deceased' ? (['estate', 'storage'] as const) : (['owner', 'representative'] as const);
  const defaultName = who?.name;

  return (
    <div className="space-y-5">
      <Link href="/captain" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Your jobs</Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="display text-2xl">Car return</h1>
          <p className="font-mono text-xs text-muted-foreground">{d.reference}</p>
        </div>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>

      <Card>
        <CardContent className="space-y-3 p-5 text-sm">
          {d.scheduledFor && <p><span className="font-semibold">When:</span> {formatDate(d.scheduledFor)}</p>}
          {d.handoverPreference === 'deliver' && d.deliveryAddress ? (
            <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> Bring the car to {d.deliveryAddress} <a className="text-primary hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(d.deliveryAddress)}`}>Directions</a></p>
          ) : (
            <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> The receiver collects the car from where it’s kept.</p>
          )}
          {who && (
            <p className="flex items-start gap-2">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{who.name} ({who.relation}) · <a className="text-primary hover:underline" href={`tel:${who.phone}`}>{who.phone}</a></span>
            </p>
          )}
          {d.representative && <p className="text-muted-foreground">Their named representative: {d.representative.name}, <a className="text-primary hover:underline" href={`tel:${d.representative.phone}`}>{d.representative.phone}</a></p>}
          {d.sentBack && d.status === 'in_progress' && <p className="rounded-lg bg-warning/10 p-3 text-warning">Sent back: {d.sentBack.reason}</p>}
        </CardContent>
      </Card>

      {d.status === 'scheduled' && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">Start when you’re with the car. It comes off the marketplace straight away, so guests can’t book it.</p>
            <Button loading={start.isPending} onClick={() => start.mutate()}>Start the return</Button>
          </CardContent>
        </Card>
      )}

      {['in_progress', 'submitted', 'completed'].includes(d.status) && (
        <Card>
          <CardHeader><CardTitle className="text-base">Checklist</CardTitle></CardHeader>
          <CardContent className="space-y-8">
            {d.cars.map((car) => (
              <CarChecklist key={car.vehicleId} car={car} photoMin={d.photoMin} editable={d.status === 'in_progress'} onPatch={async (patch) => set(await runnerReturnsApi.updateCar(id, car.vehicleId, patch))} />
            ))}
            {d.status === 'in_progress' && (
              <div className="border-t border-border pt-5">
                <HandoverForm defaultName={defaultName} allowed={[...allowed]} onSubmit={async (input) => set(await runnerReturnsApi.submit(id, input))} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {d.status === 'submitted' && (
        <p className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm text-success" role="status"><CheckCircle2 className="h-4 w-4" /> Sent for approval. The operations team will check it.</p>
      )}
    </div>
  );
}

export default function RunnerReturnPage() {
  return (
    <AuthGuard loginPath="/sign-in?as=captain">
      <div className="mx-auto max-w-3xl px-4 py-6"><RunnerReturn /></div>
    </AuthGuard>
  );
}
