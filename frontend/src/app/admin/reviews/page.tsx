'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Star, EyeOff, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { PageHeader } from '@/components/ui/page-header';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { formatDate } from '@/lib/utils/format';
import { adminApi, type AdminReview } from '@/features/admin/api';

export default function AdminReviewsPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState('');
  const [lowOnly, setLowOnly] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-reviews', status, lowOnly],
    queryFn: () => adminApi.reviews({ status: status || undefined, minRating: lowOnly ? 2 : undefined }),
  });

  const setStatusMut = useMutation({
    mutationFn: ({ id, s }: { id: string; s: 'published' | 'hidden' }) => adminApi.setReviewStatus(id, s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-reviews'] }),
  });

  const hide = async (r: AdminReview) => {
    const { ok } = await confirm({
      title: 'Hide this review?',
      description:
        'It stops appearing on the listing and in rating averages. Use for abuse or personal information — not for a bad but honest review.',
      confirmLabel: 'Hide review',
      tone: 'destructive',
    });
    if (ok) setStatusMut.mutate({ id: r._id, s: 'hidden' });
  };

  const publish = async (r: AdminReview) => {
    const { ok } = await confirm({
      title: 'Republish this review?',
      description: 'It will appear publicly on the listing again.',
      confirmLabel: 'Republish',
    });
    if (ok) setStatusMut.mutate({ id: r._id, s: 'published' });
  };

  const columns: Column<AdminReview>[] = [
    {
      header: 'Rating',
      cell: (r) => (
        <span className="flex items-center gap-1 font-semibold tabular-nums">
          <Star className={`h-3.5 w-3.5 ${r.rating <= 2 ? 'fill-destructive text-destructive' : 'fill-foreground text-foreground'}`} />
          {r.rating}
        </span>
      ),
    },
    {
      header: 'Review',
      cell: (r) => <p className="line-clamp-2 max-w-md text-sm">{r.comment || <span className="text-muted-foreground">No comment</span>}</p>,
    },
    {
      header: 'Direction',
      cell: (r) => (
        <span className="text-xs capitalize text-muted-foreground">{r.direction.replace(/_/g, ' → ')}</span>
      ),
    },
    { header: 'Posted', cell: (r) => <span className="text-xs">{formatDate(r.createdAt)}</span> },
    {
      header: 'Status',
      cell: (r) => <Badge tone={r.status === 'published' ? 'success' : 'muted'}>{r.status}</Badge>,
    },
    {
      header: 'Actions',
      className: 'text-end',
      cell: (r) => (
        <div className="flex justify-end gap-2">
          {r.status === 'published' ? (
            <Button size="sm" variant="ghost" className="text-destructive" loading={setStatusMut.isPending} onClick={() => hide(r)}>
              <EyeOff className="h-4 w-4" /> Hide
            </Button>
          ) : (
            <Button size="sm" variant="outline" loading={setStatusMut.isPending} onClick={() => publish(r)}>
              <Eye className="h-4 w-4" /> Republish
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="Reviews"
        description="Moderate guest and host reviews. Hiding removes a review from listings and rating averages."
      />

      <div className="flex flex-wrap gap-2">
        {['', 'published', 'hidden'].map((s) => (
          <Chip key={s || 'all'} active={status === s} onClick={() => setStatus(s)} className="capitalize">
            {s || 'All'}
          </Chip>
        ))}
        <Chip active={lowOnly} onClick={() => setLowOnly((v) => !v)}>
          ★ 2 and below
        </Chip>
      </div>

      <DataTable
        columns={columns}
        rows={data}
        isLoading={isLoading}
        emptyTitle="No reviews"
        emptyDescription="Reviews left after completed trips appear here."
      />
    </div>
  );
}
