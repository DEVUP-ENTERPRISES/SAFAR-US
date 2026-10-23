'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Trash2 } from 'lucide-react';
import { AuthGuard } from '@/components/layout/auth-guard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { accountApi } from '@/features/account/api';
import { signOutEverywhere } from '@/features/auth/session';

/** Deleting the account: refused while a trip, dispute, deposit or legal hold is open; the holder proves it is them again. */
function DeleteAccount() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeMode, setCodeMode] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();
  const eligibility = useQuery({ queryKey: ['erasure-eligibility'], queryFn: () => accountApi.erasureEligibility() });

  const sendCode = useMutation({
    meta: { silentError: true },
    mutationFn: () => accountApi.requestErasureCode(),
    onSuccess: (r) => {
      setCodeMode(true);
      setDevCode(r.devCode);
      toast({ tone: 'success', title: 'Code sent', description: 'Check your email or texts for the code.' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'Couldn’t send a code. Please try again.' }),
  });
  const erase = useMutation({
    meta: { silentError: true },
    mutationFn: () => accountApi.erase(codeMode ? { code } : { password }),
    onSuccess: async () => {
      await signOutEverywhere(qc);
      toast({ tone: 'success', title: 'Your account has been deleted' });
      router.replace('/');
    },
  });

  return (
    <div className="container max-w-xl py-8">
      <Link href="/account" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Account
      </Link>
      <PageHeader title="Delete account" description="Permanently remove your CatoDrive account." />
      {eligibility.isLoading ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : eligibility.isError || !eligibility.data ? (
        <ErrorState message="We couldn’t check your account just now." retry={() => eligibility.refetch()} />
      ) : !eligibility.data.eligible ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="flex items-center gap-2 text-lg font-semibold">
              <AlertTriangle className="h-5 w-5 text-warning" /> You can’t delete your account yet
            </p>
            <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
              {eligibility.data.blockers.map((b) => <li key={b}>{b}</li>)}
            </ul>
            <p className="text-sm text-muted-foreground">
              Once these are settled you can delete your account here, or <Link href="/support" className="font-medium text-primary hover:underline">contact support</Link> for help.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-5 p-6">
            <p className="text-sm">Deleting your account is permanent. Your profile, saved cars, messages and documents are removed and your sign-in stops working.</p>
            <p className="text-sm text-muted-foreground">Records the law requires us to keep (payments, receipts, tax) are kept without your name attached.</p>
            {codeMode ? (
              <>
                {devCode && <p className="text-xs font-medium text-warning">Test code: {devCode}</p>}
                <Field label="Confirmation code">
                  <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Your password">
                  <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <Button variant="ghost" size="sm" loading={sendCode.isPending} onClick={() => sendCode.mutate()}>
                  I signed up without a password: send me a code
                </Button>
              </>
            )}
            {erase.isError && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {erase.error instanceof ApiError ? erase.error.message : 'That didn’t go through. Please try again.'}
              </p>
            )}
            <Button variant="destructive" className="w-full" loading={erase.isPending} disabled={codeMode ? code.length < 4 : !password} onClick={() => erase.mutate()}>
              <Trash2 className="h-4 w-4" /> Delete my account
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function DeleteAccountPage() {
  return (
    <AuthGuard>
      <DeleteAccount />
    </AuthGuard>
  );
}
