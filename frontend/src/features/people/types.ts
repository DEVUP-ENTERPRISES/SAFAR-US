/** Who someone is, as the server allows this viewer to see; contact is present for CatoDrive staff only. */
export interface PersonSummary {
  id: string;
  name: string;
  kind: 'guest' | 'host' | 'asset_partner' | 'staff';
  avatar?: string;
  memberSince?: string;
  accountStatus: string;
  canBook: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  identity: 'verified' | 'pending' | 'not_verified';
  licenceValid: boolean | null;
  age?: number;
  trips: { completed: number; upcoming: number; cancelledByGuest: number; withThisHost?: number };
  rating?: { average: number; count: number };
  deleted?: boolean;
  contact?: { fullName?: string; verifiedName?: string; email?: string; phone?: string };
}

export const PERSON_KIND_LABEL: Record<PersonSummary['kind'], string> = { guest: 'Guest', host: 'Host', asset_partner: 'Asset Partner', staff: 'CatoDrive staff' };
export const IDENTITY_LABEL: Record<PersonSummary['identity'], string> = { verified: 'ID verified', pending: 'ID check in progress', not_verified: 'ID not verified' };
