'use client';

import { use } from 'react';
import { ArticleView } from '@/features/kb/article-view';

export default function Article({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <ArticleView slug={slug} />;
}
