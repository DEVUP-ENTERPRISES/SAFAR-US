'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { useLogin, useOnAuthSuccess } from '@/features/auth/hooks';
import { SocialSignIn } from '@/features/auth/social-signin';
import { ApiError } from '@/lib/api/types';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  mfaToken: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function LoginInner() {
  const qp = useSearchParams();
  // Send people back to whatever they were trying to do. Only same-site paths
  // are honoured — an absolute URL here would be an open redirect.
  const next = qp.get('next');
  const returnTo = next && next.startsWith('/') && !next.startsWith('//') ? next : '/search';

  const login = useLogin({ redirectTo: returnTo });
  const router = useRouter();
  const onAuthSuccess = useOnAuthSuccess();
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mfaRequired = login.error instanceof ApiError && login.error.code === 'MFA_REQUIRED';

  return (
    <div className="w-full">
      <div className="mb-10 text-center lg:text-start">
        <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-foreground">Welcome back</h2>
        <p className="mt-3 text-lg font-medium text-muted-foreground">
          Enter your details to sign in to your account.
        </p>
      </div>
      
      <form onSubmit={handleSubmit((v) => login.mutate(v))} className="space-y-6">
            <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
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
                {login.error instanceof ApiError ? login.error.message : 'Login failed'}
              </p>
            )}

            <Button type="submit" className="w-full" loading={login.isPending}>
              {mfaRequired ? 'Verify & log in' : 'Log in'}
            </Button>
          </form>

          <div className="mt-8">
            <SocialSignIn
              onSuccess={(result) => {
                onAuthSuccess(result);
                router.push(returnTo);
              }}
            />
          </div>

          <p className="mt-8 text-center text-base font-medium text-muted-foreground">
            New to CATO?{' '}
            <Link href="/register" className="font-bold text-primary hover:underline">
              Create an account
            </Link>
          </p>
    </div>
  );
}

/**
 * useSearchParams (for the ?next= return path) opts the tree into client-side
 * rendering, which Next refuses to prerender without a boundary.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
