'use client';

import Link from 'next/link';
import { BarChart3, ChevronRight, Handshake, Layers, Milestone, Users, Wrench } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

// Sections the phone tab bar has no room for; hidden on wide screens, where the sidebar lists them.
const SECTIONS = [
  { href: '/ops/partners', label: 'Asset Partners', icon: Handshake },
  { href: '/ops/fleet', label: 'Fleet', icon: Layers },
  { href: '/ops/operations', label: 'Operations', icon: Wrench },
  { href: '/ops/team', label: 'Captains', icon: Users },
  { href: '/ops/tolls', label: 'Toll accounts', icon: Milestone },
  { href: '/ops/performance', label: 'Performance', icon: BarChart3 },
];

export function PhoneSections() {
  return (
    <Card className="lg:hidden">
      <CardContent className="divide-y divide-border p-0">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="flex items-center gap-3 px-4 py-3.5 text-sm font-medium hover:bg-accent/50">
            <s.icon className="h-4 w-4 text-primary" />
            <span className="flex-1">{s.label}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
