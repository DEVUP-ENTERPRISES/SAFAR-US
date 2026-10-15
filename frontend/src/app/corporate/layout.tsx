import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { config } from '@/lib/config';
import { CorporateFrame } from './corporate-frame';

/** Corporate accounts ship in version 3: until the switch is on, every corporate page is a real 404. */
export default function CorporateLayout({ children }: { children: ReactNode }) {
  if (!config.corporate) notFound();
  return <CorporateFrame>{children}</CorporateFrame>;
}
