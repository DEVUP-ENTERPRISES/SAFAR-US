'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Gift } from 'lucide-react';
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
    <div className="w-full">
      <div className="mb-10 text-center lg:text-left">
        <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-foreground">Create your account</h2>
        <p className="mt-3 text-lg font-medium text-muted-foreground">
          Join CATO today and start driving.
        </p>
      </div>

      {referralCode && (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-primary/10 p-4 text-base font-medium text-primary">
          <Gift className="h-5 w-5" /> Referral <b className="text-lg">{referralCode}</b> applied — you&apos;ll get welcome credit!
        </div>
      )}

      <form onSubmit={handleSubmit((v) => registerMutation.mutate(v))} className="space-y-6">
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

          <p className="mt-8 text-center text-base font-medium text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-bold text-primary hover:underline">Log in</Link>
          </p>
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
