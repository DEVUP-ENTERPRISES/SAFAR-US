'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, X, Info } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

type Tone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
}

const ToastContext = createContext<((t: Omit<Toast, 'id'>) => void) | null>(null);

/**
 * Minimal toast layer. It exists mainly so a FAILED action can never be
 * silent: an admin who clicks "Suspend user" must find out if it didn't work,
 * rather than assuming it did because the row didn't change.
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { ...t, id }]); // cap at 3 on screen
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  // Errors linger — a failure the user missed is the whole problem we're solving.
  useEffect(() => {
    const ms = toast.tone === 'error' ? 8000 : 4000;
    const timer = setTimeout(onDismiss, ms);
    return () => clearTimeout(timer);
  }, [toast.tone, onDismiss]);

  const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? AlertTriangle : Info;

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex animate-slide-up items-start gap-3 rounded-xl border bg-card p-4 shadow-float',
        toast.tone === 'error' ? 'border-destructive/40' : 'border-border',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-5 w-5 shrink-0',
          toast.tone === 'error' ? 'text-destructive' : toast.tone === 'success' ? 'text-success' : 'text-primary',
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{toast.description}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
