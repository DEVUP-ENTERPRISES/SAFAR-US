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
import { useLogin, useOnAuthSuccess, ADMIN_ROLES } from '@/features/auth/hooks';
import { SocialSignIn } from '@/features/auth/social-signin';
import { ReturnContext } from '@/features/auth/return-context';
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

  const login = useLogin({ redirectTo: returnTo, denyAnyRole: ADMIN_ROLES });
  const router = useRouter();
  const onAuthSuccess = useOnAuthSuccess();
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mfaRequired = login.error instanceof ApiError && login.error.code === 'MFA_REQUIRED';
  const bookingReturn = returnTo.startsWith('/vehicles/');

  return (
    <div className="w-full">
      {/*
        The heading answers why they are here, not what the form is.

        Someone stopped mid-booking is not "welcoming back" — they are being
        interrupted, and the useful thing to say is that the car and the dates
        they picked are still waiting. ReturnContext renders the car itself
        above it and stays silent when there is nothing to return to.
      */}
      <ReturnContext next={returnTo === '/search' ? null : returnTo} />

      <div className="mb-8 text-center lg:text-start">
        <h2 className="display text-4xl text-foreground sm:text-5xl">
          {bookingReturn ? 'One step left' : 'Welcome back'}
        </h2>
        <p className="mt-3 text-[17px] text-muted-foreground">
          {bookingReturn
            ? 'Sign in to confirm your trip. Nothing you picked has been lost.'
            : 'Sign in to pick up your trips, messages and saved cars.'}
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
            <Link href={`/register?next=${encodeURIComponent(returnTo)}`} className="font-bold text-primary hover:underline">
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
