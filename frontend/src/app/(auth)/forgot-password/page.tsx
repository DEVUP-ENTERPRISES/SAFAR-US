'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { authApi } from '@/features/auth/api';
import { ApiError } from '@/lib/api/types';

/**
 * Forgot password — request a code, then set a new password with it.
 *
 * Deliberately never confirms whether an email has an account (the request step
 * always reports "sent"), so this page can't be used to discover who's
 * registered. When email delivery isn't configured yet, the backend returns the
 * code in non-production so the flow is fully usable now — shown here as a hint.
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const notify = useToast();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>();

  const request = useMutation({
    meta: { silentError: true },
    mutationFn: () => authApi.forgotPassword(email.trim()),
    onSuccess: (r) => {
      setDevCode(r.devCode);
      setStep('reset');
    },
  });

  const reset = useMutation({
    meta: { silentError: true },
    mutationFn: () => authApi.resetPassword(email.trim(), code.trim(), password),
    onSuccess: () => {
      notify({ tone: 'success', title: 'Password updated', description: 'Sign in with your new password.' });
      router.push('/login');
    },
    onError: (e) =>
      notify({
        tone: 'error',
        title: 'Couldn’t reset',
        description: e instanceof ApiError ? e.message : 'Check the code and try again.',
      }),
  });

  return (
    <div className="w-full">
      <div className="mb-8 text-center lg:text-start">
        <h2 className="display text-4xl text-foreground sm:text-5xl">
          {step === 'email' ? 'Reset your password' : 'Enter your code'}
        </h2>
        <p className="mt-3 text-[17px] text-muted-foreground">
          {step === 'email'
            ? 'Enter your email and we’ll send a 6-digit code to reset it.'
            : `We sent a code to ${email}. It expires in 5 minutes.`}
        </p>
      </div>

      {step === 'email' ? (
        <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) request.mutate(); }} className="space-y-6">
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button type="submit" className="w-full" loading={request.isPending} disabled={!email.trim()}>
            Send reset code
          </Button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (code.trim() && password.length >= 8) reset.mutate(); }} className="space-y-6">
          {devCode && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              Email isn’t configured yet, so here’s your code for testing: <span className="font-mono font-bold">{devCode}</span>
            </p>
          )}
          <Field label="6-digit code" htmlFor="code">
            <Input id="code" inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} required />
          </Field>
          <Field label="New password" htmlFor="password" hint="At least 8 characters.">
            <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Button type="submit" className="w-full" loading={reset.isPending} disabled={!code.trim() || password.length < 8}>
            Set new password
          </Button>
          <button
            type="button"
            onClick={() => setStep('email')}
            className="w-full text-center text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Use a different email
          </button>
        </form>
      )}

      <p className="mt-8 text-center text-base font-medium text-muted-foreground">
        Remembered it?{' '}
        <Link href="/login" className="font-bold text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
