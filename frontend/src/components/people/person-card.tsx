'use client';

import type { ReactNode } from 'react';
import { BadgeCheck, CalendarDays, Mail, Phone, ShieldAlert, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { IDENTITY_LABEL, PERSON_KIND_LABEL, type PersonSummary } from '@/features/people/types';
import { formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

/** Who someone is, wherever they contact us: name, trust, history and (for staff) how to reach them. */
export function PersonCard({ person, isLoading, isError, actions, className, title }: { person?: PersonSummary; isLoading?: boolean; isError?: boolean; actions?: ReactNode; className?: string; title?: string }) {
  if (isLoading) return <Skeleton className={cn('h-28 w-full rounded-lg', className)} />;
  if (isError || !person) return <p className={cn('rounded-lg border border-border p-3 text-sm text-muted-foreground', className)} role="status">We couldn’t load who this is.</p>;
  const t = person.trips;
  const blocked = person.deleted || !person.canBook;
  return (
    <section aria-label={title ?? 'About this person'} className={cn('space-y-3 rounded-lg border border-border bg-card p-4', className)}>
      {title && <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>}
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/10 font-semibold text-primary">
          {person.avatar ? <img src={person.avatar} alt="" width={44} height={44} className="h-full w-full object-cover" /> : person.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{person.name}</span>
            <Badge tone="muted">{PERSON_KIND_LABEL[person.kind]}</Badge>
            <Badge tone={person.identity === 'verified' ? 'success' : 'warning'}>
              {person.identity === 'verified' ? <BadgeCheck className="me-1 h-3 w-3" /> : null}
              {IDENTITY_LABEL[person.identity]}
            </Badge>
            {blocked && <Badge tone="destructive"><ShieldAlert className="me-1 h-3 w-3" />{person.deleted ? 'Account deleted' : `Can’t book (${person.accountStatus.replace(/_/g, ' ')})`}</Badge>}
          </p>
          {person.contact?.verifiedName && person.contact.verifiedName !== person.contact.fullName && (
            <p className="text-xs text-muted-foreground">Name on ID: {person.contact.verifiedName}</p>
          )}
          {person.memberSince && <p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3 w-3" /> Member since {formatDate(person.memberSince)}</p>}
        </div>
        {actions}
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground">Trips done</dt><dd className="font-semibold tabular-nums">{t.completed}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Upcoming</dt><dd className="font-semibold tabular-nums">{t.upcoming}</dd></div>
        <div><dt className="text-xs text-muted-foreground">They cancelled</dt><dd className={cn('font-semibold tabular-nums', t.cancelledByGuest > 0 && 'text-warning')}>{t.cancelledByGuest}</dd></div>
        <div>
          <dt className="text-xs text-muted-foreground">Rating from hosts</dt>
          <dd className="flex items-center gap-1 font-semibold tabular-nums">{person.rating ? <><Star className="h-3.5 w-3.5 fill-current text-[#e0a100]" />{person.rating.average} ({person.rating.count})</> : <span className="font-normal text-muted-foreground">None yet</span>}</dd>
        </div>
      </dl>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>Email {person.emailVerified ? 'confirmed' : 'not confirmed'}</span>
        <span>Phone {person.phoneVerified ? 'confirmed' : 'not confirmed'}</span>
        {person.licenceValid === false && <span className="font-medium text-destructive">Licence expired</span>}
        {person.age != null && <span>Age {person.age}</span>}
        {t.withThisHost != null && t.withThisHost > 0 && <span>{t.withThisHost} trip{t.withThisHost === 1 ? '' : 's'} with you</span>}
      </p>

      {person.contact && (person.contact.email || person.contact.phone) && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
          {person.contact.phone && <a className="inline-flex items-center gap-1 text-primary hover:underline" href={`tel:${person.contact.phone}`}><Phone className="h-3.5 w-3.5" />{person.contact.phone}</a>}
          {person.contact.email && <a className="inline-flex min-w-0 items-center gap-1 break-all text-primary hover:underline" href={`mailto:${person.contact.email}`}><Mail className="h-3.5 w-3.5 shrink-0" />{person.contact.email}</a>}
        </p>
      )}
    </section>
  );
}
