'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Mail, Car, TrendingUp, Building2, HelpCircle, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Chip } from '@/components/ui/chip';
import { PageHeader } from '@/components/ui/page-header';
import { StatTile } from '@/components/ui/stat-tile';
import { DataTable, type Column } from '@/features/admin/components/data-table';
import { adminApi } from '@/features/admin/api';
import { formatDate } from '@/lib/utils/format';
import { adminPath } from '@/lib/admin-path';

interface Inquiry {
  _id: string;
  fullName: string;
  email: string;
  interest: 'asset_partner' | 'investor' | 'corporate' | 'general' | 'other';
  message: string;
  status: 'new' | 'responded';
  createdAt: string;
}

/** Every inbound lead is labeled by who it's from at a glance — an asset
 *  partner, an investor, a corporate prospect, or a general question — so
 *  the queue never reads as one undifferentiated inbox. */
const INTEREST_META: Record<Inquiry['interest'], { label: string; icon: typeof Car; tone: 'primary' | 'success' | 'warning' | 'muted' }> = {
  asset_partner: { label: 'Asset Partner', icon: Car, tone: 'primary' },
  investor: { label: 'Investor', icon: TrendingUp, tone: 'success' },
  corporate: { label: 'Corporate', icon: Building2, tone: 'warning' },
  general: { label: 'General', icon: HelpCircle, tone: 'muted' },
  other: { label: 'Other', icon: Layers, tone: 'muted' },
};

export default function ContactInquiriesPage() {
  const [status, setStatus] = useState('');
  const [interest, setInterest] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['contact-inquiries', status, interest],
    queryFn: () => adminApi.contactInquiries({ status: status || undefined, interest: interest || undefined }) as Promise<Inquiry[]>,
  });
  const { data: counts } = useQuery({
    queryKey: ['contact-inquiry-counts'],
    queryFn: () => adminApi.contactInquiryCounts(),
  });

  const totalOpen = Object.values(counts ?? {}).reduce((s, n) => s + n, 0);

  const columns: Column<Inquiry>[] = [
    {
      header: 'From',
      cell: (i) => (
        <div>
          <p className="font-medium">{i.fullName}</p>
          <p className="text-xs text-muted-foreground">{i.email}</p>
        </div>
      ),
    },
    {
      header: 'Interest',
      cell: (i) => {
        const meta = INTEREST_META[i.interest];
        return (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <meta.icon className="h-3.5 w-3.5 text-muted-foreground" /> {meta.label}
          </span>
        );
      },
    },
    { header: 'Message', cell: (i) => <span className="line-clamp-1 max-w-xs text-sm text-muted-foreground">{i.message}</span> },
    { header: 'Received', cell: (i) => <span className="text-xs">{formatDate(i.createdAt)}</span> },
    { header: 'Status', cell: (i) => <Badge tone={i.status === 'responded' ? 'success' : 'warning'}>{i.status}</Badge> },
    {
      header: 'Actions',
      className: 'text-end',
      cell: (i) => (
        <Link href={adminPath(`contact/${i._id}`)}>
          <span className="text-sm font-medium text-primary hover:underline">View →</span>
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="People · Every lead in one place"
        title="Contact Inquiries"
        description="Every inbound message from the site's Contact page and the Investors page's deck requests — labeled by who's reaching out, so nothing gets lost in an inbox."
      />

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile tone="warning" icon={<Mail className="h-5 w-5" />} label="Total open" value={totalOpen} />
        {(Object.keys(INTEREST_META) as Inquiry['interest'][]).map((k) => {
          const meta = INTEREST_META[k];
          return <StatTile key={k} icon={<meta.icon className="h-5 w-5" />} label={meta.label} value={counts?.[k] ?? 0} />;
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {['', 'new', 'responded'].map((s) => (
          <Chip key={s || 'all-status'} active={status === s} onClick={() => setStatus(s)} className="capitalize">{s || 'All statuses'}</Chip>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {['', ...Object.keys(INTEREST_META)].map((k) => (
          <Chip key={k || 'all-interest'} active={interest === k} onClick={() => setInterest(k)}>
            {k ? INTEREST_META[k as Inquiry['interest']].label : 'Everyone'}
          </Chip>
        ))}
      </div>

      <DataTable columns={columns} rows={data} isLoading={isLoading} emptyTitle="No inquiries" emptyDescription="Contact-page and deck-request submissions appear here." />
    </div>
  );
}
