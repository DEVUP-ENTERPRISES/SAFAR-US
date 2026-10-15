'use client';

import { Phone, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Real, business-supplied partner support contacts. */
const PARTNER_PHONE = '(214) 814-0402';
const PARTNER_EMAIL = 'shoaib@catodrive.com';

export function PartnerSupport() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Questions about your vehicle?</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <a
          href={`tel:${PARTNER_PHONE.replace(/\D/g, '')}`}
          className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary/40"
        >
          <Phone className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Call or text</span>
            <span className="block truncate font-semibold">{PARTNER_PHONE}</span>
          </span>
        </a>
        <a
          href={`mailto:${PARTNER_EMAIL}`}
          className="flex items-center gap-3 rounded-xl border border-border p-4 transition-colors hover:border-primary/40"
        >
          <Mail className="h-5 w-5 shrink-0 text-primary" />
          <span className="min-w-0">
            <span className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</span>
            <span className="block truncate font-semibold">{PARTNER_EMAIL}</span>
          </span>
        </a>
      </CardContent>
    </Card>
  );
}
