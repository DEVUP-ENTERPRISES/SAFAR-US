import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CheckCircle2, ChevronDown, Clock, Mail, MapPin, Phone, Send } from 'lucide-react-native';
import { Button, Card, Chip, Input, Screen, ScreenHeader, Section, Text, useTheme, useToast, space } from '@catodrive/ui';
import { contactApi, type ContactInterest } from '../web/features/contact/api';
import { CONTACT, CONTACT_FAQ, INTEREST_OPTIONS, contactFormErrors } from '../web/features/contact/content';
import { ApiError } from '../web/lib/api/types';
import { openExternal } from '../links';

function Faq({ q, a }: { q: string; a: string }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Card onPress={() => setOpen((o) => !o)} accessibilityLabel={q}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text variant="label" style={{ flex: 1 }}>{q}</Text>
        <ChevronDown size={18} color={c.mutedForeground} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </View>
      {open ? <Text tone="muted" style={{ marginTop: space.sm }}>{a}</Text> : null}
    </Card>
  );
}

/** The website's /contact: call, email, a message form and quick answers. */
export function ContactScreen() {
  const { c } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const qp = useLocalSearchParams<{ interest?: string }>();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [interest, setInterest] = useState<ContactInterest | ''>(INTEREST_OPTIONS.some((o) => o.value === qp.interest) ? (qp.interest as ContactInterest) : '');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    const next = contactFormErrors({ fullName, email, interest, message });
    setErrors(next);
    if (next.size) return;
    setSubmitting(true);
    try {
      await contactApi.submit({ fullName: fullName.trim(), email: email.trim(), phone: phone.trim() || undefined, interest: interest as ContactInterest, message: message.trim() });
      setSent(true);
    } catch (err) {
      toast({ tone: 'error', title: 'Couldn’t send', body: err instanceof ApiError ? err.message : 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const row = (Icon: React.ComponentType<{ size?: number; color?: string }>, label: string, value: string, href?: string) => (
    <Pressable key={label} accessibilityRole={href ? 'link' : undefined} disabled={!href} onPress={() => href && void openExternal(href)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm }}>
      <Icon size={20} color={c.primary} />
      <View style={{ flex: 1 }}>
        <Text variant="caption" tone="muted">{label}</Text>
        <Text variant="label" tone={href ? 'primary' : 'default'}>{value}</Text>
      </View>
    </Pressable>
  );

  return (
    <Screen header={<ScreenHeader title="Contact us" onBack={router.canGoBack() ? () => router.back() : undefined} />}>
      <View style={{ gap: space.sm }}>
        <Text variant="display">Get in touch.</Text>
        <Text tone="muted">Interested in becoming an asset partner? Have questions about CatoDrive? We’re here to help.</Text>
      </View>
      <Card>
        {row(Mail, 'Email', CONTACT.email, `mailto:${CONTACT.email}`)}
        {row(Phone, 'Asset Partner hotline (car owners only)', CONTACT.assetPartnerHotlineDisplay, CONTACT.assetPartnerHotlineHref)}
        {row(MapPin, 'Location', CONTACT.location)}
        {row(Clock, 'Hours', CONTACT.hours)}
      </Card>

      <Section title="Send us a message">
        {sent ? (
          <Card>
            <CheckCircle2 size={28} color={c.success} />
            <Text variant="heading" style={{ marginTop: space.sm }}>Message sent</Text>
            <Text tone="muted">Thanks for reaching out - we’ll get back to you within 24 hours.</Text>
          </Card>
        ) : (
          <>
            <Input label="Full name" value={fullName} onChangeText={(t) => { setFullName(t); errors.delete('fullName'); }} autoComplete="name" error={errors.has('fullName') ? 'Required.' : undefined} />
            <Input label="Email address" value={email} onChangeText={(t) => { setEmail(t); errors.delete('email'); }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={errors.has('email') ? 'Enter a valid email.' : undefined} />
            <Input label="Phone number (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
            <Text variant="label">I’m interested in…</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {INTEREST_OPTIONS.map((o) => <Chip key={o.value} label={o.label} selected={interest === o.value} onPress={() => { setInterest(o.value); errors.delete('interest'); }} />)}
            </View>
            {errors.has('interest') ? <Text variant="caption" tone="destructive">Select one.</Text> : null}
            <Input label="Message" value={message} onChangeText={(t) => { setMessage(t); errors.delete('message'); }} multiline style={{ minHeight: 110, textAlignVertical: 'top' }} error={errors.has('message') ? 'Tell us a bit more.' : undefined} />
            <Button title="Send message" icon={<Send size={18} color={c.primaryForeground} />} loading={submitting} onPress={() => void submit()} />
          </>
        )}
      </Section>

      <Section title="Common questions we get">
        {CONTACT_FAQ.map((f) => <Faq key={f.q} q={f.q} a={f.a} />)}
      </Section>
      <Button title="Open in maps" variant="outline" icon={<MapPin size={18} color={c.foreground} />} onPress={() => void openExternal(`https://www.google.com/maps/search/?api=1&query=${CONTACT.mapCenter.lat},${CONTACT.mapCenter.lng}`)} />
    </Screen>
  );
}
