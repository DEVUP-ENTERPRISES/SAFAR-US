import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { BottomSheet, Input, Text, useTheme, space, TOUCH } from '@catodrive/ui';
import { PICKER_ORDER, countryByCode, flagOf, parsePhone, toE164 } from '../web/lib/data/countries';

/** Country code plus number, emitted as E.164 exactly like the website's phone field. */
export function PhoneInput({ label, value, onChange, defaultCountry = 'US', error }: { label?: string; value: string; onChange: (e164: string) => void; defaultCountry?: string; error?: string }) {
  const { c } = useTheme();
  const [{ code, national }, setState] = useState(() => parsePhone(value, defaultCountry));
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (value && !national) setState(parsePhone(value, defaultCountry));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (nextCode: string, nextNational: string) => {
    setState({ code: nextCode, national: nextNational });
    const dial = countryByCode(nextCode)?.dial ?? '1';
    onChange(nextNational.replace(/\D/g, '') ? toE164(dial, nextNational) : '');
  };
  const dial = countryByCode(code)?.dial ?? '1';

  return (
    <>
      <Input
        label={label}
        value={national}
        onChangeText={(t) => emit(code, t)}
        keyboardType="phone-pad"
        autoComplete="tel-national"
        textContentType="telephoneNumber"
        error={error}
        left={
          <Pressable accessibilityRole="button" accessibilityLabel={`Country code +${dial}`} onPress={() => setPicking(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: space.sm, borderRightWidth: 1, borderRightColor: c.border }}>
            <Text>{flagOf(code)} +{dial}</Text>
            <ChevronDown size={14} color={c.mutedForeground} />
          </Pressable>
        }
      />
      <BottomSheet visible={picking} onClose={() => setPicking(false)} title="Country code">
        <FlatList
          data={PICKER_ORDER}
          keyExtractor={(x) => x.code}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                emit(item.code, national);
                setPicking(false);
              }}
              style={{ minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: item.code === code ? c.primarySoft : 'transparent', paddingHorizontal: space.sm, borderRadius: 10 }}
            >
              <Text>{flagOf(item.code)}</Text>
              <Text style={{ flex: 1 }}>{item.name}</Text>
              <Text tone="muted">+{item.dial}</Text>
            </Pressable>
          )}
        />
      </BottomSheet>
    </>
  );
}
