'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Mail, Phone, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { adminApi } from '@/features/admin/api';
import { formatDate } from '@/lib/utils/format';

interface Inquiry {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  interest: 'asset_partner' | 'investor' | 'corporate' | 'general' | 'other';
  message: string;
  status: 'new' | 'responded';
  respondedBy?: string;
  respondedAt?: string;
  adminNotes?: string;
  createdAt: string;
}

const INTEREST_LABEL: Record<string, string> = {
  asset_partner: 'Asset Partner', investor: 'Investor', corporate: 'Corporate', general: 'General', other: 'Other',
};

export default function ContactInquiryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');

  const { data: i, isLoading, isError } = useQuery({
    queryKey: ['contact-inquiry', id],
    queryFn: () => adminApi.contactInquiry(id) as Promise<Inquiry>,
  });

  const respond = useMutation({
    mutationFn: () => adminApi.respondContactInquiry(id, notes || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact-inquiry', id] });
      qc.invalidateQueries({ queryKey: ['contact-inquiries'] });
      qc.invalidateQueries({ queryKey: ['contact-inquiry-counts'] });
    },
  });

  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (isError || !i) return <ErrorState message="Inquiry not found." />;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to inquiries
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="display text-2xl">{i.fullName}</h1>
          <p className="text-sm text-muted-foreground">{INTEREST_LABEL[i.interest]} · {formatDate(i.createdAt)}</p>
        </div>
        <Badge tone={i.status === 'responded' ? 'success' : 'warning'}>{i.status}</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Contact details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <a href={`mailto:${i.email}`} className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
            <Mail className="h-4 w-4" /> {i.email}
          </a>
          {i.phone && (
            <a href={`tel:${i.phone}`} className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
              <Phone className="h-4 w-4" /> {i.phone}
            </a>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Message</CardTitle></CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{i.message}</p>
        </CardContent>
      </Card>

      {i.status === 'responded' ? (
        <Card className="border-success/40 bg-success/5">
          <CardContent className="space-y-2 py-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-success">
              <CheckCircle2 className="h-4 w-4" /> Responded {i.respondedAt && formatDate(i.respondedAt)}
            </p>
            {i.adminNotes && <p className="text-sm text-muted-foreground">{i.adminNotes}</p>}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Mark as responded</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes — what you said, next steps…" rows={3} />
            <Button loading={respond.isPending} onClick={() => respond.mutate()}>
              <CheckCircle2 className="h-4 w-4" /> Mark responded
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
