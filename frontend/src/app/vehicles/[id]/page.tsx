'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Users, Gauge, Fuel, Check, DoorOpen, Truck, ShieldCheck, Gauge as MileIcon, ClipboardList } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Rating } from '@/components/ui/rating';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { formatMoney } from '@/lib/utils/format';
import { HostProfileCard } from '@/features/host/components/host-profile-card';
import { cn } from '@/lib/utils/cn';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/types';
import { useVehicle } from '@/features/vehicles/hooks';
import { vehicleApi } from '@/features/vehicles/api';
import { useRecentlyViewed } from '@/features/vehicles/recently-viewed';
import { useQuote, useCreateBooking } from '@/features/bookings/hooks';
import { useAuthStore } from '@/features/auth/store';
import { walletApi } from '@/features/wallet/api';
import { WishlistButton } from '@/features/favorites/wishlist-button';

interface Review {
  _id: string;
  rating: number;
  comment: string;
  createdAt: string;
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
  const status = useAuthStore((s) => s.status);
  const { track } = useRecentlyViewed();

  // Gallery selection — setter is used by the thumbnail grid; the value is not
  // read yet (lightbox is not wired up).
  const [, setActive] = useState(0);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [addOnCodes, setAddOnCodes] = useState<string[]>([]);
  const [protectionPlan, setProtectionPlan] = useState('basic');
  const [payWithWallet, setPayWithWallet] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<'airport' | 'home' | 'hotel' | 'business' | ''>('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const quote = useQuote();
  const createBooking = useCreateBooking();

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
  const plans = useQuery({
    queryKey: ['protection-plans'],
    queryFn: () => api.get<ProtectionPlan[]>('/bookings/protection-plans', undefined, false),
  });
  const calendar = useQuery({
    queryKey: ['calendar', id],
    queryFn: () => vehicleApi.getCalendar(id),
    enabled: !!id,
  });

  const selection = () => ({
    vehicleId: id,
    start: iso(start),
    end: iso(end),
    addOnCodes,
    protectionPlan,
    useWallet: payWithWallet && !!v?.listing.instantBook,
    // Only send delivery once a mode AND an address are chosen — a mode with no
    // address would be a delivery the host can't fulfil.
    delivery:
      deliveryMode && deliveryAddress.trim()
        ? { mode: deliveryMode, address: deliveryAddress.trim() }
        : undefined,
  });
  // Delivery needs an address before it can be quoted/booked.
  const deliveryReady = !deliveryMode || deliveryAddress.trim().length > 2;
  const canQuote = start && end && deliveryReady;
  const runQuote = () => canQuote && quote.mutate(selection());
  const book = async () => {
    if (status !== 'authenticated') return router.push('/login');
    const b = await createBooking.mutateAsync(selection());
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

  return (
    <div className="space-y-6 sm:space-y-10 pb-20">
      {/* 1. Photo Collage Header */}
      <div className="-mx-4 sm:mx-0">
        <div className="relative overflow-hidden sm:rounded-[2rem] bg-background">
          <div className="flex h-[35vh] sm:h-[55vh] sm:grid sm:grid-cols-4 sm:gap-2 overflow-x-auto sm:overflow-visible snap-x snap-mandatory hide-scrollbar">
            {/* Main large photo */}
            <div className="relative h-full w-[100vw] sm:w-auto shrink-0 sm:col-span-2 sm:row-span-2 snap-center sm:snap-align-none">
              {photos[0]?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photos[0].url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center brand-gradient text-8xl font-black text-white/80">
                  {v.make.slice(0, 1)}{v.model.slice(0, 1)}
                </div>
              )}
            </div>
            
            {/* Secondary photos (Desktop only grid) */}
            {photos.slice(1, 5).map((p, i) => (
              <div key={i} className="hidden sm:block relative h-full w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover transition-opacity hover:opacity-90 cursor-pointer" onClick={() => setActive(i + 1)} />
              </div>
            ))}
            
            {/* Mobile secondary photos for swipe */}
            {photos.slice(1).map((p, i) => (
              <div key={`m-${i}`} className="sm:hidden relative h-full w-[100vw] shrink-0 snap-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="h-full w-full object-cover" />
              </div>
            ))}
          </div>

          <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
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

        {/* Great deal callout */}
        <div className="rounded-2xl bg-[#E5F9ED] p-4 text-[#0A472E] dark:bg-[#0A472E]/20 dark:text-[#E5F9ED]">
          <p className="font-bold">Great deal!</p>
          <p className="mt-0.5 text-[15px]">Priced lower than similar options for your trip.</p>
        </div>

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

          <div className="pt-8">
            <h2 className="mb-4 text-2xl font-bold tracking-tight">Trip Savings</h2>
            <div className="flex items-center justify-between">
              <p className="text-[17px] font-medium">1-week discount</p>
              <p className="text-[17px] font-medium text-[#0A472E] dark:text-emerald-400">-$99</p>
            </div>
          </div>

          <div className="pt-8">
            <h2 className="mb-4 text-2xl font-bold tracking-tight">Cancellation policy</h2>
            <div className="flex gap-4">
              <span className="mt-0.5 shrink-0"><Check className="h-6 w-6 stroke-[1.5]" /></span>
              <div>
                <p className="text-[17px] font-medium">Free cancellation</p>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">Full refund within 24 hours of booking. More flexible options available at checkout.</p>
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
              <div>
                <p className="text-[17px] font-medium">1,050 mi</p>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">$0.38/mi fee for additional miles driven</p>
              </div>
            </div>
          </div>

          <div className="pt-8">
            <h2 className="mb-4 text-2xl font-bold tracking-tight">Insurance & Protection</h2>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <ShieldCheck className="h-6 w-6 stroke-[1.5]" />
                <p className="text-[17px] font-medium">Insurance via Travelers</p>
              </div>
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

        {/* Trip rules & mileage */}
        {(v.tripRules?.length || (v.mileageLimit && v.mileageLimit.perDayKm > 0)) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {v.mileageLimit && v.mileageLimit.perDayKm > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 font-medium"><MileIcon className="h-5 w-5 text-primary" /> Mileage</div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {v.mileageLimit.perDayKm} km/day included · {formatMoney({ amount: v.mileageLimit.overageFeePerKm, currency: v.pricing.currency })}/km after
                  </p>
                </CardContent>
              </Card>
            )}
            {v.tripRules && v.tripRules.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 font-medium"><ClipboardList className="h-5 w-5 text-primary" /> Trip rules</div>
                  <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                    {v.tripRules.map((r, i) => <li key={i}>• {r}</li>)}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Availability calendar */}
        <div>
          <h2 className="mb-3 font-semibold">Availability</h2>
          <AvailabilityCalendar occupied={calendar.data ?? []} />
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
                  <Input
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    placeholder={
                      deliveryMode === 'airport' ? 'Airport & terminal' : 'Delivery address'
                    }
                  />
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
                    <span className="ml-1 text-muted-foreground">
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
              {v.listing.instantBook ? 'Continue' : 'Request to book'}
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

/** Simple month grid marking booked/blocked days for the next 60 days. */
function AvailabilityCalendar({ occupied }: { occupied: { dayKey: string; state: string }[] }) {
  const busy = new Map(occupied.map((o) => [o.dayKey, o.state]));
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const monthLabel = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const keyFor = (d: number) =>
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  return (
    <Card>
      <CardContent className="pt-6">
        <p className="mb-3 text-sm font-medium">{monthLabel}</p>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="pb-1 font-medium text-muted-foreground">{d}</div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const state = busy.get(keyFor(d));
            const past = d < today.getDate();
            const occupiedDay = state === 'booked' || state === 'blocked' || state === 'held';
            return (
              <div
                key={i}
                className={cn(
                  'flex h-9 items-center justify-center rounded-md',
                  past && 'text-muted-foreground/40',
                  occupiedDay ? 'bg-muted text-muted-foreground line-through' : 'bg-primary/5 text-foreground',
                )}
                title={occupiedDay ? 'Unavailable' : 'Available'}
              >
                {d}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary/5" /> Available</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-muted" /> Booked/Blocked</span>
        </div>
      </CardContent>
    </Card>
  );
}
