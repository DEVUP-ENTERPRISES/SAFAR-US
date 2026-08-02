import { KbArticleModel, type KbArticleDoc, type ArticleStatus } from '../infrastructure/kb-article.model';
import { NotFoundError, ConflictError } from '../../../core/errors/app-error';

/** URL-safe slug from a title: lowercase, alphanumerics, single hyphens. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/^-|-$/g, '');
}

type PublicArticle = Pick<
  KbArticleDoc,
  'slug' | 'title' | 'summary' | 'category' | 'tags' | 'views' | 'helpful' | 'notHelpful' | 'publishedAt'
>;
const PUBLIC_FIELDS = 'slug title summary category tags views helpful notHelpful publishedAt -_id';

export class KbService {
  // ── Public help centre ─────────────────────────────────────────────

  /** Browse or search published articles. Free-text `q` beats category/tag. */
  async listPublished(opts: { q?: string; category?: string; tag?: string; limit?: number } = {}): Promise<PublicArticle[]> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = { status: 'published', deletedAt: null };
    if (opts.category) filter.category = opts.category;
    if (opts.tag) filter.tags = opts.tag;

    if (opts.q && opts.q.trim()) {
      filter.$text = { $search: opts.q.trim() };
      return KbArticleModel.find(filter, { score: { $meta: 'textScore' } })
        .select(PUBLIC_FIELDS)
        .sort({ score: { $meta: 'textScore' } })
        .limit(limit)
        .lean<PublicArticle[]>();
    }
    return KbArticleModel.find(filter).select(PUBLIC_FIELDS).sort({ publishedAt: -1 }).limit(limit).lean<PublicArticle[]>();
  }

  /** Distinct categories that have at least one published article. */
  async categories(): Promise<string[]> {
    const cats = await KbArticleModel.distinct('category', { status: 'published', deletedAt: null });
    return (cats as string[]).sort();
  }

  /** Read one published article by slug; counts a view. */
  async getBySlug(slug: string): Promise<PublicArticle & { body: string }> {
    const article = await KbArticleModel.findOneAndUpdate(
      { slug, status: 'published', deletedAt: null },
      { $inc: { views: 1 } },
      { new: true },
    )
      .select(`${PUBLIC_FIELDS} body`)
      .lean<PublicArticle & { body: string }>();
    if (!article) throw new NotFoundError('Article');
    return article;
  }

  /** "Was this helpful?" — one anonymous tally per read. */
  async vote(slug: string, helpful: boolean): Promise<{ helpful: number; notHelpful: number }> {
    const res = await KbArticleModel.findOneAndUpdate(
      { slug, status: 'published', deletedAt: null },
      { $inc: helpful ? { helpful: 1 } : { notHelpful: 1 } },
      { new: true },
    )
      .select('helpful notHelpful -_id')
      .lean<{ helpful: number; notHelpful: number }>();
    if (!res) throw new NotFoundError('Article');
    return res;
  }

  // ── Admin / support authoring ──────────────────────────────────────

  async adminList(opts: { status?: string; category?: string; q?: string; limit?: number; skip?: number } = {}): Promise<{
    items: KbArticleDoc[];
    total: number;
  }> {
    const limit = Math.min(opts.limit ?? 20, 50);
    const filter: Record<string, unknown> = { deletedAt: null };
    if (opts.status) filter.status = opts.status;
    if (opts.category) filter.category = opts.category;
    if (opts.q && opts.q.trim()) filter.$text = { $search: opts.q.trim() };
    const [items, total] = await Promise.all([
      KbArticleModel.find(filter).sort({ updatedAt: -1 }).skip(opts.skip ?? 0).limit(limit).lean<KbArticleDoc[]>(),
      KbArticleModel.countDocuments(filter),
    ]);
    return { items, total };
  }

  async getById(id: string): Promise<KbArticleDoc> {
    const article = await KbArticleModel.findOne({ _id: id, deletedAt: null }).lean<KbArticleDoc>();
    if (!article) throw new NotFoundError('Article');
    return article;
  }

  async create(
    authorId: string,
    input: { title: string; summary?: string; body: string; category?: string; tags?: string[]; status?: ArticleStatus },
  ): Promise<KbArticleDoc> {
    const status = input.status ?? 'draft';
    const article = await KbArticleModel.create({
      slug: await this.uniqueSlug(input.title),
      title: input.title,
      summary: input.summary ?? '',
      body: input.body,
      category: input.category ?? 'general',
      tags: input.tags ?? [],
      status,
      authorId,
      publishedAt: status === 'published' ? new Date() : undefined,
    });
    return article.toObject();
  }

  async update(
    id: string,
    input: Partial<{ title: string; summary: string; body: string; category: string; tags: string[] }>,
  ): Promise<KbArticleDoc> {
    const article = await this.getById(id);
    const set: Record<string, unknown> = {};
    for (const k of ['title', 'summary', 'body', 'category', 'tags'] as const) {
      if (input[k] !== undefined) set[k] = input[k];
    }
    // Retitling re-slugs, but keep a published article's URL stable so live
    // links don't break — only drafts get a fresh slug.
    if (input.title && input.title !== article.title && article.status === 'draft') {
      set.slug = await this.uniqueSlug(input.title, id);
    }
    await KbArticleModel.updateOne({ _id: id }, set);
    return this.getById(id);
  }

  async publish(id: string): Promise<KbArticleDoc> {
    const article = await this.getById(id);
    await KbArticleModel.updateOne(
      { _id: id },
      { status: 'published', publishedAt: article.publishedAt ?? new Date() },
    );
    return this.getById(id);
  }

  async unpublish(id: string): Promise<KbArticleDoc> {
    await this.getById(id);
    await KbArticleModel.updateOne({ _id: id }, { status: 'draft' });
    return this.getById(id);
  }

  async remove(id: string): Promise<void> {
    const res = await KbArticleModel.updateOne({ _id: id, deletedAt: null }, { deletedAt: new Date() });
    if (res.matchedCount === 0) throw new NotFoundError('Article');
  }

  /**
   * KB health for the admin console: how many are live, what's still draft,
   * total reads, and the least-helpful published articles — the ones support
   * should rewrite because readers keep voting them down.
   */
  async stats(): Promise<{
    published: number;
    draft: number;
    totalViews: number;
    needsAttention: { slug: string; title: string; helpful: number; notHelpful: number; views: number }[];
  }> {
    const [published, draft, viewsAgg] = await Promise.all([
      KbArticleModel.countDocuments({ status: 'published', deletedAt: null }),
      KbArticleModel.countDocuments({ status: 'draft', deletedAt: null }),
      KbArticleModel.aggregate<{ total: number }>([
        { $match: { deletedAt: null } },
        { $group: { _id: null, total: { $sum: '$views' } } },
      ]),
    ]);

    // Published articles with real signal (>= 5 votes) where the majority
    // found them unhelpful, worst first.
    const candidates = await KbArticleModel.find({
      status: 'published',
      deletedAt: null,
      $expr: { $gte: [{ $add: ['$helpful', '$notHelpful'] }, 5] },
    })
      .select('slug title helpful notHelpful views -_id')
      .lean<{ slug: string; title: string; helpful: number; notHelpful: number; views: number }[]>();
    const needsAttention = candidates
      .filter((a) => a.notHelpful > a.helpful)
      .sort((a, b) => b.notHelpful - b.helpful - (a.notHelpful - a.helpful))
      .slice(0, 10);

    return { published, draft, totalViews: viewsAgg[0]?.total ?? 0, needsAttention };
  }

  /** Slug from a title, suffixed -2, -3, … if taken (ignoring `exceptId`). */
  private async uniqueSlug(title: string, exceptId?: string): Promise<string> {
    const base = slugify(title) || 'article';
    for (let n = 1; n < 100; n++) {
      const slug = n === 1 ? base : `${base}-${n}`;
      const clash = await KbArticleModel.findOne({ slug, deletedAt: null }).select('_id').lean<{ _id: string }>();
      if (!clash || clash._id === exceptId) return slug;
    }
    throw new ConflictError('Could not derive a unique slug for this title', 'SLUG_EXHAUSTED');
  }
}

export const kbService = new KbService();
