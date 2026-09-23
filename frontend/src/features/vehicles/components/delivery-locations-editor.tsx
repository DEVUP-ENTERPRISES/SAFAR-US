'use client';

import { useState } from 'react';
import { Plane, Building2, Briefcase, MapPinned, Lock, Unlock, User, Trash2, Plus, X, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';
import { formatMoney } from '@/lib/utils/format';
import { LocationSearch } from '@/features/maps/components/location-search';
import { DeliveryLocationsMap } from './delivery-locations-map';
import type { DeliveryLocation, DeliveryLocationKind } from '@/features/vehicles/types';

const KIND_META: Record<DeliveryLocationKind, { icon: typeof Plane; label: string; defaultName: string }> = {
  airport: { icon: Plane, label: 'Airport', defaultName: '' },
  hotel: { icon: Building2, label: 'Hotel / resort', defaultName: '' },
  business: { icon: Briefcase, label: 'Business address', defaultName: '' },
  custom: { icon: MapPinned, label: 'Anywhere within a radius', defaultName: 'Custom delivery' },
};

const ACCESS_LABEL: Record<DeliveryLocation['accessMethod'], { icon: typeof Lock; label: string }> = {
  lockbox: { icon: Lock, label: 'Lockbox' },
  remote_unlock: { icon: Unlock, label: 'Remote unlock' },
  in_person: { icon: User, label: 'Meet in person' },
};

function blankLocation(kind: DeliveryLocationKind): DeliveryLocation {
  return {
    id: `draft-${Date.now()}`,
    kind,
    name: KIND_META[kind].defaultName,
    address: '',
    fee: 0,
    minTripDays: kind === 'airport' ? 2 : 0,
    accessMethod: 'in_person',
    ...(kind === 'custom' ? { radiusMiles: 20 } : {}),
    enabled: true,
  };
}

/**
 * Turo-style delivery setup: a map of the host's coverage, their home
 * location (free, fixed — edited on the Details panel, not here), and a
 * priced, addable/editable list of delivery locations. Reused by both the
 * new-listing wizard and the listing edit page so a host configures delivery
 * exactly the same way whether they are creating or editing a car.
 */
export function DeliveryLocationsEditor({
  value,
  onChange,
  home,
}: {
  value: DeliveryLocation[];
  onChange: (next: DeliveryLocation[]) => void;
  home?: { lat: number; lng: number; address: string; city: string };
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const startAdd = (kind: DeliveryLocationKind) => {
    const draft = blankLocation(kind);
    onChange([...value, draft]);
    setEditingId(draft.id);
    setPicking(false);
  };

  const update = (id: string, patch: Partial<DeliveryLocation>) =>
    onChange(value.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const remove = (id: string) => {
    onChange(value.filter((l) => l.id !== id));
    if (editingId === id) setEditingId(null);
  };

  return (
    <div className="space-y-4">
      <DeliveryLocationsMap home={home} locations={value} className="h-56" />

      {home && (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
          <Car className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-semibold">{home.address || home.city}</p>
            <p className="text-sm text-muted-foreground">
              Pickup &amp; return at your home location is included in the trip price for no additional fee.
            </p>
          </div>
        </div>
      )}

      {value.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery locations</p>
          {value.map((loc) =>
            editingId === loc.id ? (
              <LocationEditRow
                key={loc.id}
                value={loc}
                onSave={(patch) => { update(loc.id, patch); setEditingId(null); }}
                onCancel={() => remove(loc.id)}
              />
            ) : (
              <LocationCard key={loc.id} loc={loc} onEdit={() => setEditingId(loc.id)} onRemove={() => remove(loc.id)} />
            ),
          )}
        </div>
      )}

      {picking ? (
        <div className="rounded-2xl border border-dashed border-border p-4">
          <p className="mb-3 text-sm font-medium">What kind of location?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(Object.keys(KIND_META) as DeliveryLocationKind[]).map((k) => {
              const M = KIND_META[k].icon;
              return (
                <button
                  key={k}
                  onClick={() => startAdd(k)}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center transition-colors hover:border-primary/50 hover:bg-accent"
                >
                  <M className="h-5 w-5 text-primary" />
                  <span className="text-xs font-medium">{KIND_META[k].label}</span>
                </button>
              );
            })}
          </div>
          <button onClick={() => setPicking(false)} className="mt-3 text-sm text-muted-foreground hover:underline">
            Cancel
          </button>
        </div>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>
          <Plus className="h-4 w-4" /> Add a delivery location
        </Button>
      )}
    </div>
  );
}

function LocationCard({ loc, onEdit, onRemove }: { loc: DeliveryLocation; onEdit: () => void; onRemove: () => void }) {
  const Icon = KIND_META[loc.kind].icon;
  const access = ACCESS_LABEL[loc.accessMethod];
  return (
    <div className={cn('rounded-2xl border border-border bg-card p-4', !loc.enabled && 'opacity-50')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-semibold">{loc.name || KIND_META[loc.kind].label}</p>
            <p className="text-sm text-muted-foreground">
              {loc.fee > 0 ? formatMoney({ amount: loc.fee, currency: 'USD' }) : 'Free'} delivery
              {loc.minTripDays > 0 ? `. ${loc.minTripDays}+ day trips.` : ''}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <access.icon className="h-3.5 w-3.5" /> {access.label}
            </p>
            {loc.kind === 'airport' && !!loc.subLocations?.length && (
              <p className="text-xs text-muted-foreground">{loc.subLocations.length} required location{loc.subLocations.length === 1 ? '' : 's'}</p>
            )}
            {loc.parkingRate && (
              <p className="text-xs capitalize text-muted-foreground">Parking rate: {loc.parkingRate}</p>
            )}
            {loc.kind === 'custom' && loc.radiusMiles && (
              <p className="text-xs text-muted-foreground">Within {loc.radiusMiles} miles</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <button onClick={onEdit} className="text-sm font-medium text-primary hover:underline">Edit</button>
          <button onClick={onRemove} aria-label="Remove location" className="text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function LocationEditRow({
  value,
  onSave,
  onCancel,
}: {
  value: DeliveryLocation;
  onSave: (patch: Partial<DeliveryLocation>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(value.name);
  const [address, setAddress] = useState(value.address);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>(
    value.lat !== undefined && value.lng !== undefined ? { lat: value.lat, lng: value.lng } : undefined,
  );
  const [fee, setFee] = useState(String((value.fee / 100) || ''));
  const [minTripDays, setMinTripDays] = useState(String(value.minTripDays || ''));
  const [accessMethod, setAccessMethod] = useState(value.accessMethod);
  const [radiusMiles, setRadiusMiles] = useState(String(value.radiusMiles ?? 20));
  const [parkingRate, setParkingRate] = useState(value.parkingRate ?? '');
  const [subLocations, setSubLocations] = useState(value.subLocations ?? []);
  const [subDraft, setSubDraft] = useState('');

  const M = KIND_META[value.kind].icon;
  const canSave = value.kind === 'custom' ? name.trim() : name.trim() && address.trim();

  return (
    <div className="rounded-2xl border border-primary/40 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-primary">
        <M className="h-4 w-4" /> {KIND_META[value.kind].label}
      </div>

      <Field label="Name" hint="Shown to guests, e.g. &ldquo;Dallas Love Field Airport&rdquo;">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={KIND_META[value.kind].label} />
      </Field>

      {value.kind !== 'custom' && (
        <Field label="Address">
          <LocationSearch
            placeholder={address || 'Search an address'}
            onPick={(p) => { setAddress(p.label); setCoords({ lat: p.lat, lng: p.lng }); }}
          />
        </Field>
      )}

      {value.kind === 'custom' && (
        <Field label="Radius (miles)" hint="Deliver anywhere the guest picks within this distance">
          <Input type="number" min={1} max={200} value={radiusMiles} onChange={(e) => setRadiusMiles(e.target.value)} />
        </Field>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Delivery fee ($)">
          <Input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} />
        </Field>
        <Field label="Minimum trip (days)" hint="0 = any length">
          <Input type="number" min={0} value={minTripDays} onChange={(e) => setMinTripDays(e.target.value)} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Access method">
          <Select value={accessMethod} onChange={(e) => setAccessMethod(e.target.value as typeof accessMethod)}>
            <option value="in_person">Meet in person</option>
            <option value="lockbox">Lockbox</option>
            <option value="remote_unlock">Remote unlock</option>
          </Select>
        </Field>
        {(value.kind === 'airport' || value.kind === 'hotel') && (
          <Field label="Parking rate">
            <Select value={parkingRate} onChange={(e) => setParkingRate(e.target.value as typeof parkingRate)}>
              <option value="">Not specified</option>
              <option value="free">Free</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
            </Select>
          </Field>
        )}
      </div>

      {value.kind === 'airport' && (
        <Field label="Required locations" hint="Specific terminals or counters a guest may be sent to">
          <div className="space-y-2">
            {subLocations.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-subtle px-3 py-1.5 text-sm">
                <span className="flex-1">{s.name}</span>
                <button onClick={() => setSubLocations(subLocations.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={subDraft}
                onChange={(e) => setSubDraft(e.target.value)}
                placeholder="e.g. Terminal C, Cell Phone Lot"
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={!subDraft.trim()}
                onClick={() => { setSubLocations([...subLocations, { name: subDraft.trim() }]); setSubDraft(''); }}
              >
                Add
              </Button>
            </div>
          </div>
        </Field>
      )}

      <div className="flex gap-3 pt-1">
        <Button
          size="sm"
          disabled={!canSave}
          onClick={() =>
            onSave({
              name: name.trim(),
              address: address.trim(),
              ...(coords ?? {}),
              fee: Math.round(Number(fee || 0) * 100),
              minTripDays: Math.max(0, Number(minTripDays) || 0),
              accessMethod,
              ...(value.kind === 'custom' ? { radiusMiles: Math.max(1, Number(radiusMiles) || 20) } : {}),
              ...(parkingRate ? { parkingRate: parkingRate as DeliveryLocation['parkingRate'] } : {}),
              ...(value.kind === 'airport' ? { subLocations } : {}),
            })
          }
        >
          Save location
        </Button>
        <button onClick={onCancel} className="text-sm text-muted-foreground hover:underline">Cancel</button>
      </div>
    </div>
  );
}
