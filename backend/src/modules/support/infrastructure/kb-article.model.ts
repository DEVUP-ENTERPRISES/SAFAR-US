import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export type ArticleStatus = 'draft' | 'published';

/**
 * A self-serve help article. Guests read published ones to deflect tickets;
 * support staff author and curate them from the admin console. The helpful /
 * not-helpful votes and view count are the signal for what's working.
 */
export interface KbArticleDoc {
  _id: string;
  slug: string; // stable, URL-safe; derived from the title, unique
  title: string;
  summary: string; // one-liner shown in lists and search results
  body: string; // markdown
  category: string;
  tags: string[];
  status: ArticleStatus;
  authorId: string;
  views: number;
  helpful: number;
  notHelpful: number;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

const schema = new Schema<KbArticleDoc>(
  {
    _id: { type: String, default: () => uuid() },
    slug: { type: String, required: true },
    title: { type: String, required: true },
    summary: { type: String, default: '' },
    body: { type: String, required: true },
    category: { type: String, default: 'general' },
    tags: { type: [String], default: [] },
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    authorId: { type: String, required: true },
    views: { type: Number, default: 0 },
    helpful: { type: Number, default: 0 },
    notHelpful: { type: Number, default: 0 },
    publishedAt: Date,
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, _id: false },
);

// Slug is unique among live (non-deleted) articles.
schema.index({ slug: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
schema.index({ status: 1, category: 1, publishedAt: -1 });
// Free-text over title / summary / body for the help-centre search box.
schema.index({ title: 'text', summary: 'text', body: 'text', tags: 'text' });

export const KbArticleModel = model<KbArticleDoc>('KbArticle', schema);
