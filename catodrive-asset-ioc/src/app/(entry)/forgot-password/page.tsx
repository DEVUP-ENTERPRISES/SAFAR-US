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

export default function ForgotPasswordPage() {
  const router = useRouter();
  const notify = useToast();
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const request = useMutation({ meta: { silentError: true }, mutationFn: () => authApi.forgotPassword(email.trim()), onSuccess: () => setStep('reset') });
  const reset = useMutation({
    meta: { silentError: true },
    mutationFn: () => authApi.resetPassword(email.trim(), code.trim(), password),
    onSuccess: () => {
      notify({ tone: 'success', title: 'Password updated', description: 'Sign in with your new password.' });
      router.push('/sign-in');
    },
    onError: (e) => notify({ tone: 'error', title: 'Couldn’t reset', description: e instanceof ApiError ? e.message : 'Check the code and try again.' }),
  });

  return (
    <div>
      <h2 className="display text-3xl sm:text-4xl">{step === 'email' ? 'Reset your password' : 'Enter your code'}</h2>
      <p className="mt-2 text-muted-foreground">
        {step === 'email' ? 'We’ll email you a 6-digit code.' : `We sent a code to ${email}. It expires in 5 minutes.`}
      </p>
      {step === 'email' ? (
        <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) request.mutate(); }} className="mt-8 space-y-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Button type="submit" className="w-full" loading={request.isPending} disabled={!email.trim()}>Send code</Button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (code.trim() && password.length >= 8) reset.mutate(); }} className="mt-8 space-y-4">
          <Field label="6-digit code" htmlFor="code">
            <Input id="code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
          </Field>
          <Field label="New password" htmlFor="password" hint="At least 8 characters.">
            <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <Button type="submit" className="w-full" loading={reset.isPending} disabled={!code.trim() || password.length < 8}>Set new password</Button>
        </form>
      )}
      <p className="mt-8 text-center text-sm text-muted-foreground">
        <Link href="/sign-in" className="font-semibold text-primary hover:underline">Back to sign-in</Link>
      </p>
    </div>
  );
}
