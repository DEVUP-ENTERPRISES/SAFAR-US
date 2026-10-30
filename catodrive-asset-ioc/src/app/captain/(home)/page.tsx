'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CalendarOff, Car, Clock, MapPin, MessageSquare, Navigation, Phone, Plane, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { cn } from '@/lib/utils/cn';
import { captainApi, ABILITY_LABELS, type CaptainDashboard, type CaptainJob } from '~/features/host/team-api';
import { RunnerReturnJobs } from '~/features/partners/runner-return-jobs';

const time = (d: string) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const day = (d: string) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

function dayLabel(d: string, now = new Date()): string {
  const date = new Date(d);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return day(d);
}

const LINK_BTN = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  outline: 'border border-input bg-background hover:bg-accent',
  ghost: 'hover:bg-accent',
};

function LinkButton({ href, variant = 'primary', external, children }: { href: string; variant?: keyof typeof LINK_BTN; external?: boolean; children: React.ReactNode }) {
  const cls = cn('inline-flex h-9 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium transition-all', LINK_BTN[variant]);
  return external ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{children}</a> : <Link href={href} className={cls}>{children}</Link>;
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warning' }) {
  return (
    <div className={cn('rounded-lg border p-4', tone && value ? 'border-warning/40 bg-warning/10' : 'border-border bg-card')}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function JobCard({ job, can }: { job: CaptainJob; can: (a: string) => boolean }) {
  const pickup = job.kind === 'pickup';
  const openTrip = can('trip:handover');
  return (
    <Card className={cn(job.overdue && 'border-destructive/50')}>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-start gap-3">
          <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {job.vehicle?.photo ? <img src={job.vehicle.photo} alt="" className="h-full w-full object-cover" /> : <Car className="m-auto mt-4 h-5 w-5 text-muted-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={job.overdue ? 'destructive' : pickup ? 'success' : 'warning'}>
                {pickup ? <ArrowUpFromLine className="mr-1 inline h-3 w-3" /> : <ArrowDownToLine className="mr-1 inline h-3 w-3" />}
                {job.overdue ? 'Return overdue' : pickup ? 'Pickup' : 'Return'}
              </Badge>
              <span className="font-semibold tabular-nums">{time(job.at)}</span>
              <span className="text-xs text-muted-foreground">#{job.code}</span>
            </p>
            <p className="mt-1 break-words font-medium">{job.vehicle?.label ?? 'Car'}{job.vehicle?.plate ? <span className="font-mono text-sm text-muted-foreground"> · {job.vehicle.plate}</span> : null}</p>
            <p className="text-sm text-muted-foreground">Guest: {job.guestName}</p>
          </div>
        </div>
        {(job.where || job.delivery?.flightNumber) && (
          <div className="space-y-1 rounded-xl bg-muted/40 px-3 py-2 text-sm">
            {job.where && <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 break-words">{job.where}</span></p>}
            {job.delivery?.flightNumber && <p className="flex gap-2"><Plane className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />Flight {job.delivery.flightNumber}{job.delivery.terminal ? ` · Terminal ${job.delivery.terminal}` : ''}</p>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {openTrip && <LinkButton href={`/ops/trips/${job.bookingId}`}>{pickup ? 'Start handover' : 'Check car in'}</LinkButton>}
          {job.guestPhone && <LinkButton variant="outline" external href={`tel:${job.guestPhone}`}><Phone className="h-4 w-4" /> Call</LinkButton>}
          {can('trip:message') && openTrip && <LinkButton variant="outline" href={`/ops/trips/${job.bookingId}?tab=messages`}><MessageSquare className="h-4 w-4" /> Message</LinkButton>}
          {job.where && <LinkButton variant="outline" external href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.where)}`}><Navigation className="h-4 w-4" /> Directions</LinkButton>}
          {can('incident:report') && openTrip && <LinkButton variant="ghost" href={`/ops/trips/${job.bookingId}?tab=help`}><AlertTriangle className="h-4 w-4" /> Report damage</LinkButton>}
        </div>
      </CardContent>
    </Card>
  );
}

function BlockDates({ carId, onDone }: { carId: string; onDone: () => void }) {
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const save = useMutation({
    meta: { silentError: true },
    mutationFn: (action: 'block' | 'unblock') => captainApi.blockDates(carId, { start: new Date(`${start}T00:00:00`).toISOString(), end: new Date(`${end}T23:59:59`).toISOString(), action }),
    onSuccess: (_r, action) => { toast({ tone: 'success', title: action === 'block' ? 'Dates blocked' : 'Dates opened again' }); onDone(); },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t work' }),
  });
  return (
    <div className="mt-3 grid gap-3 rounded-xl bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
      <Field label="From"><Input type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} /></Field>
      <Field label="To"><Input type="date" min={start} value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      <Button disabled={!start || !end || end < start} loading={save.isPending && save.variables === 'block'} onClick={() => save.mutate('block')}>Block</Button>
      <Button variant="outline" disabled={!start || !end || end < start} loading={save.isPending && save.variables === 'unblock'} onClick={() => save.mutate('unblock')}>Unblock</Button>
    </div>
  );
}

function Cars({ data, can }: { data: CaptainDashboard; can: (a: string) => boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const qc = useQueryClient();
  if (!data.cars.length) return <EmptyState icon={<Car className="h-6 w-6" />} title="No cars assigned yet" description="Ask the operations team to assign cars to you." />;
  return (
    <Card>
      <CardContent className="divide-y divide-border p-0">
        {data.cars.map((c) => (
          <div key={c._id} className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.photo ? <img src={c.photo} alt="" className="h-full w-full object-cover" /> : <Car className="m-auto mt-3 h-5 w-5 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{c.label}{c.plate ? <span className="font-mono text-sm text-muted-foreground"> · {c.plate}</span> : null}</p>
                <p className="text-xs text-muted-foreground">
                  {c.outUntil ? `Out with a guest until ${day(c.outUntil)}, ${time(c.outUntil)}` : c.nextPickup ? `Free · next pickup ${day(c.nextPickup)}, ${time(c.nextPickup)}` : c.listed ? 'Free · no bookings this week' : 'Not taking bookings'}
                </p>
              </div>
              {can('calendar:manage') && (
                <Button size="sm" variant={open === c._id ? 'outline' : 'ghost'} onClick={() => setOpen(open === c._id ? null : c._id)}>
                  <CalendarOff className="h-4 w-4" /> {open === c._id ? 'Close' : 'Block dates'}
                </Button>
              )}
            </div>
            {open === c._id && <BlockDates carId={c._id} onDone={() => { setOpen(null); void qc.invalidateQueries({ queryKey: ['captain-dashboard'] }); }} />}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function CaptainDashboardPage() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['captain-dashboard'], queryFn: () => captainApi.dashboard(), refetchInterval: 60_000 });
  const [tab, setTab] = useState<'jobs' | 'cars'>('jobs');
  const groups = useMemo(() => {
    const map = new Map<string, CaptainJob[]>();
    for (const j of data?.jobs ?? []) {
      const key = j.overdue ? 'Overdue' : dayLabel(j.at);
      map.set(key, [...(map.get(key) ?? []), j]);
    }
    return [...map.entries()];
  }, [data?.jobs]);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-lg" />;
  if (isError) return <ErrorState message="Couldn’t load your jobs. Check your connection and try again." retry={() => refetch()} />;
  if (!data) return <ErrorState message="You’re not on the team yet. Ask the operations team to send you a new invite." />;

  const can = (a: string) => data.staff.abilities.includes(a as never);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h1 className="display truncate text-2xl">Hi {data.staff.name.split(' ')[0]}</h1>
          <p className="truncate text-sm text-muted-foreground">{data.staff.title ? `${data.staff.title} · ` : ''}{data.fleetName}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Jobs today" value={data.counts.today} />
        <Stat label="Returns overdue" value={data.counts.overdue} tone="warning" />
        <Stat label="Cars out now" value={data.counts.out} />
        <Stat label="Your cars" value={data.counts.cars} />
      </div>

      <RunnerReturnJobs />

      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-full border border-border p-1">
        {([['jobs', `Jobs (${data.jobs.length})`], ['cars', `Your cars (${data.cars.length})`]] as const).map(([v, label]) => (
          <button key={v} role="tab" type="button" aria-selected={tab === v} onClick={() => setTab(v)} className={cn('rounded-full px-3 py-2 text-sm font-medium transition-colors', tab === v ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'jobs' ? (
        groups.length === 0 ? (
          <EmptyState icon={<Clock className="h-6 w-6" />} title="Nothing in the next 7 days" description="Pickups and returns on your cars show up here as soon as they’re booked." />
        ) : (
          <div className="space-y-6">
            {groups.map(([label, jobs]) => (
              <section key={label}>
                <p className={cn('mb-3 text-xs font-bold uppercase tracking-widest', label === 'Overdue' ? 'text-destructive' : 'text-muted-foreground')}>{label}</p>
                <div className="space-y-3">{jobs.map((j) => <JobCard key={`${j.kind}-${j.bookingId}`} job={j} can={can} />)}</div>
              </section>
            ))}
          </div>
        )
      ) : (
        <Cars data={data} can={can} />
      )}

      <div className="rounded-lg border border-border p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">What you can do</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {data.staff.abilities.map((a) => <li key={a}><Badge tone="muted">{ABILITY_LABELS[a].label}</Badge></li>)}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">Captains never see or handle money. Need more access? Ask the operations team.</p>
      </div>
    </div>
  );
}
