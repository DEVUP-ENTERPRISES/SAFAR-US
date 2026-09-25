'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { COUNTRIES, PICKER_ORDER, countryByCode, flagOf, toE164 } from '@/lib/data/countries';

/** Split a stored +E.164 number into country + national digits, longest dial code first. */
function parse(value: string, fallback: string): { code: string; national: string } {
  if (!value.startsWith('+')) return { code: fallback, national: value };
  const digits = value.slice(1);
  const match = [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => digits.startsWith(c.dial));
  return match ? { code: match.code, national: digits.slice(match.dial.length) } : { code: fallback, national: digits };
}

/**
 * A phone field that always yields E.164 ('+12148140402'), which Twilio requires.
 * Emits '' until a number is typed, so required-field checks keep working.
 */
export function PhoneInput({
  id,
  value,
  onChange,
  required,
  defaultCountry = 'US',
}: {
  id?: string;
  value: string;
  onChange: (e164: string) => void;
  required?: boolean;
  defaultCountry?: string;
}) {
  const [{ code, national }, setState] = useState(() => parse(value, defaultCountry));

  // Late prefill (profile loads after mount): adopt it only when the field is still empty.
  useEffect(() => {
    if (value && !national) setState(parse(value, defaultCountry));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const emit = (nextCode: string, nextNational: string) => {
    setState({ code: nextCode, national: nextNational });
    const dial = countryByCode(nextCode)?.dial ?? '1';
    onChange(nextNational.replace(/\D/g, '') ? toE164(dial, nextNational) : '');
  };

  return (
    <div className="flex gap-2">
      <Select
        aria-label="Country calling code"
        className="w-32 shrink-0"
        value={code}
        onChange={(e) => emit(e.target.value, national)}
      >
        {PICKER_ORDER.map((c) => (
          <option key={c.code} value={c.code}>
            {flagOf(c.code)} {c.code} +{c.dial}
          </option>
        ))}
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        required={required}
        value={national}
        onChange={(e) => emit(code, e.target.value)}
        placeholder="Phone number"
      />
    </div>
  );
}
