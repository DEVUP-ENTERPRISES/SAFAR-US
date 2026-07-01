'use client';

import { useRouter } from 'next/navigation';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/features/auth/store';
import { useFavoriteIds, useToggleFavorite } from './hooks';

export function WishlistButton({ vehicleId, className }: { vehicleId: string; className?: string }) {
  const status = useAuthStore((s) => s.status);
  const router = useRouter();
  const { data: ids } = useFavoriteIds();
  const toggle = useToggleFavorite();
  const active = ids?.includes(vehicleId) ?? false;

  return (
    <button
      type="button"
      aria-label={active ? 'Remove from wishlist' : 'Save to wishlist'}
      aria-pressed={active}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (status !== 'authenticated') return router.push('/login');
        toggle.mutate({ vehicleId, next: !active });
      }}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full bg-background/90 shadow-soft backdrop-blur transition-transform hover:scale-110 active:scale-95',
        className,
      )}
    >
      <Heart className={cn('h-5 w-5', active ? 'fill-rose-500 text-rose-500' : 'text-foreground')} />
    </button>
  );
}
