import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Search } from 'lucide-react-native';
import { Input, Text, radius, space, useTheme } from '@catodrive/ui';
import { mapsApi } from '../web/features/maps/api';

export interface PickedPlace {
  lat: number;
  lng: number;
  label: string;
  city: string;
}

/** The website's address autocomplete (/maps/autocomplete, then geocode on pick). */
export function LocationSearch({ onPick, placeholder = 'Search a city or place', label, hint }: { onPick: (p: PickedPlace) => void; placeholder?: string; label?: string; hint?: string }) {
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const suggestions = useQuery({ queryKey: ['ac', debounced], queryFn: () => mapsApi.autocomplete(debounced), enabled: open && debounced.length >= 2 });

  const pick = async (description: string) => {
    setQ(description);
    setOpen(false);
    setResolving(true);
    try {
      const [geo] = await mapsApi.geocode(description);
      if (geo) onPick({ lat: geo.lat, lng: geo.lng, label: geo.formatted, city: geo.city });
    } finally {
      setResolving(false);
    }
  };

  return (
    <View style={{ gap: space.xs }}>
      <Input
        label={label}
        hint={resolving ? 'Finding that address…' : hint}
        value={q}
        onChangeText={(t) => {
          setQ(t);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoCorrect={false}
        left={<MapPin size={18} color={c.mutedForeground} />}
        right={<Search size={18} color={c.mutedForeground} />}
        returnKeyType="search"
      />
      {open && suggestions.data && suggestions.data.length > 0 ? (
        <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.lg, backgroundColor: c.card, overflow: 'hidden' }}>
          {suggestions.data.map((s, i) => (
            <Pressable
              key={`${s.placeId ?? s.description}-${i}`}
              accessibilityRole="button"
              onPress={() => void pick(s.description)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, backgroundColor: pressed ? c.muted : undefined, borderTopWidth: i ? 1 : 0, borderColor: c.border })}
            >
              <MapPin size={16} color={c.mutedForeground} />
              <Text variant="caption" style={{ flex: 1 }}>{s.description}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
