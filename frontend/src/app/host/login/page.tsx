'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Car, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { useLogin } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api/types';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

export default function HostLoginPage() {
  const login = useLogin({ redirectTo: '/host', portalLabel: 'host' });
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center py-8">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Car className="h-7 w-7" />
        </span>
        <div>
          <h1 className="display text-3xl">Host Portal</h1>
          <p className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Manage your vehicles &amp; earnings
          </p>
        </div>
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
              Sign in to Host Portal
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            New to hosting?{' '}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Create an account
            </Link>{' '}
            then list your car.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
