import type { RefundExplanation } from './cancellation-policy';

export interface CancellationNoticeInput {
  cancelledBy?: string;
  currency?: string;
  refunded: number;
  /** What was kept from money already taken; undefined when nothing was ever charged. */
  kept?: number;
  explained?: RefundExplanation;
  toCard?: number;
  toWallet?: number;
  /** Extra credit for keeping the refund with CatoDrive, on top of toWallet. */
  creditBonus?: number;
  /** Cancelled inside the free window right after booking. */
  undo?: boolean;
  policyUrl?: string;
}

export interface CancellationNotice {
  title: string;
  body: string;
  facts?: { label: string; value: string }[];
}

const money = (minor: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);

const before = (hours: number) => {
  if (hours <= 0) return 'after the pickup time';
  if (hours < 1) return 'less than an hour before pickup';
  if (hours < 48) return `${Math.floor(hours)} hour${Math.floor(hours) === 1 ? '' : 's'} before pickup`;
  return `${Math.floor(hours / 24)} days before pickup`;
};

const span = (hours: number) => (hours % 24 === 0 && hours >= 48 ? `${hours / 24} days` : `${hours} hours`);
const policyName = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

/** The one message and email a guest gets when a booking is cancelled: how much comes back, why, and where it goes. */
export function cancellationNotice(n: CancellationNoticeInput): CancellationNotice {
  const cur = n.currency;
  const where: string[] = [];
  if (n.toCard) where.push(`${money(n.toCard, cur)} goes back to your card and usually shows within 5–10 business days.`);
  if (n.toWallet) {
    where.push(
      n.creditBonus
        ? `${money(n.toWallet + n.creditBonus, cur)} is in your CatoDrive wallet now, including a ${money(n.creditBonus, cur)} bonus for keeping it as credit.`
        : `${money(n.toWallet, cur)} is back in your CatoDrive wallet now.`,
    );
  }
  if (!where.length && n.refunded > 0) where.push('It usually reaches your card within 5–10 business days.');
  const policyLink = n.policyUrl ? ` Full policy: ${n.policyUrl}` : '';

  // Nothing was ever charged: the hold on the card is simply released.
  if (n.refunded === 0 && !n.kept) {
    return { title: 'Booking cancelled', body: 'Your booking was cancelled. You haven’t been charged, and any hold on your card has been released.' };
  }
  const kept = n.kept ?? 0;

  const facts = [
    { label: 'Refunded', value: money(n.refunded, cur) },
    ...(kept > 0 ? [{ label: 'Kept', value: money(kept, cur) }] : []),
    ...(n.toCard ? [{ label: 'To your card', value: money(n.toCard, cur) }] : []),
    ...(n.toWallet ? [{ label: 'To your wallet', value: money(n.toWallet, cur) }] : []),
  ];

  if (n.undo) {
    return {
      title: `Booking cancelled · full refund`,
      body: `You cancelled right after booking, so you get everything back: ${money(n.refunded, cur)}. ${where.join(' ')}`.trim(),
      facts,
    };
  }

  if (n.cancelledBy === 'host' || n.cancelledBy === 'system') {
    const who = n.cancelledBy === 'host' ? 'Your host' : 'CatoDrive';
    return {
      title: `Booking cancelled · ${money(n.refunded, cur)} refunded`,
      body: `${who} cancelled your booking, so you get a full refund of ${money(n.refunded, cur)}. ${where.join(' ')}`.trim(),
      facts,
    };
  }

  const e = n.explained;
  if (!e) {
    const keptLine = kept > 0 ? ` We kept ${money(kept, cur)} under the cancellation policy.` : '';
    return {
      title: n.refunded > 0 ? `Booking cancelled · ${money(n.refunded, cur)} refunded` : 'Booking cancelled · no refund',
      body: `Your booking was cancelled.${n.refunded > 0 ? ` We’re refunding ${money(n.refunded, cur)}.` : ''}${keptLine} ${where.join(' ')}${policyLink}`.trim(),
      facts,
    };
  }

  const rule = `${policyName(e.policy)} policy`;
  const fee = e.feeKept > 0 ? ` The ${money(e.feeKept, cur)} service fee isn’t refunded.` : '';
  let why: string;
  if (e.kind === 'full') {
    why = `You cancelled ${before(e.hoursBefore)}, at least ${span(e.fullBeforeHours)} ahead, so under the ${rule} you get everything back: ${money(n.refunded, cur)}.`;
  } else if (e.kind === 'partial') {
    why = `You cancelled ${before(e.hoursBefore)}. Under the ${rule}, cancelling less than ${span(e.fullBeforeHours)} ahead refunds ${e.partialPct}% of the trip.${fee} So we’re refunding ${money(n.refunded, cur)} and keeping ${money(kept, cur)}.`;
  } else {
    why = `You cancelled ${before(e.hoursBefore)}. Under the ${rule}, cancelling less than ${span(e.fullBeforeHours)} ahead isn’t refundable, so we’ve kept ${money(kept, cur)}.`;
  }

  return {
    title: n.refunded > 0 ? `Booking cancelled · ${money(n.refunded, cur)} refunded` : 'Booking cancelled · no refund',
    body: `${why} ${where.join(' ')}${policyLink}`.trim(),
    facts,
  };
}
