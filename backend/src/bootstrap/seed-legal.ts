import { KbArticleModel } from '../modules/support/infrastructure/kb-article.model';
import { UserModel } from '../modules/users/infrastructure/user.model';
import { logger } from '../infrastructure/logging/logger';
import { LEGAL_ARTICLES } from './legal-content';

/** Publishes the default Privacy Policy and Terms once; afterwards they are edited in the admin Help Centre and never overwritten. */
export async function seedLegal(): Promise<void> {
  const admin = await UserModel.findOne({ roles: 'super_admin' }).select('_id').lean<{ _id: string }>();
  if (!admin) return;
  for (const a of LEGAL_ARTICLES) {
    if (await KbArticleModel.exists({ slug: a.slug, deletedAt: null })) continue;
    await KbArticleModel.create({ ...a, tags: [a.slug], category: 'legal', status: 'published', authorId: admin._id, publishedAt: new Date() });
    logger.info({ slug: a.slug }, 'default legal article published');
  }
}
