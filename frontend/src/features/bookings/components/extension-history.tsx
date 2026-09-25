'use client';

import Link from 'next/link';
import { CalendarPlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney, formatDateTime } from '@/lib/utils/format';
import type { BookingExtension } from '../types';

/** Every paid extension of a trip, with what was paid and a link to its receipt. */
export function ExtensionHistory({ bookingId, extensions }: { bookingId: string; extensions?: BookingExtension[] }) {
  if (!extensions?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><CalendarPlus className="h-5 w-5 text-primary" /> Extensions</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border text-sm">
        {extensions.map((e) => (
          <div key={e._id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
            <div>
              <p className="font-medium">
                +{e.days} day{e.days === 1 ? '' : 's'} · returns {formatDateTime(e.newEnd)}
              </p>
              <p className="text-xs text-muted-foreground">Was {formatDateTime(e.prevEnd)} · {formatDateTime(e.createdAt)}</p>
            </div>
            <div className="text-end">
              <p className="font-semibold">{formatMoney(e.total)}</p>
              <Link href={`/bookings/${bookingId}/receipt#${e.receiptNo}`} className="text-xs text-primary underline">
                Receipt {e.receiptNo}
              </Link>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
