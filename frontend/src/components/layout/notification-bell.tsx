'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';
import { notificationsApi, notificationLink, type Notification } from '@/features/notifications/api';

/** Relative time, coarse — matches how inbox timestamps read in the apps. */
function ago(iso: string): string {
  const s = Math.floor((Date.now() - +new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return formatDate(iso);
}

export function NotificationBell() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Poll so a booking confirmation or payout shows up without a refresh.
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationsApi.list(),
    refetchInterval: 60_000,
  });
  const items = data ?? [];
  const unread = items.filter((n) => !n.readAt);

  const markRead = useMutation({
    mutationFn: (ids: string[]) => notificationsApi.markRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openNotification = (n: Notification) => {
    if (!n.readAt) markRead.mutate([n._id]);
    const link = notificationLink(n);
    setOpen(false);
    if (link) router.push(link);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ''}`}
        className="relative grid h-9 w-9 place-items-center rounded-full transition-colors hover:bg-accent"
      >
        <Bell className="h-5 w-5" />
        {unread.length > 0 && (
          <span className="absolute end-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 z-50 mt-3 w-[340px] sm:w-[420px] origin-top-right animate-scale-in overflow-hidden rounded-[1.5rem] border border-border/60 bg-card shadow-[0_12px_48px_-12px_rgba(0,0,0,0.15)] ring-1 ring-black/5 dark:ring-white/10">
          <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-5 py-4 backdrop-blur-sm">
            <p className="text-[17px] font-bold tracking-tight">Notifications</p>
            {unread.length > 0 && (
              <button
                onClick={() => markRead.mutate(unread.map((n) => n._id))}
                className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[13px] font-bold text-primary transition-colors hover:bg-primary/20"
              >
                <CheckCheck className="h-4 w-4" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[70vh] overflow-y-auto pb-2">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center text-muted-foreground">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-muted/50">
                  <Inbox className="h-8 w-8 opacity-50" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-foreground">You're all caught up</p>
                  <p className="mt-1 text-[13px]">No new notifications to show.</p>
                </div>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n._id}
                  onClick={() => openNotification(n)}
                  className={cn(
                    'group relative flex w-full items-start gap-4 px-5 py-4 text-start transition-all hover:bg-muted/40',
                    !n.readAt && 'bg-primary/[0.02]',
                  )}
                >
                  {/* Unread indicator */}
                  {!n.readAt && (
                    <span className="absolute start-0 top-0 h-full w-1 bg-primary" />
                  )}
                  
                  <div className="mt-1 shrink-0">
                    <span className={cn(
                      'grid h-10 w-10 place-items-center rounded-full transition-colors',
                      n.readAt ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary shadow-sm'
                    )}>
                      <Bell className="h-4.5 w-4.5" />
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className={cn(
                        'truncate text-[15px] tracking-tight',
                        n.readAt ? 'font-medium text-foreground/80' : 'font-bold text-foreground'
                      )}>
                        {n.title || n.templateKey}
                      </p>
                      <span className="shrink-0 text-[12px] font-medium text-muted-foreground/70">{ago(n.createdAt)}</span>
                    </div>
                    {n.body && (
                      <p className={cn(
                        'mt-1 line-clamp-2 text-[14px] leading-relaxed',
                        n.readAt ? 'text-muted-foreground/80' : 'text-muted-foreground'
                      )}>
                        {n.body}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
