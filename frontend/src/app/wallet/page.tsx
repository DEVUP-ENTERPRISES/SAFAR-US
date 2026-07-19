'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet as WalletIcon, Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { walletApi } from '@/features/wallet/api';

const PRESETS = [2500, 5000, 10000, 20000]; // cents

function Wallet() {
  const qc = useQueryClient();
  const balanceQ = useQuery({ queryKey: ['wallet', 'balance'], queryFn: () => walletApi.balance() });
  const txQ = useQuery({ queryKey: ['wallet', 'transactions'], queryFn: () => walletApi.transactions() });
  const [amount, setAmount] = useState(5000);

  const topup = useMutation({
    mutationFn: () => walletApi.topup(amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wallet', 'balance'] });
      qc.invalidateQueries({ queryKey: ['wallet', 'transactions'] });
    },
  });

  if (balanceQ.isLoading || !balanceQ.data) return <Skeleton className="h-96 w-full" />;
  const balance = balanceQ.data.balance;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="display text-display-sm">CATO Wallet</h1>

      {/* Balance hero */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-indigo-600 p-6 text-white shadow-lift">
        <div className="flex items-center justify-between">
          <div>
            <p className="flex items-center gap-1 text-sm text-white/80"><WalletIcon className="h-4 w-4" /> Available balance</p>
            <p className="mt-1 text-4xl font-black">{formatMoney({ amount: balance, currency: balanceQ.data.currency })}</p>
            <p className="text-sm text-white/80">Pay instantly at checkout — no card needed.</p>
          </div>
          <WalletIcon className="h-12 w-12 text-white/60" />
        </div>
      </div>

      {/* Top up */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> Add money</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setAmount(p)}
                className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
                  amount === p ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
                }`}
              >
                {formatMoney({ amount: p, currency: 'USD' })}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium">Custom amount (USD)</label>
              <Input
                type="number"
                min={1}
                step={1}
                value={(amount / 100).toString()}
                onChange={(e) => setAmount(Math.round(Number(e.target.value) * 100))}
              />
            </div>
            <Button disabled={amount < 100} loading={topup.isPending} onClick={() => topup.mutate()}>
              Add {formatMoney({ amount, currency: 'USD' })}
            </Button>
          </div>
          {topup.isSuccess && <p className="text-sm text-success">Added to your wallet ✓</p>}
          {topup.isError && <p className="text-sm text-destructive">Top-up failed. Please try again.</p>}
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card>
        <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {txQ.isLoading && <Skeleton className="h-24 w-full" />}
          {txQ.data && txQ.data.length === 0 && (
            <p className="text-sm text-muted-foreground">No transactions yet. Add money to get started.</p>
          )}
          {txQ.data?.map((t) => {
            const isCredit = t.direction === 'credit';
            return (
              <div key={t._id} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`grid h-8 w-8 place-items-center rounded-full ${isCredit ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                    {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </span>
                  <div>
                    <p className="font-medium">{t.description}</p>
                    <p className="text-xs capitalize text-muted-foreground">{t.refType.replace(/_/g, ' ')} · {formatDate(t.postedAt)}</p>
                  </div>
                </div>
                <span className={`font-semibold ${isCredit ? 'text-success' : 'text-destructive'}`}>
                  {isCredit ? '+' : '−'}{formatMoney({ amount: t.amount, currency: t.currency })}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

export default function WalletPage() {
  return <AuthGuard><Wallet /></AuthGuard>;
}
