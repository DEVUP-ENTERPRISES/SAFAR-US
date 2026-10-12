import { useState } from 'react';
import { useConfirm } from '@catodrive/ui';
import { bookingApi } from '@catodrive/core/web/features/bookings/api';
import { useCancelBooking } from '@catodrive/core/web/features/bookings/queries';
import { POLICY_LABEL } from '@catodrive/core/web/features/bookings/status';
import type { Booking } from '@catodrive/core/web/features/bookings/types';
import { formatDateTime, formatMoney } from '@catodrive/core/web/lib/utils/format';

/** The website's cancel flow: show exactly what comes back under the policy, ask why, then cancel. */
export function useCancelTrip() {
  const confirm = useConfirm();
  const cancel = useCancelBooking();
  const [previewing, setPreviewing] = useState<string | null>(null);

  const start = async (b: Pick<Booking, '_id' | 'code'>) => {
    setPreviewing(b._id);
    let description = 'This cannot be undone - you would need to rebook.';
    try {
      const p = await bookingApi.cancellationPreview(b._id);
      const policy = POLICY_LABEL[p.policy].toLowerCase();
      const refund = p.isFullRefund
        ? `You’ll be refunded the full ${formatMoney(p.refund)}.`
        : p.refund.amount > 0
          ? `You’ll be refunded ${formatMoney(p.refund)} - ${formatMoney(p.nonRefundable)} is non-refundable under this host’s ${policy} policy.`
          : `This is non-refundable under this host’s ${policy} policy.`;
      const earlier = p.fullRefundUntil && !p.isFullRefund ? ` A full refund was available until ${formatDateTime(p.fullRefundUntil)}.` : '';
      description = `You paid ${formatMoney(p.total)}. ${refund}${earlier} This cannot be undone - you would need to rebook.`;
    } catch {
      /* the generic warning still applies */
    } finally {
      setPreviewing(null);
    }
    const { ok, reason } = await confirm({
      title: `Cancel trip ${b.code}?`,
      description,
      confirmLabel: 'Cancel trip',
      tone: 'destructive',
      reason: { label: 'Reason for cancelling', placeholder: 'e.g. Plans changed', required: true },
    });
    if (ok) cancel.mutate({ id: b._id, reason });
  };

  return { start, isPending: (id: string) => previewing === id || (cancel.isPending && cancel.variables?.id === id) };
}
