'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, MapPinOff, RefreshCw, VideoOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** What is burned into every photo and shown live in the viewfinder. */
export interface PhotoStamp {
  code: string;
  vehicle: string;
  plate?: string;
  role: 'guest' | 'host';
  phase: 'pre' | 'post';
  angleLabel: string;
}

export interface CapturedShot {
  blob: Blob;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  capturedAt: Date;
  sha256?: string;
}

interface Fix {
  lat: number;
  lng: number;
  accuracyM: number;
}

type CameraError = 'denied' | 'no_camera' | 'failed';

const JPEG_QUALITY = 0.9;

// Explicit fields: dateStyle/timeStyle cannot be combined with timeZoneName and throw at load time.
const whenFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
});

/** The stamp text, top line first; one function feeds both the live overlay and the saved pixels. */
function stampLines(stamp: PhotoStamp, fix: Fix | null, now: Date): string[] {
  const who = `${stamp.role === 'guest' ? 'Guest' : 'Host'} · ${stamp.phase === 'pre' ? 'Pickup' : 'Return'} · ${stamp.angleLabel}`;
  const place = fix ? `${fix.lat.toFixed(5)}, ${fix.lng.toFixed(5)} (±${Math.round(fix.accuracyM)} m)` : 'Location not available';
  return [
    `${stamp.code} · ${stamp.vehicle}${stamp.plate ? ` · ${stamp.plate}` : ''}`,
    who,
    whenFormat.format(now),
    place,
  ];
}

function drawStamp(ctx: CanvasRenderingContext2D, w: number, h: number, lines: string[]): void {
  const size = Math.max(14, Math.round(Math.min(w, h) * 0.032));
  const pad = Math.round(size * 0.6);
  const lineH = Math.round(size * 1.35);
  const bandH = lines.length * lineH + pad * 2;
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, h - bandH, w, bandH);
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, pad, h - bandH + pad + i * lineH, w - pad * 2));
}

async function sha256Hex(blob: Blob): Promise<string | undefined> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return undefined;
  }
}

/**
 * In-app camera and nothing else: there is deliberately no file picker, so every
 * condition photo is taken live, on this device, with its stamp drawn into the
 * pixels. The viewfinder is the same canvas the photo is saved from, so what the
 * person sees stamped is exactly what is stored. A photo can be retaken only
 * until it is uploaded.
 */
export function LiveCamera({
  stamp,
  requireLocation,
  onUse,
  onClose,
}: {
  stamp: PhotoStamp;
  requireLocation: boolean;
  /** Uploads the shot; resolve to finish, reject (with a readable message) to stay on the review step. */
  onUse: (shot: CapturedShot) => Promise<void>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fixRef = useRef<Fix | null>(null);
  const stampRef = useRef(stamp);
  stampRef.current = stamp;

  const [error, setError] = useState<CameraError | null>(null);
  const [ready, setReady] = useState(false);
  const [fix, setFix] = useState<Fix | null>(null);
  const [geoBlocked, setGeoBlocked] = useState(false);
  const [shot, setShot] = useState<{ data: CapturedShot; previewUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Camera stream, started once and always released.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('no_camera');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setReady(true);
      } catch (e) {
        const name = e instanceof DOMException ? e.name : '';
        setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' || name === 'OverconstrainedError' ? 'no_camera' : 'failed');
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Location watch: the stamp and the server both need a real fix.
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoBlocked(true);
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy };
        fixRef.current = next;
        setFix(next);
        setGeoBlocked(false);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setGeoBlocked(true);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Viewfinder: video frame plus the live stamp, redrawn every frame until a photo is taken.
  useEffect(() => {
    if (!ready || shot) return;
    let raf = 0;
    const paint = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.videoWidth) {
        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          drawStamp(ctx, canvas.width, canvas.height, stampLines(stampRef.current, fixRef.current, new Date()));
        }
      }
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [ready, shot]);

  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.previewUrl); }, [shot]);

  const locationOk = !requireLocation || !!fix;

  const capture = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !locationOk) return;
    const capturedAt = new Date();
    const at = fixRef.current;
    canvas.toBlob(
      async (blob) => {
        if (!blob) return;
        const data: CapturedShot = {
          blob,
          capturedAt,
          sha256: await sha256Hex(blob),
          ...(at ? { lat: at.lat, lng: at.lng, accuracyM: at.accuracyM } : {}),
        };
        setUploadError(null);
        setShot({ data, previewUrl: URL.createObjectURL(blob) });
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
  }, [locationOk]);

  const upload = async () => {
    if (!shot) return;
    setBusy(true);
    setUploadError(null);
    try {
      await onUse(shot.data);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed. Try again.');
      setBusy(false);
    }
  };

  const message = (title: string, body: string, icon: React.ReactNode) => (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-white">
      {icon}
      <p className="text-lg font-bold">{title}</p>
      <p className="max-w-sm text-sm text-white/80">{body}</p>
      <Button variant="outline" onClick={onClose}>Close</Button>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Take a condition photo">
      <div className="flex items-center justify-between p-3 text-white">
        <p className="text-sm font-semibold">
          {stamp.phase === 'pre' ? 'Pickup' : 'Return'} photo · {stamp.angleLabel}
        </p>
        <button onClick={onClose} disabled={busy} className="rounded-full p-2 hover:bg-white/10" aria-label="Close camera">
          <X className="h-5 w-5" />
        </button>
      </div>

      {error === 'denied' &&
        message('Camera access is blocked', 'Allow camera access for this site in your browser settings, then open the camera again. Condition photos can only be taken with the camera.', <VideoOff className="h-10 w-10" />)}
      {error === 'no_camera' &&
        message('No camera found', 'Condition photos must be taken live with a camera. Open this page on a phone with a camera to take them.', <VideoOff className="h-10 w-10" />)}
      {error === 'failed' &&
        message('The camera could not start', 'Close any other app using the camera, then try again.', <VideoOff className="h-10 w-10" />)}

      {!error && (
        <>
          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            <video ref={videoRef} playsInline muted className="pointer-events-none absolute h-px w-px opacity-0" />
            {!shot && <canvas ref={canvasRef} className="max-h-full max-w-full object-contain" />}
            {shot && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shot.previewUrl} alt="Photo to review" className="max-h-full max-w-full object-contain" />
            )}
            {!ready && <Loader2 className="absolute h-8 w-8 animate-spin text-white" />}
          </div>

          <div className="space-y-3 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center text-white">
            {!shot && requireLocation && !fix && (
              <p className="flex items-center justify-center gap-2 text-sm text-amber-300">
                <MapPinOff className="h-4 w-4" />
                {geoBlocked ? 'Location is blocked. Allow location for this site to take photos.' : 'Waiting for your location…'}
              </p>
            )}
            {uploadError && <p className="text-sm text-red-300">{uploadError}</p>}

            {!shot ? (
              <button
                onClick={capture}
                disabled={!ready || !locationOk}
                aria-label="Take photo"
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-white/20 disabled:opacity-40"
              >
                <Camera className="h-6 w-6" />
              </button>
            ) : (
              <div className="mx-auto flex max-w-sm gap-3">
                <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setShot(null)}>
                  <RefreshCw className="h-4 w-4" /> Retake
                </Button>
                <Button className="flex-1" loading={busy} onClick={upload}>
                  Use this photo
                </Button>
              </div>
            )}
            {shot && <p className="text-xs text-white/70">Once uploaded, a photo cannot be changed or deleted.</p>}
          </div>
        </>
      )}
    </div>
  );
}
