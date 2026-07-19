'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Briefcase } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { useLogin } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api/types';

const schema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Password is required') });
type FormValues = z.infer<typeof schema>;

export default function CorporateLoginPage() {
  const login = useLogin({ redirectTo: '/corporate', portalLabel: 'corporate' });
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center py-8">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Building2 className="h-7 w-7" />
        </span>
        <div>
          <h1 className="display text-3xl">Corporate Mobility</h1>
          <p className="flex items-center justify-center gap-1 text-sm text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5" /> Manage your team&apos;s business travel
          </p>
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit((v) => login.mutate(v))} className="space-y-4">
            <Field label="Work email" htmlFor="email" error={formState.errors.email?.message}>
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
            <Button type="submit" className="w-full" loading={login.isPending}>Sign in</Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            New here? <Link href="/register" className="font-medium text-primary hover:underline">Create an account</Link> then set up your organization.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
