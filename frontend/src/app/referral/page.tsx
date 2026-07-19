'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Gift, Copy, Check, Users } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/utils/format';

interface Referral {
  code: string; referred: number; pending: number;
  rewardPerReferral: { youGetCents: number; friendGetsCents: number };
}

function ReferralInner() {
  const { data, isLoading } = useQuery({ queryKey: ['referral'], queryFn: () => api.get<Referral>('/referral/me') });
  const [copied, setCopied] = useState(false);

  if (isLoading || !data) return <Skeleton className="h-80 w-full" />;
  const link = typeof window !== 'undefined' ? `${window.location.origin}/register?ref=${data.code}` : `/register?ref=${data.code}`;
  const copy = () => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Gift className="h-7 w-7" /></span>
        <h1 className="display mt-3 text-display-sm">Give {formatMoney({ amount: data.rewardPerReferral.friendGetsCents, currency: 'USD' })}, get {formatMoney({ amount: data.rewardPerReferral.youGetCents, currency: 'USD' })}</h1>
        <p className="mt-1 text-muted-foreground">Your friend gets credit on signup. You earn when they take their first trip.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Your referral code</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-4">
            <span className="text-2xl font-black tracking-widest text-primary">{data.code}</span>
            <Button onClick={copy}>{copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy link</>}</Button>
          </div>
          <p className="break-all text-xs text-muted-foreground">{link}</p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardContent className="flex items-center gap-4 pt-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-success/10 text-success"><Users className="h-5 w-5" /></span>
          <div><p className="text-sm text-muted-foreground">Friends joined</p><p className="text-2xl font-bold">{data.referred}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-4 pt-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary"><Gift className="h-5 w-5" /></span>
          <div><p className="text-sm text-muted-foreground">Pending (not yet traveled)</p><p className="text-2xl font-bold">{data.pending}</p></div>
        </CardContent></Card>
      </div>
    </div>
  );
}

export default function ReferralPage() {
  return <AuthGuard><ReferralInner /></AuthGuard>;
}
