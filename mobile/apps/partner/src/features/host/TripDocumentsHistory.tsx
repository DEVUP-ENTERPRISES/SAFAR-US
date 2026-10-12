import { useQuery } from '@tanstack/react-query';
import { Card, MenuRow, Section } from '@catodrive/ui';
import { tripDocumentsApi } from '@catodrive/core/web/features/trips/documents-api';
import { formatDateTime } from '@catodrive/core/web/lib/utils/format';

/** When the guest opened or asked for the car's papers during the trip. Hidden until there is something to show. */
export function TripDocumentsHistory({ bookingId }: { bookingId: string }) {
  const { data } = useQuery({ queryKey: ['trip-documents-history', bookingId], queryFn: () => tripDocumentsApi.history(bookingId), retry: false, refetchInterval: 60_000 });
  if (!data?.length) return null;
  return (
    <Section title="Vehicle documents">
      <Card padded={false}>
        {data.map((r) => (
          <MenuRow
            key={`${r.action}-${r.at}`}
            label={r.action === 'opened' ? 'Guest opened the documents (likely a traffic stop)' : 'Guest asked for the documents - upload them in your listing'}
            value={formatDateTime(r.at)}
          />
        ))}
      </Card>
    </Section>
  );
}
