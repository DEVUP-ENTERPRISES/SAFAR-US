'use client';

import { CaptainDashboardView } from '@/features/host/components/captain-dashboard';

export default function CaptainPage() {
  return <CaptainDashboardView tripsBase="/host/trips" team="your host" />;
}
