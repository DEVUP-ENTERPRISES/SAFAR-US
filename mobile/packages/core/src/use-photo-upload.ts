import { useState } from 'react';
import { useToast } from '@catodrive/ui';
import { pickPhotos, uploadPhotos, type PickSource, type UploadCategory } from './uploads';
import { safeMessage } from './web/lib/utils/safe-message';

/** Pick one photo and upload it; resolves null when the person cancels, toasts and resolves null when the upload fails. */
export function usePhotoUpload(category: UploadCategory, source: PickSource = 'library') {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const upload = async (): Promise<{ url: string; key: string } | null> => {
    const picked = await pickPhotos(source);
    if (!picked?.length) return null;
    setUploading(true);
    try {
      const [up] = await uploadPhotos(category, picked.slice(0, 1));
      return { url: up.url, key: up.key };
    } catch (e) {
      toast({ tone: 'error', title: e instanceof Error ? safeMessage(e.message) : 'That photo didn’t upload' });
      return null;
    } finally {
      setUploading(false);
    }
  };
  return { upload, uploading };
}
