// Generated from frontend/src/features/rewards/api.ts by mobile/tools/sync-web.js. Edit the web file, then run `npm run sync:api`.
import { api } from '../../lib/api/client';

export interface Tier { key: string; label: string; min: number; earnMultiplierBps: number; perks: string[] }
export interface RewardEntry { _id: string; points: number; type: string; description: string; createdAt: string }
export interface RewardsSummary {
  balance: number; lifetime: number; tier: Tier; nextTier: Tier | null; toNext: number;
  pointValueCents: number; history: RewardEntry[];
}

export const rewardsApi = {
  summary: () => api.get<RewardsSummary>('/rewards'),
  redeem: (points: number) => api.post<{ redeemed: number; creditCents: number }>('/rewards/redeem', { points }),
};
