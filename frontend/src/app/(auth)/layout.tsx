'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { config } from '@/lib/config';
import { CatoMark } from '@/components/layout/cato-mark';

const IMAGES = [
  'https://images.unsplash.com/photo-1617788138017-80ad40651399?q=80&w=2070&auto=format&fit=crop', // Tesla/Sleek
  'https://images.unsplash.com/photo-1503376762362-e610660600ce?q=80&w=2069&auto=format&fit=crop', // Porsche
  'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=2070&auto=format&fit=crop', // G-Wagon/Rugged
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(0);

  // Auto-playing carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % IMAGES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* LEFT SIDE: The Carousel (Hidden on very small mobile, or shown as header) */}
      <div className="relative hidden lg:flex w-1/2 flex-col justify-between overflow-hidden bg-zinc-950">
        {/* Images */}
        {IMAGES.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
              i === active ? 'opacity-50' : 'opacity-0'
            }`}
          />
        ))}

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />

        {/* Top bar on image */}
        <div className="relative z-10 flex items-center p-10">
          <Link href="/" className="flex items-center gap-2.5 text-white transition-transform hover:scale-105">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-zinc-950 shadow-lg">
              <CatoMark />
            </span>
            <span className="text-2xl font-black tracking-tight">{config.appName}</span>
          </Link>
        </div>

        {/* Marketing Copy on image */}
        <div className="relative z-10 p-10 pb-16">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-bold uppercase tracking-widest text-white/90 backdrop-blur-md">
            <Sparkles className="h-4 w-4" /> Top 1% Experience
          </span>
          <h1 className="mt-6 text-5xl font-black leading-[1.1] tracking-tight text-white xl:text-6xl">
            Drive the cars you&apos;ve <br /> always dreamed of.
          </h1>
          <p className="mt-6 max-w-md text-xl font-medium text-white/70">
            Join the world&apos;s leading peer-to-peer mobility platform. Skip the counter entirely.
          </p>

          {/* Carousel indicators */}
          <div className="mt-12 flex items-center gap-3">
            {IMAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === active ? 'w-8 bg-white' : 'w-2 bg-white/30 hover:bg-white/50'
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT SIDE: The Form */}
      <div className="relative flex w-full flex-col lg:w-1/2">
        {/* Mobile Header (Only visible when image is hidden) */}
        <div className="flex h-20 items-center justify-between px-6 lg:hidden">
          <Link href="/" className="flex items-center gap-2.5 transition-transform hover:scale-105">
            <span className="grid h-8 w-8 place-items-center rounded-lg brand-gradient shadow-soft text-white">
              <CatoMark />
            </span>
            <span className="text-xl font-black tracking-tight">{config.appName}</span>
          </Link>
          <Link href="/" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center p-6 sm:p-12 lg:p-16">
          <div className="w-full max-w-md animate-slide-in-right">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
