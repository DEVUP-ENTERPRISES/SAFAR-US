'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Trash2, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToast } from '@/components/ui/toast';
import { bookingApi } from '@/features/bookings/api';
import { useBooking } from '@/features/bookings/hooks';

const MAX_DRIVERS = 5;

/**
 * Additional drivers on a trip.
 *
 * Only people added here are covered to drive the car — Turo makes the same
 * point, because an unlisted driver voids the protection. The backend caps the
 * list at five and only lets the booking's guest manage it; this surfaces that
 * to the guest, who otherwise had no way to add anyone.
 */
export function DriverManager({ bookingId }: { bookingId: string }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const notify = useToast();
  const { data: booking } = useBooking(bookingId);

  const [name, setName] = useState('');
  const [licence, setLicence] = useState('');

  const drivers = booking?.additionalDrivers ?? [];
  const full = drivers.length >= MAX_DRIVERS;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['booking', bookingId] });

  const add = useMutation({
    mutationFn: () => bookingApi.addDriver(bookingId, name.trim(), licence.trim()),
    onSuccess: () => {
      invalidate();
      setName('');
      setLicence('');
      notify({ tone: 'success', title: 'Driver added' });
    },
  });

  const remove = useMutation({
    mutationFn: (driverName: string) => bookingApi.removeDriver(bookingId, driverName),
    onSuccess: invalidate,
  });

  const doRemove = async (driverName: string) => {
    const { ok } = await confirm({
      title: `Remove ${driverName}?`,
      description: 'They will no longer be covered to drive this car.',
      confirmLabel: 'Remove driver',
      tone: 'destructive',
    });
    if (ok) remove.mutate(driverName);
  };

  if (!booking) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5 text-primary" /> Additional drivers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Anyone driving this car must be listed here to be covered. You can add up to {MAX_DRIVERS}.
        </p>

        {drivers.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {drivers.map((d) => (
              <li key={d.name} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{d.name}</span>
                  {d.licenseNumber && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      · {d.licenseNumber}
                    </span>
                  )}
                </span>
                <button
                  onClick={() => doRemove(d.name)}
                  aria-label={`Remove ${d.name}`}
                  className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {full ? (
          <p className="text-xs text-muted-foreground">
            You’ve added the maximum of {MAX_DRIVERS} drivers.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[9rem]">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Full name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex Driver" />
            </div>
            <div className="flex-1 min-w-[9rem]">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Licence # <span className="font-normal">(optional)</span>
              </label>
              <Input value={licence} onChange={(e) => setLicence(e.target.value.toUpperCase())} placeholder="D1234567" />
            </div>
            <Button
              size="sm"
              disabled={name.trim().length < 2}
              loading={add.isPending}
              onClick={() => add.mutate()}
            >
              <UserPlus className="h-4 w-4" /> Add driver
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
