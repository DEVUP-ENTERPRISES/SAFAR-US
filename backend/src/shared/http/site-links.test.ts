/** Links in emails and texts open on the right website. */
jest.mock('../../config', () => ({
  config: { notifications: { webUrl: 'https://www.catodrive.com', partnerWebUrl: 'https://partners.catodrive.com' }, app: { publicUrl: 'https://api.catodrive.com' } },
}));

import { webLink, isPartnerPath } from './site-links';

describe('webLink', () => {
  it('sends partner pages to the partner site and everything else to the guest site', () => {
    expect(webLink('/host/trips/b1')).toBe('https://partners.catodrive.com/host/trips/b1');
    expect(webLink('/host')).toBe('https://partners.catodrive.com/host');
    expect(webLink('/host/accept-invite?token=t')).toBe('https://partners.catodrive.com/host/accept-invite?token=t');
    expect(webLink('/asset-partners/dashboard')).toBe('https://partners.catodrive.com/asset-partners/dashboard');
    expect(webLink('/corporate/approvals')).toBe('https://partners.catodrive.com/corporate/approvals');
    expect(webLink('/bookings/b1')).toBe('https://www.catodrive.com/bookings/b1');
    expect(webLink('/asset-partners/apply')).toBe('https://www.catodrive.com/asset-partners/apply');
    expect(webLink('/hosts/h1')).toBe('https://www.catodrive.com/hosts/h1');
    expect(webLink('trips/t1')).toBe('https://www.catodrive.com/trips/t1');
    expect(webLink('https://example.com/x')).toBe('https://example.com/x');
  });

  it('does not mistake look-alike paths for partner pages', () => {
    expect(isPartnerPath('/hosting')).toBe(false);
    expect(isPartnerPath('/asset-partners')).toBe(false);
  });
});
