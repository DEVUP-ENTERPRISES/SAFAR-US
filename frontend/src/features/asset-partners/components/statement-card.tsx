'use client';

import { FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatMoney, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { PartnerStatement } from '@/features/asset-partners/api';

/**
 * One month's statement, itemised.
 *
 * Shared by the dashboard (this month) and the statements archive (every
 * month) — the deduction lines are the partner agreement in UI form, and two
 * copies of them would be two chances to disagree about what someone is owed.
 *
 * The management fee alone is not what a partner pays: fleet insurance and
 * detailing are recurring monthly costs per vehicle, charged whether or not
 * the car was rented. Showing only a net number would leave the agreement
 * unverifiable and make an idle month look inexplicable.
 */
export function StatementCard({
  statement,
  /** Hides the per-vehicle breakdown — the dashboard has a vehicles section
   *  of its own, and repeating it there was pure noise. */
  compact = false,
  className,
}: {
  statement: PartnerStatement;
  compact?: boolean;
  className?: string;
}) {
  const money = (v: number) => formatMoney({ amount: v, currency: statement.currency });
  const t = statement.totals;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg">
          <span className="flex min-w-0 items-center gap-2">
            <FileText className="h-5 w-5 shrink-0 text-primary" />
            <span className="truncate">Statement · {statement.period}</span>
          </span>
          <Badge tone={statement.final ? 'muted' : 'warning'}>
            {statement.final ? 'Final' : 'In progress'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 text-sm">
        <StatementRow label="Gross booking revenue" value={money(t.gross)} />
        <StatementRow
          label={`Management fee (${statement.terms.managementFeeBps / 100}%)`}
          value={`−${money(t.managementFee)}`}
          muted
        />
        <StatementRow label="Fleet insurance" value={`−${money(t.insurance)}`} muted />
        <StatementRow label="Professional detailing" value={`−${money(t.detailing)}`} muted />
        <div className="border-t border-border pt-2.5">
          <StatementRow label="Your net" value={money(t.net)} strong />
        </div>

        {!compact && statement.lines.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Per vehicle
            </p>
            {statement.lines.map((l) => (
              <StatementRow key={l.vehicleId} label={l.label} value={money(l.net)} />
            ))}
          </div>
        )}

        <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
          Paid {formatDate(statement.payoutDate)} by {statement.payoutMethod}. Insurance and
          detailing are charged monthly per vehicle while it is in the programme, whether or not it
          was booked.
        </p>
      </CardContent>
    </Card>
  );
}

export function StatementRow({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <span className={cn('shrink-0 tabular-nums', strong ? 'font-bold' : 'font-medium', muted && 'text-muted-foreground')}>
        {value}
      </span>
    </div>
  );
}
