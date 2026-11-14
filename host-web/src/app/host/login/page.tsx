'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Car, Mail, TrendingUp, UserRound } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { useLogin } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api/types';
import { cn } from '@/lib/utils/cn';
import { safeRedirect } from '@/lib/utils/safe-redirect';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

type Who = 'host' | 'captain';

function HostLogin() {
  const params = useSearchParams();
  const next = params.get('next');
  const [who, setWho] = useState<Who>(params.get('as') === 'captain' ? 'captain' : 'host');
  const login = useLogin({ redirectTo: next ? safeRedirect(next) : who === 'captain' ? '/captain' : '/host', portalLabel: 'host' });
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center py-8">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Car className="h-7 w-7" />
        </span>
        <div>
          <h1 className="display text-3xl">{who === 'captain' ? 'Captain sign-in' : 'Host Portal'}</h1>
          <p className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
            {who === 'captain' ? <><UserRound className="h-3.5 w-3.5" /> For drivers and valets who run a host’s handovers</> : <><TrendingUp className="h-3.5 w-3.5" /> Manage your vehicles &amp; earnings</>}
          </p>
        </div>
      </div>

      <div role="tablist" aria-label="Who is signing in" className="mb-4 grid grid-cols-2 gap-1 rounded-full border border-border p-1">
        {([['host', 'Host', Car], ['captain', 'Captain', UserRound]] as const).map(([value, label, Icon]) => (
          <button key={value} role="tab" type="button" aria-selected={who === value} onClick={() => { setWho(value); login.reset(); }}
            className={cn('flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', who === value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}>
            <Icon className="h-4 w-4" aria-hidden /> {label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit((v) => login.mutate(v))} className="space-y-4">
            <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
            </Field>
            <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
              <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
            </Field>

            {login.isError && (
              <p role="alert" className="text-sm text-destructive">
                {login.error instanceof ApiError ? login.error.message : 'Login failed'}
              </p>
            )}

            <Button type="submit" className="w-full" loading={login.isPending}>
              {who === 'captain' ? 'Sign in' : 'Sign in to Host Portal'}
            </Button>
            <Link href="/forgot-password" className="block text-center text-sm font-medium text-primary hover:underline">Forgot your password?</Link>
          </form>

          {who === 'captain' ? (
            <div className="mt-4 flex gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
              <p className="text-muted-foreground"><span className="block font-medium text-foreground">First time here?</span>Captains join by invite. Open the “Accept your invite” link in the email to set your password. No email? Ask your host to resend it.</p>
            </div>
          ) : (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            New to hosting?{' '}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create an account
            </Link>{' '}
            then list your car.
          </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function HostLoginPage() {
  return (
    <Suspense>
      <HostLogin />
    </Suspense>
  );
}
