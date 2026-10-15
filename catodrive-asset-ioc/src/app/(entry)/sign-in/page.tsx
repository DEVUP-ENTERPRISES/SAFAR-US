'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { useLogin, STAFF_ROLES } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api/types';
import { safeRedirect } from '@/lib/utils/safe-redirect';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  mfaToken: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function SignIn() {
  const next = safeRedirect(useSearchParams().get('next'));
  const login = useLogin({ redirectTo: next, denyAnyRole: STAFF_ROLES });
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const mfaRequired = login.error instanceof ApiError && login.error.code === 'MFA_REQUIRED';

  return (
    <div>
      <h2 className="display text-3xl sm:text-4xl">Operations sign-in</h2>
      <p className="mt-2 text-muted-foreground">Sign in with the House Fleet account or your captain account.</p>
      <form onSubmit={handleSubmit((v) => login.mutate(v))} className="mt-8 space-y-4">
        <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="username" {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
        </Field>
        {mfaRequired && (
          <Field label="Two-factor code" htmlFor="mfa" hint="Enter the 6-digit code from your authenticator app.">
            <Input id="mfa" inputMode="numeric" maxLength={6} placeholder="123456" {...register('mfaToken')} />
          </Field>
        )}
        {login.isError && !mfaRequired && (
          <p role="alert" className="text-sm text-destructive">
            {login.error instanceof ApiError ? login.error.message : 'Sign-in failed'}
          </p>
        )}
        <Button type="submit" className="w-full" loading={login.isPending}>
          {mfaRequired ? 'Verify & sign in' : 'Sign in'}
        </Button>
      </form>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}
