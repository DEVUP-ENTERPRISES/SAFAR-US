'use client';

import { useState } from 'react';
import { Share, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useToast } from '@/components/ui/toast';

/**
 * Share a listing. Uses the native share sheet where available (mobile), and
 * falls back to copying the link to the clipboard with a toast — so it works
 * everywhere without a hard dependency on the Web Share API.
 */
export function ShareButton({ title, className }: { title: string; className?: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title, text: `Check out this ${title} on CATO`, url });
        return;
      } catch {
        // User dismissed the share sheet, or it failed — fall through to copy.
      }
    }
    try {
      await nav?.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ tone: 'success', title: 'Link copied' });
    } catch {
      toast({ tone: 'error', title: 'Couldn’t copy the link' });
    }
  };

  return (
    <button
      type="button"
      aria-label="Share this listing"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); void share(); }}
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-full bg-background/90 shadow-soft backdrop-blur transition-transform hover:scale-110 active:scale-95',
        className,
      )}
    >
      {copied ? <Check className="h-5 w-5 text-success" /> : <Share className="h-5 w-5 text-foreground" />}
    </button>
  );
}
