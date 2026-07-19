'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Gift } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { useRegister } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api/types';

const schema = z.object({
  firstName: z.string().min(1, 'Required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
  referralCode: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

function RegisterInner() {
  const qp = useSearchParams();
  const registerMutation = useRegister();
  const { register, handleSubmit, setValue, watch, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const ref = qp.get('ref');
  useEffect(() => { if (ref) setValue('referralCode', ref); }, [ref, setValue]);
  const referralCode = watch('referralCode');

  return (
    <div className="mx-auto max-w-md py-8">
      <Card>
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
        </CardHeader>
        <CardContent>
          {referralCode && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm text-primary">
              <Gift className="h-4 w-4" /> Referral <b>{referralCode}</b> applied — you&apos;ll get welcome credit!
            </div>
          )}
          <form onSubmit={handleSubmit((v) => registerMutation.mutate(v))} className="space-y-4">
            <Field label="First name" htmlFor="firstName" error={formState.errors.firstName?.message}>
              <Input id="firstName" autoComplete="given-name" {...register('firstName')} />
            </Field>
            <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
              <Input id="email" type="email" autoComplete="email" {...register('email')} />
            </Field>
            <Field label="Password" htmlFor="password" hint="Use at least 8 characters." error={formState.errors.password?.message}>
              <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
            </Field>
            <Field label="Referral code (optional)" htmlFor="referralCode">
              <Input id="referralCode" placeholder="Have a code?" {...register('referralCode')} />
            </Field>

            {registerMutation.isError && (
              <p role="alert" className="text-sm text-destructive">
                {registerMutation.error instanceof ApiError ? registerMutation.error.message : 'Registration failed'}
              </p>
            )}

            <Button type="submit" className="w-full" loading={registerMutation.isPending}>
              Create account
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">Log in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterInner />
    </Suspense>
  );
}
