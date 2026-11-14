'use client';

import { CaptainDashboardView } from '@/features/host/components/captain-dashboard';
import { RunnerReturnJobs } from '~/features/partners/runner-return-jobs';

export default function CaptainDashboardPage() {
  return <CaptainDashboardView tripsBase="/ops/trips" team="the operations team" extra={<RunnerReturnJobs />} />;
}
