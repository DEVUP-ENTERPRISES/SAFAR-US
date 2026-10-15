'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/features/auth/store';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { useRegister } from '@/features/auth/hooks';
import { ApiError } from '@/lib/api/types';

const schema = z.object({
  firstName: z.string().trim().min(1, 'Required'),
  lastName: z.string().trim().min(1, 'Required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
});
type FormValues = z.infer<typeof schema>;

export default function SignUpPage() {
  const signUp = useRegister({ redirectTo: '/onboarding' });
  const router = useRouter();
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  // Someone already signed in carries on where they left off.
  useEffect(() => {
    if (signedIn && !signUp.isPending && !signUp.isSuccess) router.replace('/');
  }, [signedIn, signUp.isPending, signUp.isSuccess, router]);
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  return (
    <div>
      <h2 className="display text-3xl sm:text-4xl">Become a partner</h2>
      <p className="mt-2 text-muted-foreground">Create your account. Next you’ll confirm your email and tell us about your car.</p>
      <form onSubmit={handleSubmit((v) => signUp.mutate(v))} className="mt-8 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" error={formState.errors.firstName?.message}>
            <Input id="firstName" autoComplete="given-name" {...register('firstName')} />
          </Field>
          <Field label="Last name" htmlFor="lastName" error={formState.errors.lastName?.message}>
            <Input id="lastName" autoComplete="family-name" {...register('lastName')} />
          </Field>
        </div>
        <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" hint="Use at least 8 characters." error={formState.errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        {signUp.isError && (
          <p role="alert" className="text-sm text-destructive">
            {signUp.error instanceof ApiError ? signUp.error.message : 'We couldn’t create the account'}
          </p>
        )}
        <Button type="submit" className="w-full" loading={signUp.isPending}>Create account</Button>
      </form>
      <p className="mt-6 text-sm text-muted-foreground">
        Already a partner? <Link href="/sign-in" className="font-bold text-primary hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
