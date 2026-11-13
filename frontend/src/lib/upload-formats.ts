/** Must stay in step with the backend's ALLOWED_CONTENT_TYPES. */
export const IMAGE_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,image/avif,image/heic,image/heif,image/gif';

/** Photos every browser can show: what photo pickers and the upload check accept. */
export const PHOTO_TYPES: readonly string[] = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];
export const PHOTO_ACCEPT = PHOTO_TYPES.join(',');
export const PHOTO_FORMATS = 'JPG, PNG, WebP or AVIF';

/** Documents also allow a PDF scan. */
export const DOC_ACCEPT = `${IMAGE_ACCEPT},application/pdf`;
