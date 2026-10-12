/** The three verification steps, as the guest sees them before starting. */
export const KYC_STEPS = [
  { key: 'license', title: "Photograph your driver's license", detail: 'Front and back. Make sure the text is sharp and glare-free.' },
  { key: 'selfie', title: 'Take a quick selfie', detail: 'We match your face to the license to confirm it’s really you.' },
  { key: 'secure', title: 'We confirm and secure it', detail: 'Documents you upload here are visible only to our verification team.' },
] as const;

/** The camera-only fallback's three shots. */
export const KYC_MANUAL_FIELDS = [
  { id: 'front', label: 'Driver’s license, front', type: 'license' },
  { id: 'back', label: 'Driver’s license, back', type: 'license' },
  { id: 'selfie', label: 'Selfie holding your license', type: 'selfie' },
] as const;

/** Why the last check failed, in plain words. */
export function kycReasonLabel(reason?: string): string {
  const map: Record<string, string> = {
    documents_unreadable: 'The document photo wasn’t clear enough.',
    document_expired: 'The license appears to be expired.',
    selfie_mismatch: 'The selfie didn’t match the license photo.',
    verification_failed: 'We couldn’t confirm the details.',
  };
  return reason ? (map[reason] ?? 'We couldn’t confirm the details.') : 'We couldn’t confirm the details.';
}
