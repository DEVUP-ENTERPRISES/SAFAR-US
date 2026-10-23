'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';

export interface SettingChange {
  label: string;
  from: string;
  to: string;
}

/** A group of live settings with one plain explanation, a worked example, and a save that shows old and new values first. */
export function SettingsCard({ title, about, affects, example, changes, saving, onSave, children }: {
  title: string;
  about: string;
  /** Who feels the change: Guests, Hosts, Partners. */
  affects: string[];
  /** A dollar example that follows the values being typed. */
  example?: ReactNode;
  changes: SettingChange[];
  saving?: boolean;
  onSave: () => void;
  children: ReactNode;
}) {
  const confirm = useConfirm();
  const save = async () => {
    const { ok } = await confirm({
      title: `Save ${title.toLowerCase()}?`,
      description: (
        <span className="block space-y-1">
          {changes.map((c) => (
            <span key={c.label} className="block">
              {c.label}: <span className="line-through opacity-70">{c.from}</span> → <span className="font-semibold">{c.to}</span>
            </span>
          ))}
          <span className="block pt-1">It applies to the next quote. Bookings already priced keep their rate.</span>
        </span>
      ),
      confirmLabel: 'Save',
    });
    if (ok) onSave();
  };

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-lg">{title}</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {affects.map((a) => <span key={a} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Affects {a}</span>)}
          </div>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{about}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
        {example && <div className="rounded-xl bg-primary/5 px-4 py-3 text-sm">{example}</div>}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{changes.length ? `${changes.length} unsaved change${changes.length > 1 ? 's' : ''}` : 'No changes'}</p>
          <Button className="w-full sm:w-auto" disabled={!changes.length} loading={saving} onClick={() => void save()}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}
