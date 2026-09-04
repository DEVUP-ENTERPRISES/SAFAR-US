'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Sparkles, CreditCard, AlertTriangle } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils/cn';
import { ApiError } from '@/lib/api/types';
import { subscriptionApi, describeBenefits, type Plan } from '@/features/subscriptions/api';

const money = (c: number) => `$${(c / 100).toFixed(c % 100 === 0 ? 0 : 2)}`;

/**
 * Membership.
 *
 * Every benefit here is already enforced by the backend — pricing.service reads
 * the member's benefits when it quotes, so the discount, the surge waiver and
 * the included protection apply automatically the moment someone subscribes.
 * The plans were purchasable by API and had no screen, so the whole revenue
 * line was unreachable.
 *
 * Benefit copy is GENERATED from the plan record rather than written here. An
 * admin changing a plan from 5% to 8% must not leave a page advertising 5%, and
 * hardcoding the list is exactly how that happens.
 */
function Membership() {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const plans = useQuery({ queryKey: ['plans'], queryFn: () => subscriptionApi.plans() });
  const mine = useQuery({ queryKey: ['my-subscription'], queryFn: () => subscriptionApi.mine(), retry: false });

  const subscribe = useMutation({
    mutationFn: (code: string) => subscriptionApi.subscribe(code),
    onSuccess: () => {
      toast({ tone: 'success', title: 'You are a member', description: 'Your benefits apply from your next booking.' });
      qc.invalidateQueries({ queryKey: ['my-subscription'] });
    },
    onError: (e) =>
      toast({
        tone: 'error',
        // The server distinguishes "no card" from "bank declined" from
        // "already subscribed"; passing its message through is more useful
        // than a generic failure.
        title: e instanceof ApiError ? e.message : 'Could not start your membership',
      }),
  });

  const cancel = useMutation({
    mutationFn: () => subscriptionApi.cancel(),
    onSuccess: () => {
      toast({ tone: 'success', title: 'Membership cancelled' });
      qc.invalidateQueries({ queryKey: ['my-subscription'] });
    },
    onError: () => toast({ tone: 'error', title: 'Could not cancel' }),
  });

  const onCancel = async () => {
    const { ok } = await confirm({
      title: 'Cancel your membership?',
      description: 'You keep every benefit until the end of the period you have already paid for.',
      confirmLabel: 'Cancel membership',
      tone: 'destructive',
    });
    if (ok) cancel.mutate();
  };

  const active = mine.data && mine.data.status === 'active' ? mine.data : null;
  const list = (plans.data ?? []).filter((p) => p.active).sort((a, b) => a.priceCents - b.priceCents);

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-6">
      <PageHeader
        title="Membership"
        description="Pay monthly, drive cheaper. Benefits apply automatically at checkout — there is no code to remember."
      />

      {/* Current membership first: someone who already pays is here to manage
          it, not to be sold to again. */}
      {active && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="flex flex-wrap items-start justify-between gap-4 py-5">
            <div>
              <p className="flex items-center gap-2 font-semibold">
                <Sparkles className="h-5 w-5 text-primary" />
                You are on {list.find((p) => p.code === active.planCode)?.name ?? active.planCode}
              </p>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {describeBenefits(active.benefitsSnapshot).map((b) => (
                  <li key={b} className="flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-success" /> {b}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-muted-foreground">
                {money(active.pricePaidCents)}/month · renews{' '}
                {new Date(active.renewsAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
              </p>
            </div>
            <Button variant="outline" loading={cancel.isPending} onClick={onCancel}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {mine.data?.status === 'cancelled' && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <p>
              Your membership is cancelled but stays active until{' '}
              {new Date(mine.data.renewsAt).toLocaleDateString('en-US', { dateStyle: 'medium' })} — you already paid
              for it.
            </p>
          </CardContent>
        </Card>
      )}

      {plans.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-64 w-full" />)}</div>
      ) : list.length === 0 ? (
        <EmptyState title="No plans available" description="Memberships are not open yet. Check back soon." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <PlanCard
              key={p.code}
              plan={p}
              current={active?.planCode === p.code}
              disabled={!!active}
              busy={subscribe.isPending}
              onSubscribe={() => subscribe.mutate(p.code)}
            />
          ))}
        </div>
      )}

      {/* Said plainly rather than discovered at checkout. */}
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <CreditCard className="mt-0.5 h-4 w-4 shrink-0" />
        Charged monthly to your saved card. Cancel any time — you keep your benefits until the period you have paid
        for ends, and nothing is charged after that.
      </p>
    </div>
  );
}

function PlanCard({
  plan, current, disabled, busy, onSubscribe,
}: {
  plan: Plan; current: boolean; disabled: boolean; busy: boolean; onSubscribe: () => void;
}) {
  const benefits = describeBenefits(plan.benefits);
  const free = plan.priceCents === 0;

  return (
    <Card className={cn('flex flex-col', current && 'border-primary ring-1 ring-primary')}>
      <CardContent className="flex flex-1 flex-col py-6">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold">{plan.name}</p>
          {current && <Badge tone="success">Current</Badge>}
        </div>

        <p className="numeric mt-2 text-3xl font-bold leading-none">
          {free ? 'Free' : money(plan.priceCents)}
          {!free && <span className="text-base font-medium text-muted-foreground">/mo</span>}
        </p>

        {plan.description && <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>}

        <ul className="mt-4 flex-1 space-y-2 text-sm">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <span>{b}</span>
            </li>
          ))}
          {benefits.length === 0 && <li className="text-muted-foreground">Standard pricing.</li>}
        </ul>

        <Button
          className="mt-5"
          variant={current ? 'outline' : 'primary'}
          disabled={disabled || current || free}
          loading={busy}
          onClick={onSubscribe}
        >
          {current ? 'Your plan' : disabled ? 'Cancel your plan first' : free ? 'Included' : `Join for ${money(plan.priceCents)}/mo`}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function MembershipPage() {
  return (
    <AuthGuard>
      <Membership />
    </AuthGuard>
  );
}
