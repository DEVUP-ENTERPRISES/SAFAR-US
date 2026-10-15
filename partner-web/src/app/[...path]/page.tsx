'use client';

import { use } from 'react';
import { OtherSitePage } from '@/components/layout/other-site-page';

export default function OtherSite({ params }: { params: Promise<{ path: string[] }> }) {
  const { path } = use(params);
  return <OtherSitePage site="partner" path={path} />;
}
