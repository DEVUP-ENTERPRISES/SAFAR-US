'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { BellRing, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/types';
import { api } from '@/lib/api/client';

/** The car is taken for these dates: offer to tell the guest the moment it frees up. */
export function WatchDatesButton({ vehicleId, start, end, signedIn }: { vehicleId: string; start: string; end: string; signedIn: boolean }) {
  const toast = useToast();
  const [watching, setWatching] = useState(false);
  const watch = useMutation({
    mutationFn: () => api.post('/favorites/watch', { vehicleId, start: new Date(start).toISOString(), end: new Date(end).toISOString() }),
    onSuccess: () => {
      setWatching(true);
      toast({ tone: 'success', title: 'We’ll tell you', description: 'You’ll get a notification the moment these dates open up.' });
    },
    onError: (e) => toast({ tone: 'error', title: e instanceof ApiError ? e.message : 'That didn’t go through. Try again.' }),
  });

  if (watching) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
        <Check className="h-4 w-4 text-success" /> We’ll notify you if these dates open up.
      </p>
    );
  }
  if (!signedIn) {
    return <p className="text-sm text-muted-foreground">Sign in to get notified if these dates open up.</p>;
  }
  return (
    <Button variant="outline" size="sm" loading={watch.isPending} onClick={() => watch.mutate()}>
      <BellRing className="h-4 w-4" /> Notify me if these dates open up
    </Button>
  );
}
