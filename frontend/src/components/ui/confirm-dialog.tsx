'use client';

import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { cn } from '@/lib/utils/cn';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'destructive';
  /**
   * For genuinely irreversible actions (refunds, bans, disabling 2FA): the user
   * must type this exact string before Confirm unlocks. Slows the hand down.
   */
  requireText?: string;
  /**
   * Captures an operator-supplied reason (audited server-side). When `required`,
   * Confirm stays locked until it's filled — so reasons are never invented.
   */
  reason?: { label: string; placeholder?: string; required?: boolean };
}

export interface ConfirmResult {
  ok: boolean;
  /** The operator-supplied reason, when `options.reason` was requested. */
  reason: string;
}

type Resolver = (r: ConfirmResult) => void;

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<ConfirmResult>) | null>(null);

/**
 * Promise-based confirmation. Any component can `const confirm = useConfirm()`
 * and `const { ok, reason } = await confirm({...})` — so no destructive mutation
 * in the app can fire on a single stray click.
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within <ConfirmProvider>');
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const resolver = useRef<Resolver | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    setTyped('');
    setReason('');
    return new Promise<ConfirmResult>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback(
    (ok: boolean, why = '') => {
      resolver.current?.({ ok, reason: why.trim() });
      resolver.current = null;
      setOpts(null);
      setTyped('');
      setReason('');
    },
    [],
  );

  // Escape cancels.
  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [opts, close]);

  const destructive = opts?.tone === 'destructive';
  const textLocked = !!opts?.requireText && typed.trim() !== opts.requireText;
  const reasonLocked = !!opts?.reason?.required && !reason.trim();
  const locked = textLocked || reasonLocked;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {opts && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 animate-fade-in bg-foreground/40 backdrop-blur-sm"
            onClick={() => close(false)}
          />

          {/* Panel */}
          <div className="relative w-full max-w-md animate-scale-in overflow-hidden rounded-2xl border border-border bg-card shadow-float">
            <button
              onClick={() => close(false)}
              aria-label="Close"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="p-6">
              <div className="flex gap-4">
                <span
                  className={cn(
                    'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                    destructive ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary',
                  )}
                >
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div className="min-w-0 pt-0.5">
                  <h2 id="confirm-title" className="pr-6 text-lg font-semibold leading-snug">
                    {opts.title}
                  </h2>
                  {opts.description && (
                    <div className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {opts.description}
                    </div>
                  )}
                </div>
              </div>

              {opts.reason && (
                <div className="mt-5">
                  <label className="mb-1.5 block text-xs font-medium">
                    {opts.reason.label}
                    {opts.reason.required && <span className="ml-1 text-destructive">*</span>}
                  </label>
                  <Input
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={opts.reason.placeholder}
                  />
                </div>
              )}

              {opts.requireText && (
                <div className="mt-5">
                  <label className="mb-1.5 block text-xs font-medium">
                    Type <span className="font-mono font-bold text-foreground">{opts.requireText}</span> to confirm
                  </label>
                  <Input
                    autoFocus={!opts.reason}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder={opts.requireText}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border bg-subtle px-6 py-4">
              <Button variant="outline" onClick={() => close(false)}>
                {opts.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                variant={destructive ? 'destructive' : 'primary'}
                disabled={locked}
                onClick={() => close(true, reason)}
              >
                {opts.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
