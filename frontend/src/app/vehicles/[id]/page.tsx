'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Users, Gauge, Fuel, Check, DoorOpen, Truck, ShieldCheck, Gauge as MileIcon, ClipboardList, Sparkles, LifeBuoy, Headphones, CalendarCheck, Grid2x2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Rating } from '@/components/ui/rating';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { formatMoney } from '@/lib/utils/format';
import { HostProfileCard } from '@/features/host/components/host-profile-card';
import { cn } from '@/lib/utils/cn';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { useVehicle } from '@/features/vehicles/hooks';
import { vehicleApi } from '@/features/vehicles/api';
import { SimilarCars } from '@/features/vehicles/components/similar-cars';
import { usePlatformConfig, describeCancellation } from '@/features/platform/config';
import { useRecentlyViewed } from '@/features/vehicles/recently-viewed';
import { useQuote, useCreateBooking } from '@/features/bookings/hooks';
import { useAuthStore } from '@/features/auth/store';
import { walletApi } from '@/features/wallet/api';
import { WishlistButton } from '@/features/favorites/wishlist-button';
import { ShareButton } from '@/features/vehicles/components/share-button';
import { AvailabilityCalendar } from '@/features/vehicles/components/availability-calendar';
import { PhotoLightbox } from '@/features/vehicles/components/photo-lightbox';
import { confirmCardPayment } from '@/features/payments/confirm-payment';
import { VehicleHistory } from '@/features/vehicles/components/vehicle-history';

interface Review {
  _id: string;
  rating: number;
  comment: string;
  createdAt: string;
}
interface RatingDistribution {
  total: number;
  avg: number;
  counts: Record<'1' | '2' | '3' | '4' | '5', number>;
}
interface ProtectionPlan {
  code: string;
  label: string;
  description: string;
  pricePerDay: number;
}


export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: v, isLoading, isError } = useVehicle(id);
  const platformCfg = usePlatformConfig();
  const status = useAuthStore((s) => s.status);
  const { track } = useRecentlyViewed();

  // Gallery selection — setter is used by the thumbnail grid; the value is not
  // read yet (lightbox is not wired up).
  // Which photo the full-screen viewer is showing; null means closed.
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [addOnCodes, setAddOnCodes] = useState<string[]>([]);
  const [protectionPlan, setProtectionPlan] = useState('basic');
  const [payWithWallet, setPayWithWallet] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<'airport' | 'home' | 'hotel' | 'business' | ''>('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  // Airport pickups: the flight is what tells the host when to actually be
  // there, and it is what stops a delayed landing counting as a no-show.
  const [flightNumber, setFlightNumber] = useState('');
  const [terminal, setTerminal] = useState('');
  const [arrivesAt, setArrivesAt] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const quote = useQuote();
  const createBooking = useCreateBooking();
  const toast = useToast();

  const wallet = useQuery({
    queryKey: ['wallet', 'balance'],
    queryFn: () => walletApi.balance(),
    enabled: status === 'authenticated',
  });

  useEffect(() => {
    if (v?._id) track(v._id);
  }, [v?._id, track]);

  const reviews = useQuery({
    queryKey: ['reviews', v?.hostId],
    queryFn: () => api.get<Review[]>('/reviews', { subjectId: v!.hostId }, false),
    enabled: !!v?.hostId,
  });
  const ratingBreakdown = useQuery({
    queryKey: ['reviews-distribution', v?.hostId],
    queryFn: () => api.get<RatingDistribution>('/reviews/distribution', { subjectId: v!.hostId }, false),
    enabled: !!v?.hostId,
  });
  const plans = useQuery({
    queryKey: ['protection-plans'],
    queryFn: () => api.get<ProtectionPlan[]>('/bookings/protection-plans', undefined, false),
  });
  const calendar = useQuery({
    queryKey: ['calendar', id],
    queryFn: () => vehicleApi.getCalendar(id),
    enabled: !!id,
  });
  // Real market comparison for the "great deal" badge — the local median for
  // this category, so the claim is earned rather than always shown.
  const marketPrice = useQuery({
    queryKey: ['price-suggestion', id],
    queryFn: () =>
      vehicleApi.priceSuggestion({
        lng: v!.location.coordinates[0],
        lat: v!.location.coordinates[1],
        category: v!.category,
        fuelType: v!.fuelType,
      }),
    enabled: !!v?.location?.coordinates,
  });

  const selection = () => ({
    vehicleId: id,
    start: iso(start),
    end: iso(end),
    // Trimmed, and omitted when blank — an empty string is not "no coupon" to
    // the validator. The server is the one that decides if it's valid; a bad
    // code surfaces as a quote error, not a silent no-op.
    couponCode: couponCode.trim() || undefined,
    addOnCodes,
    protectionPlan,
    useWallet: payWithWallet && !!v?.listing.instantBook,
    // Only send delivery once a mode AND an address are chosen — a mode with no
    // address would be a delivery the host can't fulfil.
    delivery:
      deliveryMode && deliveryAddress.trim()
        ? {
            mode: deliveryMode,
            address: deliveryAddress.trim(),
            ...(deliveryMode === 'airport'
              ? {
                  flightNumber: flightNumber.trim().toUpperCase() || undefined,
                  terminal: terminal.trim() || undefined,
                  arrivesAt: arrivesAt ? new Date(arrivesAt).toISOString() : undefined,
                }
              : {}),
          }
        : undefined,
  });
  // Delivery needs an address before it can be quoted/booked.
  // Airport delivery also needs the flight — the API rejects it otherwise, so
  // the button should not promise a quote it cannot get.
  const deliveryReady =
    !deliveryMode ||
    (deliveryAddress.trim().length > 2 &&
      (deliveryMode !== 'airport' || flightNumber.trim().length >= 3));
  const canQuote = start && end && deliveryReady;
  const runQuote = () => canQuote && quote.mutate(selection());
  const book = async () => {
    // Send them back to this car after signing in, rather than dropping them on
    // search having lost their dates and options.
    if (status !== 'authenticated') {
      return router.push(`/login?next=${encodeURIComponent(`/vehicles/${v?._id ?? ''}`)}`);
    }
    const b = await createBooking.mutateAsync(selection());

    // The bank wants the cardholder. Finish the challenge here rather than
    // sending them to a bookings list that would show the trip as unpaid with
    // no way to fix it.
    if (b.requiresAction && b.clientSecret) {
      const ok = await confirmCardPayment(b.clientSecret);
      if (!ok) {
        toast({
          tone: 'error',
          title: 'Your bank did not approve the payment',
          description: 'The trip is held. Try again from your bookings, or use another card.',
        });
      }
    }
    router.push(`/bookings?highlight=${b._id}`);
  };
  const toggleAddOn = (code: string) =>
    setAddOnCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  if (isLoading) return <Skeleton className="h-[70vh] w-full" />;
  if (isError || !v) return <ErrorState message="Vehicle not found." />;

  const photos = v.photos?.length ? v.photos : [];
  const delivery = v.listing.delivery;
  const deliveryModes = delivery
    ? (['airport', 'home', 'hotel', 'business'] as const).filter((k) => delivery[k])
    : [];

  // Trip length for the similar-cars totals and any length-of-trip messaging.
  const days = start && end
    ? Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000))
    : undefined;

  // Real signals — no hardcoded claims.
  const median = marketPrice.data?.median ?? 0;
  const isGreatDeal = median > 0 && v.pricing.dailyPrice < median;
  const dealPct = isGreatDeal ? Math.round(((median - v.pricing.dailyPrice) / median) * 100) : 0;
  const weeklyPct = Math.round((v.pricing.weeklyDiscountBps ?? 0) / 100);
  const monthlyPct = Math.round((v.pricing.monthlyDiscountBps ?? 0) / 100);
  const mileage = v.mileageLimit;
  // Cancellation copy generated from live platform config — never hardcoded.
  const cancelTerms = describeCancellation(v.listing.cancellationPolicy, platformCfg.data);

  return (
    <div className="space-y-6 sm:space-y-10 pb-20">
      {lightbox !== null && (
        <PhotoLightbox
          photos={photos}
          index={lightbox}
          onIndexChange={setLightbox}
          onClose={() => setLightbox(null)}
          alt={`${v.year} ${v.make} ${v.model}`}
        />
      )}

      {/* 1. Photo header */}
      <div className="-mx-4 sm:mx-0">
        <div className="relative overflow-hidden bg-background sm:rounded-[2rem]">
          {/*
            The desktop grid is explicitly two rows. It was cols-4 with the hero
            spanning two rows and no row definition, so the secondary photos
            flowed into implicit rows and were clipped by the fixed height —
            which is why the bottom row appeared cut in half.
          */}
          <div className="flex h-[35vh] snap-x snap-mandatory overflow-x-auto hide-scrollbar sm:grid sm:h-[55vh] sm:grid-cols-4 sm:grid-rows-2 sm:gap-2 sm:overflow-visible">
            {/* Hero */}
            <button
              type="button"
              onClick={() => photos.length && setLightbox(0)}
              className="relative h-full w-[100vw] shrink-0 snap-center sm:col-span-2 sm:row-span-2 sm:w-auto sm:snap-align-none"
              aria-label="Open photos"
            >
              {photos[0]?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photos[0].url} alt={`${v.year} ${v.make} ${v.model}`} className="h-full w-full object-cover" />
              ) : (
                <div className="brand-gradient flex h-full w-full items-center justify-center text-8xl font-black text-white/80">
                  {v.make.slice(0, 1)}{v.model.slice(0, 1)}
                </div>
              )}
            </button>

            {/* Four secondary tiles fill the remaining 2x2 exactly. */}
            {photos.slice(1, 5).map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setLightbox(i + 1)}
                className="relative hidden h-full w-full sm:block"
                aria-label={`Open photo ${i + 2}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt=""
                  className="h-full w-full cursor-pointer object-cover transition-opacity hover:opacity-90"
                />
              </button>
            ))}

            {/* Mobile swipes through everything rather than stopping at five. */}
            {photos.slice(1).map((p, i) => (
              <button
                key={`m-${i}`}
                type="button"
                onClick={() => setLightbox(i + 1)}
                className="relative h-full w-[100vw] shrink-0 snap-center sm:hidden"
                aria-label={`Open photo ${i + 2}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>

          {/* The way to the rest of the photos. Without this, anything past the
              fifth was unreachable on desktop. */}
          {photos.length > 1 && (
            <button
              type="button"
              onClick={() => setLightbox(0)}
              className="absolute bottom-4 end-4 z-10 hidden items-center gap-2 rounded-full bg-background/95 px-4 py-2.5 text-sm font-semibold shadow-float backdrop-blur-md transition-transform hover:scale-105 sm:inline-flex"
            >
              <Grid2x2 className="h-4 w-4" />
              Show all {photos.length} photos
            </button>
          )}

          {/* Mobile gets a position counter instead — a button would sit on top
              of the photo people are swiping. */}
          {photos.length > 1 && (
            <span className="absolute bottom-3 end-3 z-10 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md sm:hidden">
              {photos.length} photos
            </span>
          )}

          <div className="absolute end-4 top-4 z-10 flex items-center gap-2">
            <div className="bg-background/90 backdrop-blur-md rounded-full shadow-float hover:scale-105 transition-transform overflow-hidden">
              <ShareButton title={`${v.year} ${v.make} ${v.model}`} />
            </div>
            <div className="bg-background/90 backdrop-blur-md rounded-full shadow-float hover:scale-105 transition-transform overflow-hidden">
              <WishlistButton vehicleId={v._id} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_400px] lg:gap-16">
        <div className="space-y-10">
          {/* Header */}
        <div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground leading-tight">
            {v.make} {v.model} {v.year}
          </h1>
          <div className="mt-2.5 flex items-center gap-2 text-[17px] font-medium text-foreground">
            <span className="capitalize text-muted-foreground">{v.bodyType} · {v.transmission}</span>
            <span className="text-muted-foreground">·</span>
            <span className="flex items-center gap-1">
              <span>{v.ratingAvg.toFixed(1)}</span>
              <span className="text-[#635BFF] text-[15px]">★</span>
            </span>
            <span className="text-muted-foreground font-normal">({v.ratingCount} trips)</span>
          </div>
        </div>

        {/* Specs Pills */}
        <div className="flex flex-wrap gap-2.5">
          <Spec icon={<Users className="h-4 w-4" />} label={`${v.seats} seats`} />
          <Spec icon={<DoorOpen className="h-4 w-4" />} label={`${v.specs?.doors || 4} doors`} />
          <Spec icon={<Fuel className="h-4 w-4" />} label={v.fuelType} />
          <Spec icon={<Gauge className="h-4 w-4" />} label={v.transmission} />
        </div>

        {/* Great deal — shown only when genuinely below the local median */}
        {isGreatDeal && (
          <div className="rounded-2xl bg-success/10 p-4 text-success">
            <p className="font-bold">Great deal!</p>
            <p className="mt-0.5 text-[15px]">
              About {dealPct}% below the typical {v.category} in {v.location.city || 'this area'}.
            </p>
          </div>
        )}

        {/* Turo-style sections */}
        <div className="space-y-8 divide-y divide-border">
          <div className="pt-8 first:pt-0">
            <h2 className="mb-4 text-2xl font-bold tracking-tight">Pickup & return location</h2>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[17px] font-medium leading-snug">{v.location.address || v.location.city || 'On-site at Airport'}</p>
                <p className="mt-1 text-[15px] text-muted-foreground">About airport pickups ⓘ</p>
              </div>
            </div>
          </div>

          {(weeklyPct > 0 || monthlyPct > 0) && (
            <div className="pt-8">
              <h2 className="mb-4 text-2xl font-bold tracking-tight">Trip savings</h2>
              <div className="space-y-2">
                {weeklyPct > 0 && (
                  <div className="flex items-center justify-between">
                    <p className="text-[17px] font-medium">Weekly discount (7+ days)</p>
                    <p className="text-[17px] font-medium text-success">−{weeklyPct}%</p>
                  </div>
                )}
                {monthlyPct > 0 && (
                  <div className="flex items-center justify-between">
                    <p className="text-[17px] font-medium">Monthly discount (28+ days)</p>
                    <p className="text-[17px] font-medium text-success">−{monthlyPct}%</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="pt-8">
            <h2 className="mb-4 text-2xl font-bold tracking-tight">Cancellation policy</h2>
            <div className="flex gap-4">
              <span className="mt-0.5 shrink-0"><Check className="h-6 w-6 stroke-[1.5]" /></span>
              <div>
                <p className="text-[17px] font-medium capitalize">{cancelTerms.title}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{cancelTerms.detail}</p>
              </div>
            </div>
          </div>

          <div className="pt-8">
            <h2 className="mb-4 text-2xl font-bold tracking-tight">Payment options</h2>
            <div className="flex gap-4">
              <span className="mt-0.5 shrink-0"><ClipboardList className="h-6 w-6 stroke-[1.5]" /></span>
              <div>
                <p className="text-[17px] font-medium">Flexible payment</p>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">$0 due now when you choose the Refundable option at checkout.</p>
              </div>
            </div>
          </div>

          <div className="pt-8">
            <h2 className="mb-4 text-2xl font-bold tracking-tight">Distance included</h2>
            <div className="flex gap-4">
              <span className="mt-0.5 shrink-0"><MileIcon className="h-6 w-6 stroke-[1.5]" /></span>
              {mileage && mileage.perDayKm > 0 ? (
                <div>
                  <p className="text-[17px] font-medium">{mileage.perDayKm} km/day{days ? ` · ${mileage.perDayKm * days} km this trip` : ''}</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
                    {formatMoney({ amount: mileage.overageFeePerKm, currency: v.pricing.currency })}/km for additional distance driven
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-[17px] font-medium">Unlimited distance</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">Drive as far as you like — no mileage cap on this car.</p>
                </div>
              )}
            </div>
          </div>

          <div className="pt-8">
            <h2 className="mb-4 text-2xl font-bold tracking-tight">Insurance &amp; protection</h2>
            <div className="flex gap-4">
              <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 stroke-[1.5]" />
              <div>
                <p className="text-[17px] font-medium">Every trip is insured</p>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
                  Choose your protection level at checkout. A refundable security deposit is authorised at pickup and released after the trip.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-8">
            <h2 className="mb-4 text-2xl font-bold tracking-tight">Peace of mind</h2>
            <div className="space-y-4">
              <PeaceItem icon={<Sparkles className="h-6 w-6 stroke-[1.5]" />} title="No car wash necessary" detail="Just keep the car tidy and return it as you found it." />
              <PeaceItem icon={<CalendarCheck className="h-6 w-6 stroke-[1.5]" />} title="Free cancellation" detail={cancelTerms.detail || 'Cancel per the host’s policy for a refund.'} />
              <PeaceItem icon={<LifeBuoy className="h-6 w-6 stroke-[1.5]" />} title="Support when you need it" detail="Message your host in-app, and reach our team from your trip screen." />
              <PeaceItem icon={<Headphones className="h-6 w-6 stroke-[1.5]" />} title="Two-way reviews" detail="Verified guests and hosts rate each trip, so you always know who you’re booking with." />
            </div>
          </div>

          <div className="pt-8">
            <h2 className="mb-4 text-2xl font-bold tracking-tight">Hosted by</h2>
            <HostProfileCard hostId={v.hostId} />
          </div>
        </div>

        {v.listing.description && (
          <p className="text-lg leading-relaxed text-muted-foreground">{v.listing.description}</p>
        )}

        {/* Features */}
        {v.features.length > 0 && (
          <div>
            <h2 className="mb-4 text-xl font-bold tracking-tight">Features</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-8">
              {v.features.map((f) => (
                <span key={f} className="flex items-center gap-3 text-[15px] capitalize">
                  <Check className="h-5 w-5 text-foreground stroke-[1.5]" /> {f}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Cards section (Delivery, Protection, Mileage, Rules) */}
        <div className="grid gap-4 sm:grid-cols-2">
          {deliveryModes.length > 0 && (
            <Card>
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-2 font-medium"><Truck className="h-5 w-5 text-primary" /> Delivery</div>
                <p className="mt-1 text-sm capitalize text-muted-foreground">{deliveryModes.join(', ')} · {formatMoney({ amount: delivery!.fee, currency: v.pricing.currency })}</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center gap-2 font-medium"><ShieldCheck className="h-5 w-5 text-primary" /> Protection</div>
              <p className="mt-1 text-sm text-muted-foreground capitalize">{v.listing.cancellationPolicy} cancellation · insured trips</p>
            </CardContent>
          </Card>
          {v.mileageLimit && v.mileageLimit.perDayKm > 0 && (
            <Card>
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-2 font-medium"><MileIcon className="h-5 w-5 text-primary" /> Mileage</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {v.mileageLimit.perDayKm} km/day included · {formatMoney({ amount: v.mileageLimit.overageFeePerKm, currency: v.pricing.currency })}/km after
                </p>
              </CardContent>
            </Card>
          )}
          {v.tripRules && v.tripRules.length > 0 && (
            <Card>
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-center gap-2 font-medium"><ClipboardList className="h-5 w-5 text-primary" /> Trip rules</div>
                <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                  {v.tripRules.map((r, i) => <li key={i}>• {r}</li>)}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Safety recalls and title history — a guest should be able to see an
            open recall before getting into a stranger's car. */}
        <VehicleHistory vehicleId={id} audience="guest" />

        {/* Availability calendar */}
        <div>
          <h2 className="mb-3 font-semibold">Availability</h2>
          <AvailabilityCalendar
            occupied={calendar.data ?? []}
            vehicle={v}
            onPick={(from, to) => { setStart(from); setEnd(to); }}
          />
        </div>

        {/* Reviews */}
        <div>
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-2xl font-bold tracking-tight">Reviews</h2>
            {v.ratingCount > 0 && (
              <span className="flex items-baseline gap-1.5 text-lg font-semibold">
                <span>{v.ratingAvg.toFixed(2)}</span>
                <span className="text-[#635BFF]">★</span>
                <span className="text-sm font-normal text-muted-foreground">· {v.ratingCount} {v.ratingCount === 1 ? 'trip' : 'trips'}</span>
              </span>
            )}
          </div>
          {ratingBreakdown.data && ratingBreakdown.data.total > 0 && (
            <div className="mb-6 max-w-md space-y-1.5">
              {([5, 4, 3, 2, 1] as const).map((star) => {
                const n = ratingBreakdown.data!.counts[String(star) as '1' | '2' | '3' | '4' | '5'] ?? 0;
                const pct = Math.round((n / ratingBreakdown.data!.total) * 100);
                return (
                  <div key={star} className="flex items-center gap-3 text-sm">
                    <span className="w-10 shrink-0 text-muted-foreground">{star} ★</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-[#635BFF]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-end tabular-nums text-muted-foreground">{n}</span>
                  </div>
                );
              })}
            </div>
          )}
          {reviews.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : reviews.data && reviews.data.length > 0 ? (
            <div className="space-y-3">
              {reviews.data.slice(0, 5).map((r) => (
                <Card key={r._id}>
                  <CardContent className="p-6 sm:p-8">
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
      <div className="relative">
        <div className="sticky top-24 rounded-3xl border border-border bg-card p-6 shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
          <div className="space-y-6">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex items-baseline gap-1">
                <span className="text-2xl font-extrabold tracking-tight">
                  {formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })}
                </span>
                <span className="text-[15px] text-muted-foreground font-medium">/ day</span>
              </span>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
                <div className="p-3">
                  <label htmlFor="s" className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Trip start</label>
                  <input id="s" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="w-full bg-transparent text-sm font-medium outline-none" />
                </div>
                <div className="p-3">
                  <label htmlFor="e" className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Trip end</label>
                  <input id="e" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full bg-transparent text-sm font-medium outline-none" />
                </div>
              </div>
              <div className="p-3">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Pickup & return</label>
                <div className="text-sm font-medium truncate">{v.location.address || v.location.city}</div>
              </div>
            </div>
            {/* Delivery — only when the host offers it */}
            {deliveryModes.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Delivery</p>
                  {delivery!.fee > 0 && (
                    <span className="text-xs text-muted-foreground">
                      +{formatMoney({ amount: delivery!.fee, currency: v.pricing.currency })}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setDeliveryMode('')}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      deliveryMode === '' ? 'border-primary bg-primary/10 text-primary' : 'border-border',
                    )}
                  >
                    Pick up myself
                  </button>
                  {deliveryModes.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDeliveryMode(m)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors',
                        deliveryMode === m ? 'border-primary bg-primary/10 text-primary' : 'border-border',
                      )}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {deliveryMode && (
                  <div className="space-y-2">
                    <Input
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder={deliveryMode === 'airport' ? 'Airport (e.g. JFK)' : 'Delivery address'}
                    />
                    {deliveryMode === 'airport' && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={flightNumber}
                            onChange={(e) => setFlightNumber(e.target.value.toUpperCase())}
                            placeholder="Flight no. (AA123)"
                          />
                          <Input
                            value={terminal}
                            onChange={(e) => setTerminal(e.target.value)}
                            placeholder="Terminal (opt.)"
                          />
                        </div>
                        <Input
                          type="datetime-local"
                          value={arrivesAt}
                          onChange={(e) => setArrivesAt(e.target.value)}
                          aria-label="Scheduled arrival"
                        />
                        <p className="text-xs text-muted-foreground">
                          Your host meets your flight. If it’s delayed, your pickup window moves with it.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Protection plan */}
            {plans.data && plans.data.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Protection</p>
                {plans.data.map((p) => (
                  <label
                    key={p.code}
                    className={cn(
                      'flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm',
                      protectionPlan === p.code ? 'border-primary bg-primary/5' : 'border-border',
                    )}
                  >
                    <input type="radio" name="protection" checked={protectionPlan === p.code} onChange={() => setProtectionPlan(p.code)} className="mt-0.5 accent-[hsl(var(--primary))]" />
                    <div className="flex-1">
                      <div className="flex justify-between font-medium">
                        <span>{p.label}</span>
                        <span>{p.pricePerDay === 0 ? 'Free' : `${formatMoney({ amount: p.pricePerDay, currency: v.pricing.currency })}/day`}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Add-ons */}
            {v.addOns && v.addOns.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Extras</p>
                {v.addOns.map((a) => (
                  <label key={a.code} className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <input type="checkbox" checked={addOnCodes.includes(a.code)} onChange={() => toggleAddOn(a.code)} className="accent-[hsl(var(--primary))]" />
                      {a.label}
                    </span>
                    <span className="text-muted-foreground">
                      {formatMoney({ amount: a.amount, currency: v.pricing.currency })}{a.priceType === 'per_day' ? '/day' : ''}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/* Promo code — validated and redeemed server-side; the discount it
                yields shows in the breakdown below, and a bad code fails the quote. */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Promo code</label>
              <div className="flex gap-2">
                <Input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Optional"
                  className="h-10"
                />
                <Button
                  variant="outline"
                  className="shrink-0"
                  type="button"
                  disabled={!canQuote || !couponCode.trim()}
                  loading={quote.isPending}
                  onClick={runQuote}
                >
                  Apply
                </Button>
              </div>
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
                {quote.data.delivery?.amount > 0 && <Row label="Delivery" value={formatMoney(quote.data.delivery)} />}
                {quote.data.selectedAddOns?.map((a) => <Row key={a.code} label={a.label} value={formatMoney(a.amount)} />)}
                {quote.data.protection.amount > 0 && <Row label="Protection" value={formatMoney(quote.data.protection)} />}
                {quote.data.discount.amount > 0 && <Row label="Discount" value={`−${formatMoney(quote.data.discount)}`} />}
                <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
                  <span>Total</span><span>{formatMoney(quote.data.total)}</span>
                </div>

                {/* The real saving on this real trip. A pricing page asks
                    someone to do this arithmetic themselves; the server has
                    already done it, and only offers when the trip saves more
                    than the membership costs. */}
                {quote.data.memberOffer && (
                  <Link
                    href="/membership"
                    className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm transition-colors hover:border-primary/60"
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0">
                      Save <span className="font-semibold">{formatMoney(quote.data.memberOffer.savings)}</span> on
                      this trip with {quote.data.memberOffer.planName}
                      <span className="block text-xs text-muted-foreground">
                        ${(quote.data.memberOffer.monthlyCents / 100).toFixed(0)}/month, cancel any time
                      </span>
                    </span>
                  </Link>
                )}
              </div>
            )}
            {quote.data && v.listing.instantBook && status === 'authenticated' && (wallet.data?.balance ?? 0) > 0 && (() => {
              const bal = wallet.data!.balance;
              const applied = Math.min(bal, quote.data.total.amount);
              const remaining = quote.data.total.amount - (payWithWallet ? applied : 0);
              return (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={payWithWallet}
                    onChange={(e) => setPayWithWallet(e.target.checked)}
                    className="mt-0.5 accent-[hsl(var(--primary))]"
                  />
                  <span className="flex-1">
                    <span className="font-medium">Pay with CATO Wallet</span>
                    <span className="ms-1 text-muted-foreground">
                      ({formatMoney({ amount: bal, currency: quote.data.total.currency })} available)
                    </span>
                    {payWithWallet && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatMoney({ amount: applied, currency: quote.data.total.currency })} from wallet
                        {remaining > 0 && <> · {formatMoney({ amount: remaining, currency: quote.data.total.currency })} on card</>}
                      </span>
                    )}
                  </span>
                </label>
              );
            })()}
            {createBooking.isError && (
              <p className="text-sm text-destructive">{createBooking.error instanceof ApiError ? createBooking.error.message : 'Booking failed'}</p>
            )}
            <Button className="w-full rounded-xl py-6 text-base font-bold transition-transform hover:scale-[1.02] active:scale-[0.98]" size="lg" disabled={!quote.data} loading={createBooking.isPending} onClick={book}>
              {status !== 'authenticated'
                ? 'Sign in to book'
                : v.listing.instantBook
                  ? 'Continue'
                  : 'Request to book'}
            </Button>
            
            <p className="text-center text-sm font-medium text-muted-foreground">You won&apos;t be charged yet</p>
            
            <div className="mt-4 border-t border-border pt-4">
               <p className="text-sm font-medium">Free cancellation</p>
               <p className="text-[13px] text-muted-foreground mt-0.5">Full refund before trip starts.</p>
            </div>
          </div>
        {/* Mobile sticky booking bar */}
        <div className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between border-t border-border bg-card p-4 shadow-[0_-8px_30px_rgb(0,0,0,0.08)] sm:hidden pb-safe">
          <div>
            {quote.data ? (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[15px] text-muted-foreground line-through decoration-muted-foreground/50">{formatMoney(quote.data.base)}</span>
                  <span className="text-xl font-bold underline decoration-2 underline-offset-4">{formatMoney(quote.data.total)} total</span>
                </div>
                <p className="mt-0.5 text-[13px] font-medium text-muted-foreground">Before taxes</p>
              </>
            ) : (
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-bold">{formatMoney({ amount: v.pricing.dailyPrice, currency: v.pricing.currency })}</span>
                <span className="text-[15px] font-medium text-muted-foreground">/ day</span>
              </div>
            )}
          </div>
          <Button 
            className="rounded-xl px-8 py-6 text-[17px] font-bold transition-transform active:scale-95 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100" 
            style={quote.data ? { backgroundColor: '#635BFF', color: 'white' } : {}}
            onClick={book}
            disabled={!quote.data}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  </div>

      {/* Similar cars — full-width strip under the two-column layout */}
      <SimilarCars vehicleId={id} start={start || undefined} end={end || undefined} days={days} />
  </div>
  );
}

function PeaceItem({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="flex gap-4">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div>
        <p className="text-[17px] font-medium">{title}</p>
        <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function Spec({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-2.5 text-[15px] font-medium text-foreground">
      <span className="text-foreground shrink-0">{icon}</span>
      {label}
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

