/** Must stay in step with the backend's ALLOWED_CONTENT_TYPES. */
export const IMAGE_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,image/avif,image/heic,image/heif,image/gif';

/** Documents also allow a PDF scan. */
export const DOC_ACCEPT = `${IMAGE_ACCEPT},application/pdf`;
