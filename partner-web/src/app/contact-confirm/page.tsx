'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldQuestion, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { assetPartnerApi } from '@/features/asset-partners/api';
import { ApiError } from '@/lib/api/types';

/** Public: someone named as a partner's emergency contact confirms or declines, from the link in their text. */
function ConfirmContact() {
  const token = useSearchParams()?.get('t') ?? '';
  const [done, setDone] = useState<'confirmed' | 'declined' | null>(null);
  const q = useQuery({ queryKey: ['contact-confirm', token], queryFn: () => assetPartnerApi.contactConfirmView(token), enabled: token.length > 10, retry: false });
  const answer = useMutation({ meta: { silentError: true }, mutationFn: (d: 'confirmed' | 'declined') => assetPartnerApi.contactConfirmRespond(token, d), onSuccess: (r) => setDone(r.status as 'confirmed' | 'declined') });

  if (!token) return <ErrorState message="This link is missing its code. Open it again from your text message." />;
  if (q.isLoading) return <Skeleton className="h-56 w-full rounded-lg" />;
  if (q.isError) return <ErrorState message="We couldn’t check this link. Try again in a moment." retry={() => void q.refetch()} />;
  const v = q.data;
  if (!v?.valid) return <ErrorState message="This link isn’t valid. It may have been replaced by a newer one." />;

  const status = done ?? (v.status === 'confirmed' || v.status === 'declined' ? v.status : null);
  const role = v.role === 'representative' ? 'the person who can decide about their car if we can’t reach them' : 'their emergency contact';

  return (
    <Card>
      <CardContent className="space-y-5 p-5 sm:p-6">
        {status === 'confirmed' ? (
          <div className="flex items-start gap-3" role="status">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-success" />
            <div><h1 className="text-xl font-bold">Thank you, {v.contactName}</h1><p className="text-sm text-muted-foreground">You’re confirmed as {role}. We’ll only call you if we can’t reach {v.partnerName}.</p></div>
          </div>
        ) : status === 'declined' ? (
          <div className="flex items-start gap-3" role="status">
            <XCircle className="h-6 w-6 shrink-0 text-muted-foreground" />
            <div><h1 className="text-xl font-bold">Got it</h1><p className="text-sm text-muted-foreground">We’ve removed you and asked {v.partnerName} to name someone else. We won’t contact you about this again.</p></div>
          </div>
        ) : v.expired ? (
          <ErrorState message={`This link has expired. Ask ${v.partnerName} to send it again from their CatoDrive profile.`} />
        ) : (
          <>
            <div className="flex items-start gap-3">
              <ShieldQuestion className="h-6 w-6 shrink-0 text-primary" />
              <div className="min-w-0">
                <h1 className="text-xl font-bold">Hi {v.contactName}</h1>
                <p className="text-sm text-muted-foreground">{v.partnerName} keeps a car with CatoDrive and named you as {role}. We’d only call you if something happens to their car and we can’t reach them. You won’t get marketing, and you’re not responsible for the car or any money.</p>
              </div>
            </div>
            {answer.isError && <p role="alert" className="text-sm text-destructive">{answer.error instanceof ApiError ? answer.error.message : 'That didn’t go through. Try again.'}</p>}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="w-full sm:w-auto" loading={answer.isPending && answer.variables === 'confirmed'} onClick={() => answer.mutate('confirmed')}>Yes, that’s fine</Button>
              <Button variant="outline" className="w-full sm:w-auto" loading={answer.isPending && answer.variables === 'declined'} onClick={() => answer.mutate('declined')}>No, please remove me</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function ContactConfirmPage() {
  return (
    <div className="mx-auto max-w-xl py-8">
      <Suspense fallback={<Skeleton className="h-56 w-full rounded-lg" />}>
        <ConfirmContact />
      </Suspense>
    </div>
  );
}
