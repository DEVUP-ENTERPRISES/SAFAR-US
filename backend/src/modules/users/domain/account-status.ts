export type AccountStatus =
  | 'active'
  | 'restricted'
  | 'under_review'
  | 'suspended'
  | 'banned'
  | 'closed';

/** Can this account sign in at all? */
export function canAuthenticate(status: AccountStatus): boolean {
  return status !== 'banned' && status !== 'closed';
}

/**
 * Can this account book?
 *
 * `under_review` deliberately blocks booking without blocking the account: the
 * member keeps access to trips they already have, and to support, while a human
 * looks at a risk decision. Punishing someone before a person has looked is how
 * you lose customers the engine got wrong.
 */
export function canBook(status: AccountStatus): boolean {
  return status === 'active';
}

/** Copy shown to the member. Never mentions risk signals. */
export const STATUS_MESSAGE: Record<AccountStatus, string> = {
  active: '',
  restricted: 'Your account is limited. Existing trips continue as normal — contact support to lift this.',
  under_review: 'We are reviewing your account. This usually takes a few hours.',
  suspended: 'Your account is suspended. Contact support.',
  banned: 'This account has been closed permanently.',
  closed: 'This account has been closed.',
};
