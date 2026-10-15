import type { HostProfile } from './api';

export interface HostProfileForm {
  displayName: string;
  bio: string;
  avatarUrl: string;
  avatarKey: string;
  city: string;
  work: string;
  languages: string;
  hostType: 'individual' | 'business';
  legalName: string;
  registrationNumber: string;
  taxId: string;
  accountHolder: string;
  bankName: string;
  ifscOrRouting: string;
  accountNumberMasked: string;
}

export const EMPTY_HOST_PROFILE: HostProfileForm = {
  displayName: '',
  bio: '',
  avatarUrl: '',
  avatarKey: '',
  city: '',
  work: '',
  languages: '',
  hostType: 'individual',
  legalName: '',
  registrationNumber: '',
  taxId: '',
  accountHolder: '',
  bankName: '',
  ifscOrRouting: '',
  accountNumberMasked: '',
};

/** The editable form from the saved host record. */
export function hostProfileForm(data: HostProfile): HostProfileForm {
  return {
    displayName: data.displayName ?? '',
    bio: data.bio ?? '',
    avatarUrl: (data.avatarUrl as string) ?? '',
    avatarKey: (data.avatarKey as string) ?? '',
    city: (data.city as string) ?? '',
    work: (data.work as string) ?? '',
    languages: ((data.languages as string[]) ?? []).join(', '),
    hostType: data.hostType ?? 'individual',
    legalName: (data.businessProfile?.legalName as string) ?? '',
    registrationNumber: (data.businessProfile?.registrationNumber as string) ?? '',
    taxId: (data.taxInfo?.taxId as string) ?? '',
    accountHolder: (data.bankingDetails?.accountHolder as string) ?? '',
    bankName: (data.bankingDetails?.bankName as string) ?? '',
    ifscOrRouting: (data.bankingDetails?.ifscOrRouting as string) ?? '',
    accountNumberMasked: (data.bankingDetails?.accountNumberMasked as string) ?? '',
  };
}

/** The PATCH body for /hosts/me from the form. */
export function hostProfilePatch(form: HostProfileForm): Partial<HostProfile> {
  return {
    displayName: form.displayName,
    bio: form.bio,
    // Empty strings clear the field; undefined would leave the old value.
    avatarUrl: form.avatarUrl || undefined,
    avatarKey: form.avatarKey || undefined,
    city: form.city,
    work: form.work,
    languages: form.languages.split(',').map((l) => l.trim()).filter(Boolean),
    hostType: form.hostType,
    businessProfile: { legalName: form.legalName, registrationNumber: form.registrationNumber },
    taxInfo: { taxId: form.taxId },
    bankingDetails: {
      accountHolder: form.accountHolder,
      bankName: form.bankName,
      ifscOrRouting: form.ifscOrRouting,
      accountNumberMasked: form.accountNumberMasked,
    },
  };
}
