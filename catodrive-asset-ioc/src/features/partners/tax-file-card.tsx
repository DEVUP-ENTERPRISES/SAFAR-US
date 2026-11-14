'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { partnerManageApi } from '@/features/asset-partners/manage-api';
import { formatMoney } from '@/lib/utils/format';
import { DownloadButton } from './download-button';

const manage = partnerManageApi('/ioc');
const usd = (amount: number) => formatMoney({ amount, currency: 'USD' });
const FIRST_YEAR = 2025;

/** What each partner was paid in a calendar year, for the accountant's 1099 filing. */
export function TaxFileCard() {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, i) => thisYear - i);
  const [year, setYear] = useState(new Date().getMonth() < 3 ? thisYear - 1 : thisYear);
  const q = useQuery({ queryKey: ['partner-tax-year', year], queryFn: () => manage.taxYear(year) });
  const flagged = q.data?.rows.filter((r) => r.needs1099).length ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg"><FileSpreadsheet className="h-5 w-5 text-primary" /> 1099 tax file</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Tax year" value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="w-28">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <DownloadButton label="Download for the accountant" onClick={() => manage.exportTaxYear(year)} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <Skeleton className="h-32 w-full rounded-lg" />
        ) : q.isError || !q.data ? (
          <ErrorState message="We couldn’t load this year." retry={() => void q.refetch()} />
        ) : !q.data.rows.length ? (
          <EmptyState title={`No payouts recorded in ${year}`} description="Partners show up here once a payout is recorded with a paid date in that year." />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Money sent in {year}, by paid date. {flagged} of {q.data.rows.length} partner{q.data.rows.length === 1 ? '' : 's'} reached the {usd(q.data.thresholdCents)} reporting amount set in admin.
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {q.data.rows.map((r) => (
                <li key={r.partnerId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <Link href={`/ops/partners/members/${r.partnerId}`} className="font-semibold hover:underline">{r.name}</Link>
                    <span className="block truncate text-xs text-muted-foreground">{[r.legalName, r.city && r.state ? `${r.city}, ${r.state}` : undefined, `${r.payouts} payout${r.payouts === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {r.needs1099 && <Badge tone="warning">Needs a 1099</Badge>}
                    <span className="font-semibold tabular-nums">{usd(r.paidCents)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">The file has each partner’s name, address and total. Tax IDs (W-9) aren’t collected in CatoDrive, so your accountant adds them.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
