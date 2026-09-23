'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Phone, Mail, MapPin, Clock, ChevronDown, Send, CheckCircle2 } from 'lucide-react';
import { Reveal } from '@/components/ui/reveal';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { SectionEyebrow, BRAND } from '@/features/marketing/sections';
import { LocationMap } from '@/features/maps/components/location-map';
import { contactApi, type ContactInterest } from '@/features/contact/api';
import { ApiError } from '@/lib/api/types';

const INFO_CARDS = [
  { icon: Phone, title: 'Call Us', lines: ['(214) 814-0402', 'Available 7 days a week', '8 AM – 10 PM Central'] },
  { icon: Mail, title: 'Email Us', lines: ['shoaib@catodrive.com', 'Asset partner inquiries', 'Corporate accounts'] },
  { icon: MapPin, title: 'Visit Us', lines: ['Dallas/Fort Worth, TX', 'Operations near DFW Airport', 'By appointment only'] },
] as const;

const INTEREST_OPTIONS: { value: ContactInterest; label: string }[] = [
  { value: 'asset_partner', label: 'Listing my vehicle as an Asset Partner' },
  { value: 'investor', label: 'Investing in CatoDrive' },
  { value: 'corporate', label: 'A corporate account' },
  { value: 'general', label: 'A general question' },
  { value: 'other', label: 'Something else' },
];

const FAQ_ITEMS = [
  { q: 'How do I become an asset partner?', a: `Start the intake form on the Asset Partners page — it takes about 10 minutes. Our team reviews every submission and schedules an in-person vehicle assessment within 2–3 business days.` },
  { q: 'What’s the fastest way to reach you?', a: 'Call or text (214) 814-0402 — we’re available 7 days a week, 8 AM–10 PM Central. For anything that needs documents or detail attached, email is usually faster to act on.' },
  { q: 'Do you offer corporate accounts?', a: `Yes — B2B fleet accounts for enterprises and staffing agencies, with volume pricing and consolidated billing. Select "A corporate account" below and tell us your team size and use case.` },
  { q: 'Where are you located?', a: `${BRAND} operates near DFW International Airport and Dallas Love Field, serving the greater Dallas/Fort Worth area. Our office is by appointment only — reach out to schedule a visit.` },
] as const;

const DFW_AIRPORT = { lat: 32.8998, lng: -97.0403 };

const VALID_INTERESTS = new Set(INTEREST_OPTIONS.map((o) => o.value));

function ContactForm() {
  const notify = useToast();
  const searchParams = useSearchParams();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [interest, setInterest] = useState<ContactInterest | ''>('');
  const [message, setMessage] = useState('');

  // Pre-select from ?interest= — e.g. the Investors page's "Request the Full
  // Deck" routes here instead of a bare mailto:, so the lead is a durable,
  // admin-visible record too, not just an email that only ever lives in an inbox.
  useEffect(() => {
    const q = searchParams.get('interest');
    if (q && VALID_INTERESTS.has(q as ContactInterest)) setInterest(q as ContactInterest);
  }, [searchParams]);
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const next = new Set<string>();
    if (!fullName.trim()) next.add('fullName');
    if (!/^\S+@\S+\.\S+$/.test(email)) next.add('email');
    if (!interest) next.add('interest');
    if (message.trim().length < 5) next.add('message');
    setErrors(next);
    if (next.size > 0) return;

    setSubmitting(true);
    try {
      await contactApi.submit({ fullName: fullName.trim(), email: email.trim(), phone: phone.trim() || undefined, interest: interest as ContactInterest, message: message.trim() });
      setSent(true);
    } catch (err) {
      notify({ tone: 'error', title: 'Couldn’t send', description: err instanceof ApiError ? err.message : 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="-mt-6">
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="full-bleed relative isolate grain overflow-hidden hero-mesh">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-primary-soft backdrop-blur">
              Contact Us
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="display mt-7 max-w-2xl text-[2.7rem] leading-[0.98] text-white sm:text-[4rem]">Get in touch.</h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-white/70 sm:text-xl">
              Interested in becoming an asset partner? Have questions about {BRAND}? We’re here to help.
            </p>
          </Reveal>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-14 px-5 pb-16 pt-10 sm:pt-12">
        {/* ── INFO CARDS ───────────────────────────────────────────────── */}
        <section className="-mt-24 sm:-mt-28">
          <div className="grid gap-4 sm:grid-cols-3">
            {INFO_CARDS.map((c, i) => (
              <Reveal key={c.title} delay={i * 80}>
                <div className="h-full rounded-3xl border border-border bg-card p-7 shadow-2xl shadow-black/5">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                    <c.icon className="h-6 w-6" />
                  </span>
                  <h3 className="display mt-5 text-xl">{c.title}</h3>
                  <p className="mt-2 text-sm font-semibold text-foreground">{c.lines[0]}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{c.lines[1]}<br />{c.lines[2]}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── FORM ─────────────────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-2xl">
            <SectionEyebrow>Send Us a Message</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Whether it’s a car or a question.</h2>
            <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
              Whether you’re interested in listing your vehicle or have questions about {BRAND}, we’ll get back to
              you within 24 hours.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
            {/* Quick-reference sidebar */}
            <Reveal>
              <div className="h-full space-y-4 rounded-3xl border border-border bg-card p-7 shadow-card">
                <SidebarRow icon={Phone} label="Phone" value="(214) 814-0402" href="tel:+12148140402" />
                <SidebarRow icon={Mail} label="Email" value="shoaib@catodrive.com" href="mailto:shoaib@catodrive.com" />
                <SidebarRow icon={MapPin} label="Location" value="Dallas/Fort Worth, TX" />
                <SidebarRow icon={Clock} label="Hours" value="Mon–Sun: 8 AM – 10 PM Central" />
              </div>
            </Reveal>

            {/* The form itself */}
            <Reveal delay={80}>
              {sent ? (
                <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-success/30 bg-success/5 p-10 text-center">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-success/10 text-success ring-1 ring-success/20">
                    <CheckCircle2 className="h-7 w-7" />
                  </span>
                  <h3 className="display mt-5 text-2xl">Message sent</h3>
                  <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
                    Thanks for reaching out — we’ll get back to you within 24 hours.
                  </p>
                </div>
              ) : (
                <div className="rounded-3xl border border-border bg-card p-7 shadow-card">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Full Name" error={errors.has('fullName') ? 'Required.' : undefined}>
                      <Input value={fullName} onChange={(e) => { setFullName(e.target.value); errors.delete('fullName'); }} placeholder="Full Name" />
                    </Field>
                    <Field label="Email Address" error={errors.has('email') ? 'Enter a valid email.' : undefined}>
                      <Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); errors.delete('email'); }} placeholder="Email Address" />
                    </Field>
                  </div>
                  <div className="mt-5">
                    <Field label="Phone Number (optional)">
                      <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone Number" />
                    </Field>
                  </div>
                  <div className="mt-5">
                    <Field label="I’m interested in… *" error={errors.has('interest') ? 'Select one.' : undefined}>
                      <Select value={interest} onChange={(e) => { setInterest(e.target.value as ContactInterest); errors.delete('interest'); }}>
                        <option value="">Select one…</option>
                        {INTEREST_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <div className="mt-5">
                    <Field label="Message" error={errors.has('message') ? 'Tell us a bit more.' : undefined}>
                      <Textarea value={message} onChange={(e) => { setMessage(e.target.value); errors.delete('message'); }} placeholder="Message" rows={5} />
                    </Field>
                  </div>
                  <Button onClick={submit} loading={submitting} size="lg" className="mt-6 w-full">
                    Send Message <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </Reveal>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <section>
          <Reveal className="mx-auto max-w-2xl text-center">
            <SectionEyebrow>Quick Answers</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Common questions we get.</h2>
          </Reveal>
          <div className="mx-auto mt-12 max-w-3xl divide-y divide-border overflow-hidden rounded-3xl border border-border">
            {FAQ_ITEMS.map((item) => (
              <FaqRow key={item.q} {...item} />
            ))}
          </div>
        </section>

        {/* ── MAP ──────────────────────────────────────────────────────── */}
        <section>
          <Reveal className="max-w-2xl">
            <SectionEyebrow>Find Us</SectionEyebrow>
            <h2 className="display mt-4 text-4xl sm:text-5xl">Dallas–Fort Worth.</h2>
            <p className="mt-4 text-[15px] text-muted-foreground">
              Operations centered near DFW International Airport. Office visits by appointment only —{' '}
              <Link href="tel:+12148140402" className="font-semibold text-primary">call ahead to schedule</Link>.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <LocationMap lat={DFW_AIRPORT.lat} lng={DFW_AIRPORT.lng} label="CatoDrive — Dallas/Fort Worth" zoom={9.5} className="mt-8 h-80 w-full sm:h-96" />
          </Reveal>
        </section>
      </div>
    </div>
  );
}

export default function ContactPage() {
  return (
    <Suspense fallback={null}>
      <ContactForm />
    </Suspense>
  );
}

function SidebarRow({ icon: Icon, label, value, href }: { icon: typeof Phone; label: string; value: string; href?: string }) {
  const inner = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </>
  );
  return href ? (
    <a href={href} className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-primary/[0.04]">{inner}</a>
  ) : (
    <div className="flex items-center gap-3 p-2">{inner}</div>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-card">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-muted/30">
        <span className="text-[15px] font-semibold text-foreground">{q}</span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${open ? 'rotate-180 text-primary' : ''}`} />
      </button>
      <div className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <p className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>
        </div>
      </div>
    </div>
  );
}
