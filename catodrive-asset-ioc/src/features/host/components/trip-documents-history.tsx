'use client';

import { useQuery } from '@tanstack/react-query';
import { SectionLabel, RowGroup, Row } from '@/components/ui/rows';
import { formatDateTime } from '@/lib/utils/format';
import { tripDocumentsApi } from '@/features/trips/documents-api';

/** When the guest opened or asked for the car's papers during the trip. Hidden until there is something to show. */
export function TripDocumentsHistory({ bookingId }: { bookingId: string }) {
  const { data } = useQuery({
    queryKey: ['trip-documents-history', bookingId],
    queryFn: () => tripDocumentsApi.history(bookingId),
    retry: false,
    refetchInterval: 60_000,
  });
  if (!data?.length) return null;
  return (
    <>
      <SectionLabel>Vehicle documents</SectionLabel>
      <RowGroup>
        {data.map((r) => (
          <Row
            key={`${r.action}-${r.at}`}
            title={r.action === 'opened' ? 'Guest opened the documents' : 'Guest asked for the documents'}
            subtitle={r.action === 'opened' ? 'Likely a traffic stop' : 'Upload them in your listing’s documents section'}
            value={formatDateTime(r.at)}
          />
        ))}
      </RowGroup>
    </>
  );
}
