'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { useLogin } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api/types';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
  mfaToken: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const login = useLogin();
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mfaRequired = login.error instanceof ApiError && login.error.code === 'MFA_REQUIRED';

  return (
    <div className="mx-auto max-w-md py-8">
      <Card>
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit((v) => login.mutate(v))} className="space-y-4">
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

          <p className="mt-4 text-center text-sm text-muted-foreground">
            New to CATO?{' '}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
