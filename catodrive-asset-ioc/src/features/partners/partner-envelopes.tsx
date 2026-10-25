'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { FileSignature, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { partnerManageApi } from '@/features/asset-partners/manage-api';
import { EnvelopeCard } from '@/features/asset-partners/envelope-card';

const manage = partnerManageApi('/ioc');

/** Every sealed signing for this partner: IDs, documents, history, and a way to send their copy again. */
export function PartnerEnvelopes({ partnerId }: { partnerId: string }) {
  const toast = useToast();
  const q = useQuery({ queryKey: ['ioc-partner-envelopes', partnerId], queryFn: () => manage.envelopes(partnerId) });
  const resend = useMutation({
    mutationFn: (envelopeId: string) => manage.resendCopy(partnerId, envelopeId),
    onSuccess: () => toast({ tone: 'success', title: 'Copy sent to the partner' }),
    onError: () => toast({ tone: 'error', title: 'We couldn’t send it. Try again.' }),
  });

  if (q.isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (q.isError) return <ErrorState message="Couldn’t load the signed envelopes." retry={() => void q.refetch()} />;
  if (!q.data?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><FileSignature className="h-5 w-5 text-primary" aria-hidden /> Signed envelopes</CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">Sealed when signed and checked on every download. Anyone can confirm a copy at partners.catodrive.com/verify.</p>
      </CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {q.data.map((e) => (
          <EnvelopeCard
            key={e.envelopeId}
            envelope={e}
            download={manage.sealedDocument}
            actions={
              <Button variant="outline" size="sm" loading={resend.isPending && resend.variables === e.envelopeId} disabled={resend.isPending} onClick={() => resend.mutate(e.envelopeId)}>
                <Send className="h-4 w-4" aria-hidden /> Resend copy
              </Button>
            }
          />
        ))}
      </CardContent>
    </Card>
  );
}
