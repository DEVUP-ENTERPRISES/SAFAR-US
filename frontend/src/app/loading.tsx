import { TripLoader } from '@/features/loading/trip-loader';

/**
 * Route-level loading UI. Next shows this while a route segment is still
 * loading — i.e. DURING navigation, before the destination renders — so the
 * themed ride greets the move rather than flashing in after the page appears.
 */
export default function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <TripLoader />
    </div>
  );
}
