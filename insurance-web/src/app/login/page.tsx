'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Lock, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { useLogin, INSURANCE_DESK_ROLES } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api/types';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  mfaToken: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function DeskLoginPage() {
  const login = useLogin({ redirectTo: '/insurers', requireAnyRole: INSURANCE_DESK_ROLES, portalLabel: 'insurance desk' });
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const mfaRequired = login.error instanceof ApiError && login.error.code === 'MFA_REQUIRED';

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-foreground text-background">
          <ShieldCheck className="h-7 w-7" />
        </span>
        <div>
          <h1 className="display text-3xl">Insurance desk</h1>
          <p className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
            <Lock className="h-3.5 w-3.5" /> Authorized personnel only
          </p>
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit((v) => login.mutate(v))} className="space-y-4">
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
        </CardContent>
      </Card>
    </div>
  );
}
