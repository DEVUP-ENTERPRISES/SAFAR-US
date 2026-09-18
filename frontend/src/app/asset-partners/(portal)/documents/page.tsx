'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderLock, Upload, ShieldCheck, AlertTriangle, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/ui/states';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils/format';
import { uploadFiles } from '@/features/media/upload';
import { documentsApi, type PartnerDocument } from '@/features/documents/api';
import { ApiError } from '@/lib/api/types';

/**
 * The partner's own paperwork: insurance, registration, title.
 *
 * Insurance is the one that matters operationally — a lapsed policy on a car
 * CatoDrive is renting out is a real exposure, and the application captured an
 * expiry date that nothing ever surfaced again. An expiring policy is flagged
 * here rather than discovered at claim time.
 */

/** The two document types this page collects — a narrower union than the full
 *  DocumentCategory / UploadCategory lists, which also cover KYC and claims. */
type PartnerDocCategory = 'insurance' | 'registration';

const CATEGORIES: { value: PartnerDocCategory; label: string }[] = [
  { value: 'insurance', label: 'Insurance policy' },
  { value: 'registration', label: 'Registration / title' },
];

const CATEGORY_LABEL: Record<string, string> = {
  insurance: 'Insurance policy',
  registration: 'Registration / title',
  kyc: 'Identity',
  claim: 'Claim evidence',
  pollution: 'Emissions',
  fitness: 'Fitness',
};

/** Inside this window, a policy is "expiring" and worth chasing. */
const EXPIRY_WARNING_DAYS = 45;

function daysUntil(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

export default function PartnerDocumentsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<PartnerDocCategory>('insurance');
  const [expiresAt, setExpiresAt] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['partner-documents'],
    queryFn: () => documentsApi.list(),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const [uploaded] = await uploadFiles(category, [file]);
      return documentsApi.create({
        category,
        url: uploaded.url,
        key: uploaded.key,
        expiresAt: expiresAt || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['partner-documents'] });
      setExpiresAt('');
      if (fileRef.current) fileRef.current.value = '';
      toast({ tone: 'success', title: 'Document uploaded' });
    },
    onError: (e) =>
      toast({
        tone: 'error',
        title: e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Upload failed',
      }),
  });

  if (isLoading) {
    return (
      <div className="space-y-6 py-8">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-8">
        <ErrorState message="We couldn’t load your documents." retry={() => refetch()} />
      </div>
    );
  }

  const expiring = data.filter(
    (d) => d.expiresAt && daysUntil(d.expiresAt) <= EXPIRY_WARNING_DAYS,
  );

  return (
    <div className="space-y-6 py-8">
      <PageHeader
        eyebrow="Asset Partners"
        title="Documents"
        description="Insurance, registration and title for the cars in your programme."
      />

      {expiring.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="flex items-start gap-3 py-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="font-semibold">
                {expiring.length} document{expiring.length === 1 ? '' : 's'} expiring soon
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Upload the renewal before it lapses — a car can’t stay on the road with expired
                cover.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5 text-primary" /> Upload a document
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="What is it?">
              <Select value={category} onChange={(e) => setCategory(e.target.value as PartnerDocCategory)}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expires on" hint="Optional — we’ll remind you before it lapses.">
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </Field>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
            }}
            disabled={upload.isPending}
          />
          <p className="text-xs text-muted-foreground">
            JPG, PNG or WebP, up to 12 MB. Photograph the whole page so the dates are readable.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FolderLock className="h-5 w-5 text-primary" /> Your documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-8 w-8" />}
              title="Nothing uploaded yet"
              description="Add your insurance policy and registration to keep the car road-legal."
            />
          ) : (
            <div className="space-y-3">
              {data.map((d) => (
                <DocumentRow key={d._id} doc={d} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DocumentRow({ doc }: { doc: PartnerDocument }) {
  const left = doc.expiresAt ? daysUntil(doc.expiresAt) : null;
  const expired = left !== null && left < 0;
  const expiring = left !== null && left >= 0 && left <= EXPIRY_WARNING_DAYS;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="min-w-0">
        <p className="truncate font-medium">{CATEGORY_LABEL[doc.category] ?? doc.category}</p>
        <p className="text-xs text-muted-foreground">
          Uploaded {formatDate(doc.createdAt)}
          {doc.expiresAt && ` · expires ${formatDate(doc.expiresAt)}`}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {expired && <Badge tone="destructive">Expired</Badge>}
        {expiring && <Badge tone="warning">Expires in {left}d</Badge>}
        {doc.verification?.status === 'verified' && (
          <Badge tone="success">
            <ShieldCheck className="mr-1 h-3 w-3" /> Verified
          </Badge>
        )}
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-primary hover:underline"
        >
          View
        </a>
      </div>
    </div>
  );
}
