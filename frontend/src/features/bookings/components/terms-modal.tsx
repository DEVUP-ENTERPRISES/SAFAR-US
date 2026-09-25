'use client';

import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';

/**
 * The Terms & Conditions consent popup shown before a booking is placed.
 *
 * A booking is a contract, so consent is explicit and deliberate: the guest
 * must scroll through the agreement before "I Agree" enables. The version they
 * accept is recorded on the booking server-side (terms.version/acceptedAt/ip),
 * so there is a durable record of exactly what was agreed and when.
 */
export function TermsModal({
  open,
  version,
  termsUrl,
  onAccept,
  onClose,
}: {
  open: boolean;
  version?: string;
  termsUrl?: string;
  onAccept: () => void;
  onClose: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState(false);

  // Reset the "read to the end" gate each time it opens.
  useEffect(() => {
    if (open) setRead(false);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setRead(true);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Terms and Conditions"
        className="animate-slide-up flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[15px] font-bold leading-tight">Terms &amp; Conditions</p>
              {version && <p className="text-[11px] text-muted-foreground">Version {version}</p>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable agreement */}
        <div ref={bodyRef} onScroll={onScroll} className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-muted-foreground">
          <p>By continuing, you enter into a rental agreement with the host through CatoDrive and agree to the following:</p>
          <Term n="Eligibility" t="You hold a valid driver’s licence, meet the minimum age, and your identity has been verified. Only approved drivers may operate the vehicle." />
          <Term n="Payment & charges" t="You authorise the trip total shown at checkout, and any post-trip charges evidenced under the policy — fuel, cleaning, tolls, citations, late return or damage — at the rates published in the app." />
          <Term n="Security deposit" t="A refundable authorisation may be held against your card for the trip and released after the post-trip inspection window." />
          <Term n="Cancellation" t="Refunds follow the host’s cancellation policy shown on this listing. The price you’re quoted is the price you’re charged — it doesn’t change after booking." />
          <Term n="Vehicle care & conduct" t="You’ll return the car on time, in the condition you received it, with no smoking, and only approved drivers behind the wheel. Traffic and toll charges incurred during your trip are yours." />
          <Term n="Protection" t="Any protection plan you selected applies as described; without one, you’re responsible for damage up to the policy limits." />
          <p>
            This is a summary. Read the full{' '}
            <a href={termsUrl || '/terms'} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline">
              Terms &amp; Conditions and rental agreement
            </a>
            . Accepting records your consent to this version on your booking.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-border p-4">
          <button onClick={onClose} className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={onAccept}
            disabled={!read}
            className="flex flex-[1.5] items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-40"
          >
            {read ? 'I Agree & Continue' : 'Scroll to read…'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Term({ n, t }: { n: string; t: string }) {
  return (
    <p>
      <span className="font-semibold text-foreground">{n}.</span> {t}
    </p>
  );
}
