import { DisclosureVersionModel, type DisclosureVersionDoc } from '../infrastructure/disclosure-version.model';
import { DISCLOSURE_IDS, DISCLOSURE_SEED, type DisclosureSection } from '../domain/defaults';
import { ConflictError, NotFoundError, ValidationError } from '../../../core/errors/app-error';
import { logger } from '../../../infrastructure/logging/logger';
import { uuid } from '../../../shared/utils/uuid';

const same = (a: DisclosureSection[], b: DisclosureSection[]) => JSON.stringify(a) === JSON.stringify(b);

export const disclosureService = {
  async seed(): Promise<void> {
    if (await DisclosureVersionModel.exists({})) return;
    try {
      await DisclosureVersionModel.create({ _id: uuid(), version: 1, sections: DISCLOSURE_SEED, changeNote: 'Version 1.0 from the compliance package', publishedBy: 'system', effectiveAt: new Date('2026-11-18T12:00:00Z') });
      logger.info('website disclosures v1 published');
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
    }
  },

  async current(): Promise<DisclosureVersionDoc | null> {
    return DisclosureVersionModel.findOne().sort({ version: -1 }).lean<DisclosureVersionDoc>();
  },

  async byVersion(version: number): Promise<DisclosureVersionDoc> {
    const v = await DisclosureVersionModel.findOne({ version }).lean<DisclosureVersionDoc>();
    if (!v) throw new NotFoundError('Disclosure version');
    return v;
  },

  async versions(): Promise<Pick<DisclosureVersionDoc, 'version' | 'effectiveAt' | 'changeNote'>[]> {
    return DisclosureVersionModel.find().sort({ version: -1 }).limit(100).select('version effectiveAt changeNote -_id').lean();
  },

  async publish(userId: string, input: { sections: DisclosureSection[]; changeNote: string }): Promise<DisclosureVersionDoc> {
    const ids = input.sections.map((s) => s.id);
    if (ids.length !== DISCLOSURE_IDS.length || DISCLOSURE_IDS.some((id) => !ids.includes(id))) {
      throw new ValidationError('Every disclosure section must stay in place; edit the text instead of removing one.');
    }
    const latest = await this.current();
    if (latest && same(latest.sections, input.sections)) return latest;
    try {
      const doc = await DisclosureVersionModel.create({ _id: uuid(), version: (latest?.version ?? 0) + 1, sections: input.sections, changeNote: input.changeNote, publishedBy: userId, effectiveAt: new Date() });
      logger.info({ version: doc.version, userId }, 'website disclosures published');
      return doc.toObject();
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new ConflictError('Someone else just published a version. Reload and try again.', 'DISCLOSURE_VERSION_TAKEN');
      throw err;
    }
  },
};
