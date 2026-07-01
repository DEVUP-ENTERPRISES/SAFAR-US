'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Users, Gauge, Fuel, MapPin, Check, DoorOpen, Palette, Truck, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Rating } from '@/components/ui/rating';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { formatMoney } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { useVehicle } from '@/features/vehicles/hooks';
import { useRecentlyViewed } from '@/features/vehicles/recently-viewed';
import { useQuote, useCreateBooking } from '@/features/bookings/hooks';
import { useAuthStore } from '@/features/auth/store';
import { WishlistButton } from '@/features/favorites/wishlist-button';

interface Review {
  _id: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: v, isLoading, isError } = useVehicle(id);
  const status = useAuthStore((s) => s.status);
  const { track } = useRecentlyViewed();

  const [active, setActive] = useState(0);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const quote = useQuote();
  const createBooking = useCreateBooking();

  useEffect(() => {
    if (v?._id) track(v._id);
  }, [v?._id, track]);

  const reviews = useQuery({
    queryKey: ['reviews', v?.hostId],
    queryFn: () => api.get<Review[]>('/reviews', { subjectId: v!.hostId }, false),
    enabled: !!v?.hostId,
  });

  const canQuote = start && end;
  const runQuote = () => canQuote && quote.mutate({ vehicleId: id, start: iso(start), end: iso(end) });
  const book = async () => {
    if (status !== 'authenticated') return router.push('/login');
    const b = await createBooking.mutateAsync({ vehicleId: id, start: iso(start), end: iso(end) });
    router.push(`/bookings?highlight=${b._id}`);
  };

  if (isLoading) return <Skeleton className="h-[70vh] w-full" />;
  if (isError || !v) return <ErrorState message="Vehicle not found." />;

  const photos = v.photos?.length ? v.photos : [];
  const delivery = v.listing.delivery;
  const deliveryModes = delivery
    ? (['airport', 'home', 'hotel', 'business'] as const).filter((k) => delivery[k])
    : [];

  return (
    <div className="grid gap-10 lg:grid-cols-3">
      <div className="space-y-8 lg:col-span-2">
        {/* Gallery */}
        <div className="space-y-3">
          <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-muted">
            {photos[active]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photos[active].url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center brand-gradient text-6xl font-bold text-white/80">
                {v.make.slice(0, 1)}{v.model.slice(0, 1)}
              </div>
            )}
            <div className="absolute right-4 top-4">
              <WishlistButton vehicleId={v._id} />
            </div>
          </div>
          {photos.length > 1 && (
            <div className="hide-scrollbar flex gap-2 overflow-x-auto">
              {photos.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  className={cn(
                    'h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2',
                    i === active ? 'border-primary' : 'border-transparent opacity-70',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Header */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{v.make} {v.model}</h1>
            {v.listing.instantBook && <Badge tone="success">⚡ Instant book</Badge>}
            {v.vinVerified && <Badge>Verified</Badge>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin className="h-4 w-4" /> {v.location.address || v.location.city}</span>
            <Rating value={v.ratingAvg} count={v.ratingCount} size="md" />
          </div>
        </div>

        {/* Specs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Spec icon={<Users className="h-5 w-5" />} label={`${v.seats} seats`} />
          <Spec icon={<Gauge className="h-5 w-5" />} label={v.transmission} />
          <Spec icon={<Fuel className="h-5 w-5" />} label={v.fuelType} />
          {v.specs?.doors ? <Spec icon={<DoorOpen className="h-5 w-5" />} label={`${v.specs.doors} doors`} /> : <Spec icon={<Palette className="h-5 w-5" />} label={v.specs?.color || v.category} />}
        </div>

        {v.listing.description && <p className="leading-relaxed text-muted-foreground">{v.listing.description}</p>}

        {/* Features */}
        {v.features.length > 0 && (
          <div>
            <h2 className="mb-3 font-semibold">What this car offers</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {v.features.map((f) => (
                <span key={f} className="flex items-center gap-2 text-sm capitalize">
                  <Check className="h-4 w-4 text-primary" /> {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Delivery & protection */}
        <div className="grid gap-4 sm:grid-cols-2">
          {deliveryModes.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 font-medium"><Truck className="h-5 w-5 text-primary" /> Delivery</div>
                <p className="mt-1 text-sm capitalize text-muted-foreground">{deliveryModes.join(', ')} · {formatMoney({ amount: delivery!.fee, currency: v.pricing.currency })}</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 font-medium"><ShieldCheck className="h-5 w-5 text-primary" /> Protection</div>
              <p className="mt-1 text-sm text-muted-foreground capitalize">{v.listing.cancellationPolicy} cancellation · insured trips</p>
            </CardContent>
          </Card>
        </div>

        {/* Reviews */}
        <div>
          <h2 className="mb-3 font-semibold">Reviews</h2>
          {reviews.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : reviews.data && reviews.data.length > 0 ? (
            <div className="space-y-3">
              {reviews.data.slice(0, 5).map((r) => (
                <Card key={r._id}>
                  <CardContent className="pt-6">
                    <Rating value={r.rating} />
                    <p className="mt-2 text-sm">{r.comment}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No reviews yet — be the first to book.</p>
          )}
        </div>
      </div>

      {/* Booking widget */}
      <div>
        <Card className="sticky top-24 shadow-card">
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })}</span>
              <span className="text-muted-foreground">/ day</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="From" htmlFor="s"><Input id="s" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
              <Field label="Until" htmlFor="e"><Input id="e" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
            </div>
            <Button variant="outline" className="w-full" disabled={!canQuote} loading={quote.isPending} onClick={runQuote}>
              Get price
            </Button>

            {quote.isError && (
              <p className="text-sm text-destructive">{quote.error instanceof ApiError ? quote.error.message : 'Could not price this trip'}</p>
            )}
            {quote.data && (
              <div className="space-y-1.5 rounded-lg border border-border p-3 text-sm">
                <Row label={`${quote.data.days} days`} value={formatMoney(quote.data.base)} />
                {quote.data.cleaningFee.amount > 0 && <Row label="Cleaning fee" value={formatMoney(quote.data.cleaningFee)} />}
                {quote.data.discount.amount > 0 && <Row label="Discount" value={`−${formatMoney(quote.data.discount)}`} />}
                <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
                  <span>Total</span><span>{formatMoney(quote.data.total)}</span>
                </div>
              </div>
            )}
            {createBooking.isError && (
              <p className="text-sm text-destructive">{createBooking.error instanceof ApiError ? createBooking.error.message : 'Booking failed'}</p>
            )}
            <Button className="w-full" size="lg" disabled={!quote.data} loading={createBooking.isPending} onClick={book}>
              {v.listing.instantBook ? 'Book instantly' : 'Request to book'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">You won&apos;t be charged until confirmed.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Spec({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm capitalize shadow-soft">
      <span className="text-primary">{icon}</span> {label}
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span><span className="text-foreground">{value}</span>
    </div>
  );
}
function iso(local: string): string {
  return new Date(local).toISOString();
}
