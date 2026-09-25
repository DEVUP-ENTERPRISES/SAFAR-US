'use client';

import { BadgeCheck, IdCard, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/utils/format';
import type { HostTrip } from '../trips.api';

function Fact({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm font-semibold ${tone === 'ok' ? 'text-success' : tone === 'bad' ? 'text-destructive' : ''}`}>{value}</dd>
    </div>
  );
}

/**
 * What identity verification established about the guest, laid out so the host
 * can compare it with the licence in the guest's hand, and one confirmation
 * that means exactly that. The images stay with the verification provider.
 */
export function GuestVerification({
  guest,
  confirmed,
  checked,
  onToggle,
}: {
  guest: HostTrip['guest'];
  confirmed: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const v = guest.verification;
  // A backend that predates identity details sends none; that is unknown, not unverified, so never block on it.
  const known = !!v;
  const verified = !known || !!v?.verified;
  const expired = v?.licenceValidThroughTrip === false;
  const blocked = known && (!verified || expired);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        {guest.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={guest.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-lg font-bold">{guest.name.charAt(0)}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{v?.verifiedName || guest.name}</p>
          {known && (
            <p className={`flex items-center gap-1 text-xs font-medium ${verified ? 'text-success' : 'text-destructive'}`}>
              {verified ? <BadgeCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
              {verified ? `Identity verified${v?.verifiedAt ? ` on ${formatDate(v.verifiedAt)}` : ''}` : 'Identity not verified'}
            </p>
          )}
        </div>
      </div>

      {known && verified && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Fact label="Legal name" value={v?.verifiedName || '—'} />
          <Fact label="Age" value={v?.age != null ? String(v.age) : '—'} />
          <Fact
            label="Licence expires"
            value={v?.licenceExpiry ? formatDate(v.licenceExpiry) : 'Not recorded'}
            tone={v?.licenceValidThroughTrip === true ? 'ok' : expired ? 'bad' : undefined}
          />
          <Fact label="Trips taken" value={String(guest.tripCount)} />
        </dl>
      )}

      {confirmed ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-success">
          <IdCard className="h-4 w-4" /> Licence confirmed
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {blocked
              ? expired
                ? 'This licence expires before the trip ends, so the guest can’t drive it. Contact support.'
                : 'This guest hasn’t completed identity verification, so the trip can’t be handed over.'
              : 'Ask to see the licence. Check the name, photo and expiry match what is shown above, then confirm.'}
          </p>
          <Button
            size="lg"
            className="w-full"
            variant={checked ? 'primary' : 'outline'}
            disabled={blocked}
            onClick={onToggle}
          >
            <IdCard className="h-4 w-4" />
            {checked ? 'Licence confirmed — details match' : 'Details match — confirm licence'}
          </Button>
        </>
      )}
    </div>
  );
}
