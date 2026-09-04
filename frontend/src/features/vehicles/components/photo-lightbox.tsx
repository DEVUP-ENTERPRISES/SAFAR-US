'use client';

import { useCallback, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Full-screen photo viewer.
 *
 * The detail page previously showed five photos and had no way to reach the
 * rest — clicking one called a setter whose value was discarded, so it looked
 * interactive and did nothing at all.
 *
 * Behaviour people already expect from a gallery, and therefore try:
 * arrow keys and Escape, a click on the backdrop to close, a visible counter so
 * "how many more" is answerable, and thumbnails to jump rather than paging
 * through twenty photos one at a time.
 *
 * Wrapping is deliberate: reaching the end and being unable to continue reads
 * as broken, and there is nothing at the end of a photo list worth protecting.
 */
export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
  alt,
}: {
  photos: { url: string }[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  alt: string;
}) {
  const total = photos.length;
  const closeRef = useRef<HTMLButtonElement>(null);

  const go = useCallback(
    (delta: number) => onIndexChange((index + delta + total) % total),
    [index, total, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    // The page behind must not scroll while a full-screen layer is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [go, onClose]);

  if (total === 0) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${alt} — photo ${index + 1} of ${total}`}
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Chrome */}
      <div className="flex items-center justify-between p-4 text-white">
        <span className="numeric text-sm font-medium tabular-nums">
          {index + 1} / {total}
        </span>
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close photos"
          className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* The photo. Stopping propagation here keeps a click on the image from
          closing, while a click on the surrounding backdrop still does. */}
      <div className="relative flex flex-1 items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
        {total > 1 && (
          <button
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className="absolute start-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photos[index].url}
          alt={`${alt} — photo ${index + 1}`}
          className="max-h-full max-w-full rounded-lg object-contain"
        />

        {total > 1 && (
          <button
            onClick={() => go(1)}
            aria-label="Next photo"
            className="absolute end-4 z-10 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/25"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {/* Thumbnails — jumping beats paging once there are more than a handful. */}
      {total > 1 && (
        <div
          className="flex gap-2 overflow-x-auto p-4 hide-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          {photos.map((p, i) => (
            <button
              key={i}
              onClick={() => onIndexChange(i)}
              aria-label={`Photo ${i + 1}`}
              aria-current={i === index}
              className={cn(
                'h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-all',
                i === index ? 'border-white' : 'border-transparent opacity-50 hover:opacity-90',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
