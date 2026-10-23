'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Mail, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { useLogin, STAFF_ROLES } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api/types';
import { safeRedirect } from '@/lib/utils/safe-redirect';
import { siteUrl } from '@/lib/sites';
import { cn } from '@/lib/utils/cn';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  mfaToken: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;
type Who = 'team' | 'captain';

const COPY: Record<Who, { title: string; body: string }> = {
  team: { title: 'Operations sign-in', body: 'For the CatoDrive House Fleet account.' },
  captain: { title: 'Captain sign-in', body: 'For drivers and valets who run handovers on CatoDrive’s cars.' },
};

function SignIn() {
  const params = useSearchParams();
  const rawNext = params.get('next');
  const [who, setWho] = useState<Who>(params.get('as') === 'captain' ? 'captain' : 'team');
  const login = useLogin({ redirectTo: rawNext ? safeRedirect(rawNext) : who === 'captain' ? '/captain' : safeRedirect(null), denyAnyRole: STAFF_ROLES });
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const mfaRequired = login.error instanceof ApiError && login.error.code === 'MFA_REQUIRED';

  return (
    <div>
      <div role="tablist" aria-label="Who is signing in" className="grid grid-cols-2 gap-1 rounded-full border border-border p-1">
        {([['team', 'CatoDrive team', Building2], ['captain', 'Captain', UserRound]] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={who === value}
            onClick={() => { setWho(value); login.reset(); }}
            className={cn('flex items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors', who === value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      <h2 className="display mt-8 text-3xl sm:text-4xl">{COPY[who].title}</h2>
      <p className="mt-2 text-muted-foreground">{COPY[who].body}</p>
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
        <a href={siteUrl('guest', '/forgot-password')} className="block text-center text-sm font-medium text-primary hover:underline">Forgot your password?</a>
      </form>

      {who === 'captain' && (
        <div className="mt-8 flex gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="font-medium">First time here?</p>
            <p className="mt-1 text-muted-foreground">Captains join by invite. Open the “Accept your invite” link in the email from CatoDrive to set your password. No email? Ask the operations team to resend it.</p>
          </div>
        </div>
      )}
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
