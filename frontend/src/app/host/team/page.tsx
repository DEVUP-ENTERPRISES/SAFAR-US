'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Users, ShieldCheck, Trash2, Car, Mail, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils/cn';
import { ApiError } from '@/lib/api/types';
import {
  teamApi, ABILITY_LABELS, type Captain, type CaptainAbility, type AssignableVehicle,
} from '@/features/host/team-api';

const ALL: CaptainAbility[] = ['trip:view', 'trip:handover', 'trip:message', 'calendar:manage', 'incident:report'];
const DEFAULTS: CaptainAbility[] = ['trip:view', 'trip:handover', 'trip:message'];

/**
 * Captains — the people who work a host's fleet.
 *
 * Past one or two cars a host stops doing handovers personally: a partner, a
 * cleaner, a valet, a fleet manager. Today they hand over their password, which
 * means whoever wipes the seats can also change the payout account and read
 * every guest's phone number.
 *
 * A Captain gets their own access, scoped to named cars and named abilities.
 * The page states in plain words what each one can do — a host should never
 * have to decode a permission string to know who can touch their money.
 * Nothing on this list moves money, and the page says so outright.
 */
export default function TeamPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);

  const team = useQuery({ queryKey: ['host-team'], queryFn: () => teamApi.list() });
  const vehicles = useQuery({ queryKey: ['host-team-vehicles'], queryFn: () => teamApi.assignableVehicles() });

  const refresh = () => qc.invalidateQueries({ queryKey: ['host-team'] });
  const fail = (e: unknown) =>
    toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Something went wrong' });

  const invite = useMutation({
    mutationFn: teamApi.invite,
    onSuccess: () => { toast({ tone: 'success', title: 'Invite sent' }); setAdding(false); refresh(); },
    onError: fail,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }) => teamApi.setStatus(id, status),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: teamApi.remove,
    onSuccess: () => { toast({ tone: 'success', title: 'Captain removed' }); refresh(); },
    onError: fail,
  });

  const onRemove = async (c: Captain) => {
    const { ok } = await confirm({
      title: `Remove ${c.name}?`,
      description: 'They lose access to your cars immediately. This cannot be undone.',
      confirmLabel: 'Remove',
      tone: 'destructive',
    });
    if (ok) remove.mutate(c._id);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Captains"
        description="The people who run your cars day to day — with their own access, not your password."
        actions={
          <Button onClick={() => setAdding((v) => !v)}>
            <UserPlus className="h-4 w-4" /> {adding ? 'Cancel' : 'Add a Captain'}
          </Button>
        }
      />

      {/* The boundary, stated before anyone is invited. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm">
            <span className="font-semibold">Captains never touch your money.</span> They cannot see earnings,
            change prices, edit payout details, or issue refunds. Those stay with you.
          </p>
        </CardContent>
      </Card>

      {adding && (
        <InviteForm
          vehicles={vehicles.data ?? []}
          busy={invite.isPending}
          onSubmit={(b) => invite.mutate(b)}
        />
      )}

      {team.isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
      ) : team.isError ? (
        <ErrorState message="Couldn't load your team." retry={() => team.refetch()} />
      ) : (team.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No Captains yet"
          description="Add someone who handles your handovers, cleaning or servicing. They get their own access to only the cars you pick."
        />
      ) : (
        <div className="space-y-3">
          {team.data!.map((c) => (
            <CaptainCard
              key={c._id}
              c={c}
              vehicles={vehicles.data ?? []}
              busy={setStatus.isPending || remove.isPending}
              onToggle={() => setStatus.mutate({ id: c._id, status: c.status === 'suspended' ? 'active' : 'suspended' })}
              onRemove={() => onRemove(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CaptainCard({
  c, vehicles, busy, onToggle, onRemove,
}: {
  c: Captain; vehicles: AssignableVehicle[]; busy: boolean;
  onToggle: () => void; onRemove: () => void;
}) {
  const wholeFleet = c.vehicleIds.length === 0;
  const named = vehicles.filter((v) => c.vehicleIds.includes(v._id));

  return (
    <Card className={cn(c.status === 'suspended' && 'opacity-70')}>
      <CardContent className="py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary">
              {c.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {c.name}
                <Badge tone={c.status === 'active' ? 'success' : c.status === 'invited' ? 'warning' : 'muted'}>
                  {c.status === 'invited' ? 'Invite pending' : c.status}
                </Badge>
              </p>
              {c.title && <p className="text-sm text-muted-foreground">{c.title}</p>}
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>
                {c.lastActiveAt ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    active {new Date(c.lastActiveAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    invited {new Date(c.invitedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="outline" loading={busy} onClick={onToggle}>
              {c.status === 'suspended' ? 'Restore' : 'Pause access'}
            </Button>
            <Button size="sm" variant="ghost" aria-label={`Remove ${c.name}`} onClick={onRemove}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Can do</p>
            <ul className="space-y-1 text-sm">
              {c.abilities.map((a) => (
                <li key={a} className="text-muted-foreground">
                  <span className="text-foreground">{ABILITY_LABELS[a]?.label ?? a}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Cars</p>
            {/* "Entire fleet" is stated, never left as an empty list that could
                be misread as no access at all. */}
            {wholeFleet ? (
              <p className="inline-flex items-center gap-1.5 text-sm">
                <Car className="h-4 w-4 text-primary" /> Entire fleet, including cars added later
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {named.map((v) => (
                  <li key={v._id}>{v.year} {v.make} {v.model}</li>
                ))}
                {named.length === 0 && <li className="text-muted-foreground">{c.vehicleIds.length} car(s)</li>}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InviteForm({
  vehicles, busy, onSubmit,
}: {
  vehicles: AssignableVehicle[]; busy: boolean;
  onSubmit: (b: { name: string; email: string; phone?: string; title?: string; abilities: CaptainAbility[]; vehicleIds: string[] }) => void;
}) {
  const [f, setF] = useState({ name: '', email: '', phone: '', title: '' });
  const [abilities, setAbilities] = useState<CaptainAbility[]>(DEFAULTS);
  const [vehicleIds, setVehicleIds] = useState<string[]>([]);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const valid = f.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(f.email) && abilities.length > 0;

  return (
    <Card>
      <CardContent className="space-y-5 py-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Marcus Reed" /></Field>
          <Field label="Email" hint="Where their invite goes">
            <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="marcus@example.com" />
          </Field>
          <Field label="Role" hint="Shown on their profile">
            <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Valet" />
          </Field>
          <Field label="Phone" hint="Optional">
            <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+1 555 0147" />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">What can they do?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL.map((a) => {
              const on = abilities.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAbilities((l) => toggle(l, a))}
                  className={cn(
                    'rounded-xl border p-3 text-start transition-colors',
                    on ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                  )}
                >
                  <p className="text-sm font-medium">{ABILITY_LABELS[a].label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{ABILITY_LABELS[a].detail}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Which cars?</p>
          <p className="mb-2 text-xs text-muted-foreground">
            Pick none to give them the whole fleet, including cars you add later.
          </p>
          <div className="flex flex-wrap gap-2">
            {vehicles.map((v) => {
              const on = vehicleIds.includes(v._id);
              return (
                <button
                  key={v._id}
                  type="button"
                  onClick={() => setVehicleIds((l) => toggle(l, v._id))}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                    on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/40',
                  )}
                >
                  {v.year} {v.make} {v.model}
                </button>
              );
            })}
            {vehicles.length === 0 && <p className="text-sm text-muted-foreground">No cars listed yet.</p>}
          </div>
        </div>

        <Button
          disabled={!valid}
          loading={busy}
          onClick={() =>
            onSubmit({
              name: f.name.trim(),
              email: f.email.trim(),
              phone: f.phone.trim() || undefined,
              title: f.title.trim() || undefined,
              abilities,
              vehicleIds,
            })
          }
        >
          Send invite
        </Button>
      </CardContent>
    </Card>
  );
}
