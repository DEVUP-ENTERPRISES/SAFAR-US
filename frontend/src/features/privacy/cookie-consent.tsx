'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { Cookie, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlatformConfig } from '@/features/platform/config';
import { useConsent, useConsentOptional, type ConsentChoice } from './consent';

export function CookieConsent() {
  const { decided, settingsOpen, gpc, choice, save, openSettings, closeSettings } = useConsent();
  if (settingsOpen) return <ChoicesDialog initial={choice} gpc={gpc} onSave={(c) => save(c, 'settings')} onClose={closeSettings} />;
  if (decided) return null;
  return (
    <section
      role="region"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-card p-4 pb-safe shadow-lg sm:inset-x-auto sm:bottom-4 sm:end-4 sm:max-w-md sm:rounded-lg sm:border"
    >
      <div className="flex items-start gap-3">
        <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 space-y-3 text-sm">
          <p className="font-semibold">Your privacy choices</p>
          <p className="text-muted-foreground">
            We use essential cookies to run the site. With your OK we also use analytics to improve it and marketing cookies for ads on other sites, which can count as “sharing” your data under US state laws.{' '}
            <Link href="/privacy" className="font-semibold text-foreground underline underline-offset-2">Privacy Policy</Link>
          </p>
          {gpc && <p className="flex items-center gap-1.5 text-xs text-success"><ShieldCheck className="h-4 w-4" aria-hidden /> Your browser’s Global Privacy Control is on, so marketing cookies stay off.</p>}
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="outline" onClick={() => save({ analytics: false, marketing: false }, 'banner')}>Reject all</Button>
            <Button size="sm" onClick={() => save({ analytics: true, marketing: !gpc }, gpc ? 'gpc' : 'banner')}>Accept all</Button>
          </div>
          <button type="button" onClick={openSettings} className="text-xs font-semibold text-foreground underline underline-offset-2">Choose what to allow</button>
        </div>
      </div>
    </section>
  );
}

function ChoicesDialog({ initial, gpc, onSave, onClose }: { initial: ConsentChoice; gpc: boolean; onSave: (c: ConsentChoice) => void; onClose: () => void }) {
  const [c, setC] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const Row = ({ title, body, checked, disabled, onChange }: { title: string; body: string; checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void }) => (
    <label className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
      <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-primary" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
    </label>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-choices-title"
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-lg bg-card p-5 shadow-lg outline-none sm:max-w-lg sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="privacy-choices-title" className="text-xl font-semibold">Your privacy choices</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-sm p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-4 space-y-3 text-sm">
          <Row title="Essential" body="Sign-in, security, payments and your bookings. Always on." checked disabled />
          <Row title="Analytics" body="Our own count of visits and which pages are used, so we can improve the site." checked={c.analytics} onChange={(v) => setC({ ...c, analytics: v })} />
          <Row
            title="Marketing and ads (sale or sharing)"
            body={gpc ? 'Off because your browser sends Global Privacy Control.' : 'Google and Meta ad cookies that measure ads and show you CatoDrive ads on other sites. Turning this off opts you out of the sale or sharing of your personal information for ads.'}
            checked={c.marketing && !gpc}
            disabled={gpc}
            onChange={(v) => setC({ ...c, marketing: v })}
          />
          <p className="text-xs text-muted-foreground">
            We never sell your data for money. You can change these choices any time from “Your Privacy Choices” at the bottom of every page. Read the <Link href="/privacy" className="font-semibold text-foreground underline underline-offset-2">Privacy Policy</Link>.
          </p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => onSave({ analytics: false, marketing: false })}>Reject all</Button>
          <Button onClick={() => onSave(c)}>Save choices</Button>
        </div>
      </div>
    </div>
  );
}

// IDs are written into an inline script, so only exact ID shapes get through.
const safe = (v: string | undefined, re: RegExp) => (v && re.test(v) ? v : '');

type Gtag = (...args: unknown[]) => void;
type Fbq = ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[] };

// Ad and analytics tags load only after consent; withdrawing consent tells them to stop.
export function AdTags() {
  const { choice } = useConsent();
  const tags = usePlatformConfig().data?.adTags;
  const ga4 = choice.analytics ? safe(tags?.ga4Id, /^G-[A-Z0-9]{4,16}$/) : '';
  const ads = choice.marketing ? safe(tags?.googleAdsId, /^AW-\d{6,14}$/) : '';
  const meta = choice.marketing ? safe(tags?.metaPixelId, /^\d{10,20}$/) : '';
  const google = ga4 || ads;

  useEffect(() => {
    const w = window as Window & { gtag?: Gtag; fbq?: Fbq };
    w.gtag?.('consent', 'update', { analytics_storage: choice.analytics ? 'granted' : 'denied', ad_storage: choice.marketing ? 'granted' : 'denied', ad_user_data: choice.marketing ? 'granted' : 'denied', ad_personalization: choice.marketing ? 'granted' : 'denied' });
    w.fbq?.('consent', choice.marketing ? 'grant' : 'revoke');
  }, [choice.analytics, choice.marketing]);

  return (
    <>
      {google && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(google)}`} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('consent','default',{analytics_storage:'${ga4 ? 'granted' : 'denied'}',ad_storage:'${ads ? 'granted' : 'denied'}',ad_user_data:'${ads ? 'granted' : 'denied'}',ad_personalization:'${ads ? 'granted' : 'denied'}'});gtag('js',new Date());${ga4 ? `gtag('config','${ga4}');` : ''}${ads ? `gtag('config','${ads}');` : ''}`}
          </Script>
        </>
      )}
      {meta && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('consent','grant');fbq('init','${meta}');fbq('track','PageView');`}
        </Script>
      )}
    </>
  );
}

export function PrivacyChoicesLink({ className }: { className?: string }) {
  const ctx = useConsentOptional();
  if (!ctx) return <Link href="/privacy" className={className}>Your Privacy Choices</Link>;
  return (
    <button type="button" onClick={ctx.openSettings} className={className}>
      Your Privacy Choices
    </button>
  );
}

// The California opt-out link: one click turns off marketing cookies and records it.
export function DoNotSellLink({ className }: { className?: string }) {
  const ctx = useConsentOptional();
  if (!ctx) return <Link href="/privacy" className={className}>Do Not Sell or Share My Personal Information</Link>;
  return (
    <button type="button" onClick={() => { ctx.save({ analytics: ctx.choice.analytics, marketing: false }, 'settings'); ctx.openSettings(); }} className={className}>
      Do Not Sell or Share My Personal Information
    </button>
  );
}
