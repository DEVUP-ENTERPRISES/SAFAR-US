'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Gift, TrendingUp, Check } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { rewardsApi } from '@/features/rewards/api';

const TIER_COLOR: Record<string, string> = {
  bronze: 'from-amber-700 to-amber-500',
  silver: 'from-slate-400 to-slate-300',
  gold: 'from-yellow-500 to-amber-400',
  platinum: 'from-indigo-500 to-purple-500',
};

function Rewards() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['rewards'], queryFn: () => rewardsApi.summary() });
  const [points, setPoints] = useState(100);
  const redeem = useMutation({
    mutationFn: () => rewardsApi.redeem(points),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rewards'] }),
  });

  if (isLoading || !data) return <Skeleton className="h-96 w-full" />;
  const pct = data.nextTier ? Math.min(100, Math.round((data.lifetime / data.nextTier.min) * 100)) : 100;
  const redeemValue = points * data.pointValueCents;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="display text-display-sm">CATO Rewards</h1>

      {/* Hero card */}
      <div className={`overflow-hidden rounded-2xl bg-gradient-to-br ${TIER_COLOR[data.tier.key] ?? 'from-primary to-primary'} p-6 text-white shadow-lift`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="flex items-center gap-1 text-sm text-white/80"><Sparkles className="h-4 w-4" /> {data.tier.label} member</p>
            <p className="mt-1 text-4xl font-black">{data.balance.toLocaleString()} <span className="text-lg font-medium">pts</span></p>
            <p className="text-sm text-white/80">≈ {formatMoney({ amount: data.balance * data.pointValueCents, currency: 'USD' })} in credit</p>
          </div>
          <Gift className="h-12 w-12 text-white/70" />
        </div>
        {data.nextTier && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-white/90">
              <span>{data.lifetime.toLocaleString()} lifetime pts</span>
              <span>{data.toNext.toLocaleString()} to {data.nextTier.label}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/25">
              <div className="h-full rounded-full bg-white" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Perks */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" /> Your {data.tier.label} perks</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {data.tier.perks.map((p) => (
              <div key={p} className="flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-primary" /> {p}</div>
            ))}
          </CardContent>
        </Card>

        {/* Redeem */}
        <Card>
          <CardHeader><CardTitle>Redeem points</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">100 points = $5 wallet credit. Minimum 100.</p>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium">Points to redeem</label>
                <Input type="number" min={100} step={100} value={points} onChange={(e) => setPoints(Number(e.target.value))} />
              </div>
              <Button disabled={points < 100 || points > data.balance} loading={redeem.isPending} onClick={() => redeem.mutate()}>
                Redeem {formatMoney({ amount: redeemValue, currency: 'USD' })}
              </Button>
            </div>
            {redeem.isSuccess && <p className="text-sm text-success">Credited to your wallet ✓</p>}
          </CardContent>
        </Card>
      </div>

      {/* History */}
      <Card>
        <CardHeader><CardTitle>Points history</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {data.history.length === 0 && <p className="text-sm text-muted-foreground">Take a trip to start earning points.</p>}
          {data.history.map((h) => (
            <div key={h._id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
              <div><p className="font-medium">{h.description}</p><p className="text-xs capitalize text-muted-foreground">{h.type} · {formatDate(h.createdAt)}</p></div>
              <span className={`font-semibold ${h.points >= 0 ? 'text-success' : 'text-destructive'}`}>{h.points >= 0 ? '+' : ''}{h.points}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function RewardsPage() {
  return <AuthGuard><Rewards /></AuthGuard>;
}
