import { randomInt } from 'node:crypto';

// No 0/O, 1/I/L or U, so an ID read over the phone or off paper is never mistyped.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

function block(n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** e.g. CD-ENV-7K3M-92QX; 30^8 ≈ 6.5e11 combinations, and the unique index catches the rare collision. */
export const newEnvelopeId = () => `CD-ENV-${block(4)}-${block(4)}`;
export const newDocumentId = () => `CD-DOC-${block(4)}-${block(4)}`;

export const ENVELOPE_ID_PATTERN = /^CD-ENV-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/;

/** "Alexandria Montgomery" → "A. M.": enough to recognise a signer on a public check, nothing more. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join(' ');
}
