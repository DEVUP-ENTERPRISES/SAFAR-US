'use client';

import { useState } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { hostApi } from '@/features/host/api';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';

/**
 * Profile photo picker: presign → PUT the bytes → hand back the public URL.
 *
 * `avatarUrl` was read in several places (trip cards, host profiles) but there
 * was nothing anywhere in the app that could set one, so every avatar in the
 * product was a fallback initial.
 */
export function AvatarUpload({
  url,
  name,
  onChange,
  size = 96,
  disabled,
}: {
  url?: string | null;
  /** Used for the fallback initial when there's no photo. */
  name?: string;
  onChange: (next: { url: string; key: string } | null) => void;
  size?: number;
  disabled?: boolean;
}) {
  const notify = useToast();
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    // Reject early with a useful message rather than letting S3 refuse the
    // signature for a content type it was never signed for.
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      notify({ tone: 'error', title: 'Unsupported image', description: 'Use a JPG, PNG or WebP.' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      notify({ tone: 'error', title: 'Image too large', description: 'Keep it under 8 MB.' });
      return;
    }

    setBusy(true);
    try {
      const [target] = await hostApi.uploadUrls('avatar', 1, file.type);
      const res = await fetch(target.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      // fetch resolves on 4xx/5xx — without this a rejected upload would be
      // saved as the user's photo and render broken.
      if (!res.ok) throw new Error(`Storage rejected the upload (${res.status}).`);
      onChange({ url: target.publicUrl, key: target.key });
    } catch (err) {
      notify({
        tone: 'error',
        title: 'Photo upload failed',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const initial = (name ?? '?').trim().slice(0, 1).toUpperCase() || '?';

  return (
    <div className="flex items-center gap-4">
      <label
        className={cn(
          'group relative shrink-0 cursor-pointer overflow-hidden rounded-full border border-border',
          disabled && 'pointer-events-none opacity-60',
        )}
        style={{ width: size, height: size }}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          disabled={disabled || busy}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center brand-gradient text-2xl font-bold text-white/80">
            {initial}
          </span>
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
        </span>
      </label>

      <div className="min-w-0">
        <p className="text-sm font-medium">Profile photo</p>
        <p className="text-xs text-muted-foreground">
          A clear photo of your face helps guests trust you. JPG, PNG or WebP, up to 8 MB.
        </p>
        {url && !disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
          >
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
