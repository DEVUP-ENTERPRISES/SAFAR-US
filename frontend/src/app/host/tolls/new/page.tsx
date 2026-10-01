'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, EyeOff, Lightbulb, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';
import { ApiError } from '@/lib/api/types';
import { hostTollsApi, TOLL_AGENCIES, agencyLabel } from '@/features/host/tolls-api';

/** Link a toll account in two steps, like Turo: pick the agency, then log in with that agency's details. */
export default function LinkTollAccountPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const existing = useQuery({ queryKey: ['host-toll-accounts'], queryFn: () => hostTollsApi.accounts() });
  const [agency, setAgency] = useState<string | null>(null);
  const [step, setStep] = useState<'agency' | 'login'>('agency');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [nickname, setNickname] = useState('');
  const defaultNickname = `${(agency ?? 'ntta').toUpperCase()}-${(existing.data?.length ?? 0) + 1}`;

  const link = useMutation({
    mutationFn: () => hostTollsApi.link({ agency: 'ntta', nickname: nickname.trim() || defaultNickname, username, password }),
    onSuccess: (a) => {
      qc.invalidateQueries({ queryKey: ['host-toll-accounts'] });
      toast({ tone: 'success', title: 'Toll account linked', description: 'Now choose the cars that run on it.' });
      router.replace(`/host/tolls/${a._id}?edit=1`);
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Could not link the account' }),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-28">
      <button
        type="button"
        onClick={() => (step === 'login' ? setStep('agency') : router.push('/host/tolls'))}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-5 w-5" /> Back
      </button>

      {step === 'agency' ? (
        <>
          <h1 className="display text-2xl">Choose your toll agency</h1>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {TOLL_AGENCIES.map((a) => (
              <label
                key={a.id}
                className={cn('flex items-center justify-between gap-3 px-4 py-4', a.supported ? 'cursor-pointer' : 'cursor-not-allowed opacity-50')}
              >
                <span className="text-base">
                  {a.label}
                  {!a.supported && <span className="block text-xs text-muted-foreground">Coming soon</span>}
                </span>
                <input
                  type="radio"
                  name="agency"
                  disabled={!a.supported}
                  checked={agency === a.id}
                  onChange={() => setAgency(a.id)}
                  className="h-5 w-5 accent-[hsl(var(--primary))]"
                />
              </label>
            ))}
          </div>
          <p className="flex items-start gap-3 rounded-2xl bg-primary/10 p-4 text-sm">
            <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            For transponders that work across several agencies, choose the main agency of the account you use to manage invoices and payments.
          </p>
          <p className="text-sm text-muted-foreground">Don’t see your toll agency? Support for more agencies is coming soon.</p>
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
            <Button size="lg" className="mx-auto block w-full max-w-2xl" disabled={!agency} onClick={() => setStep('login')}>Next</Button>
          </div>
        </>
      ) : (
        <>
          <div>
            <h1 className="display text-3xl">Log in to link account</h1>
            <p className="mt-2 text-muted-foreground">Use your {agencyLabel(agency ?? 'ntta')} account details to log in.</p>
          </div>
          <div className="space-y-4">
            <Field label="Account number or username">
              <Input value={username} autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Password">
              <div className="relative">
                <Input type={show ? 'text' : 'password'} value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} className="pe-11" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 end-0 px-3 text-muted-foreground" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </Field>
            <Field label="Set account nickname" hint="Nicknames help you tell linked toll accounts apart.">
              <Input value={nickname} placeholder={defaultNickname} onChange={(e) => setNickname(e.target.value)} />
            </Field>
          </div>
          <p className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-sm">
            <Lock className="mt-0.5 h-5 w-5 shrink-0" />
            Your account details are stored encrypted and never shown again. By linking your toll account, you authorize CatoDrive to retrieve toll transactions for your vehicles with CatoDrive trips.
          </p>
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0">
            <Button size="lg" className="mx-auto block w-full max-w-2xl" disabled={!username.trim() || !password} loading={link.isPending} onClick={() => link.mutate()}>
              Log in
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
