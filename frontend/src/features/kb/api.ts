import { api } from '@/lib/api/client';

export interface KbArticleSummary {
  slug: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  views: number;
  helpful: number;
  notHelpful: number;
  publishedAt?: string;
}

export interface KbArticle extends KbArticleSummary {
  body: string;
}

/** Public help centre — no auth (readable while logged out). */
export const kbApi = {
  list: (params: { q?: string; category?: string } = {}) =>
    api.get<KbArticleSummary[]>('/support/kb/articles', params, false),
  categories: () => api.get<string[]>('/support/kb/categories', undefined, false),
  get: (slug: string) => api.get<KbArticle>(`/support/kb/articles/${slug}`, undefined, false),
  vote: (slug: string, helpful: boolean) =>
    api.post<{ helpful: number; notHelpful: number }>(`/support/kb/articles/${slug}/vote`, { helpful }, { auth: false }),
};
