import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ArrowRight, BadgeCheck, MapPin, ShieldCheck, Zap } from 'lucide-react-native';
import { Button, Card, Chip, Screen, Skeleton, Text, useTheme, radius, space } from '@catodrive/ui';
import { openInAppBrowser, webUrl } from '@catodrive/core';
import { useFacets, useTrending } from '@catodrive/core/web/features/vehicles/hooks';
import { useSearchBar } from '@catodrive/core/web/features/search/search-store';
import { SearchBar } from '@/features/search/SearchBar';
import { VehicleCard } from '@/features/vehicles/VehicleCard';

const STEPS = [
  { image: require('../../../assets/images/catodrive-find-the-one.webp'), title: 'Find the one', body: 'Browse our premium managed fleet. Filter by price, vehicle type, or delivery - every car is operated by us.' },
  { image: require('../../../assets/images/catodrive-book-in-seconds.webp'), title: 'Book in seconds', body: 'Reserve instantly with Instant Book. No back-and-forth, no waiting on anyone to approve.' },
  { image: require('../../../assets/images/catodrive-hit-the-road.webp'), title: 'Hit the road', body: 'Pick it up or have our team deliver it - your door, hotel, or terminal. Keys in hand, on time.' },
];

const WHY_ITEMS = [
  { icon: MapPin, title: 'Curbside at the terminal', body: 'We deliver to DFW International and Love Field - no shuttle, no satellite lot, no queue.' },
  { icon: ShieldCheck, title: 'Every car is managed by us', body: 'Not a marketplace. Every vehicle is owned by CatoDrive or our Asset Partners, and insured and maintained by CatoDrive.' },
  { icon: Zap, title: 'Instant Book, always', body: 'Confirm in seconds. No host approval, no waiting. The reservation is live the moment you pay.' },
  { icon: BadgeCheck, title: 'Up to $0 deductible', body: 'Choose a protection plan at checkout. Our Premier plan covers you completely - zero out-of-pocket.' },
];

function Eyebrow({ children }: { children: string }) {
  return <Text variant="small" tone="primary" style={{ letterSpacing: 2 }}>{children.toUpperCase()}</Text>;
}

/** The website's homepage: hero photo with the search bar, cars ready to book, how it works, why CatoDrive, Asset Partners. */
export default function HomeScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const facets = useFacets();
  const cities = facets.data?.cities ?? [];
  const [picked, setPicked] = useState('');
  const active = cities.find((x) => x.city === picked) ?? cities[0];
  const trending = useTrending(active?.lng, active?.lat);
  const setBar = useSearchBar((s) => s.patch);
  const cardWidth = Math.min(width * 0.82, 360);

  return (
    <Screen onRefresh={() => void Promise.all([facets.refetch(), trending.refetch()])} refreshing={facets.isRefetching || trending.isRefetching}>
      <View>
        <View style={[styles.hero, { backgroundColor: c.ink }]} accessibilityRole="image" accessibilityLabel="CatoDrive: rent premium cars delivered to you">
          <Image source={require('../../../assets/images/catodrive-hit-the-road.webp')} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{ top: '35%' }} />
        </View>
        <View style={styles.overlap}>
          <SearchBar onSearch={() => router.navigate('/search')} />
        </View>
      </View>

      <View style={styles.section}>
        <Eyebrow>Ready to book</Eyebrow>
        <Text variant="title">{active?.city ? `Available in ${active.city}` : 'Our vehicles'}</Text>
        {cities.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {cities.map((x) => (
              <Chip key={x.city} label={x.city} selected={x.city === active?.city} onPress={() => setPicked(x.city)} />
            ))}
          </ScrollView>
        ) : null}
        {trending.isPending ? (
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Skeleton height={320} width={cardWidth} round={radius.xl} />
          </View>
        ) : trending.data?.length ? (
          <>
            <FlatList
              horizontal
              data={trending.data}
              keyExtractor={(v) => v._id}
              renderItem={({ item }) => <VehicleCard vehicle={item} width={cardWidth} />}
              ItemSeparatorComponent={() => <View style={{ width: space.md }} />}
              showsHorizontalScrollIndicator={false}
              snapToInterval={cardWidth + space.md}
              decelerationRate="fast"
              style={{ marginHorizontal: -space.lg }}
              contentContainerStyle={{ paddingHorizontal: space.lg }}
            />
            <Button
              title="View all vehicles"
              variant="outline"
              icon={<ArrowRight size={18} color={c.foreground} />}
              onPress={() => {
                if (active?.city) setBar({ city: active.city, center: null });
                router.navigate('/search');
              }}
            />
          </>
        ) : (
          <Card>
            <Text tone="muted" center>
              No vehicles available right now -{' '}
              <Text tone="primary" variant="label" onPress={() => router.push('/contact')}>contact us</Text> to arrange a booking.
            </Text>
          </Card>
        )}
      </View>

      <View style={styles.section}>
        <Eyebrow>How it works</Eyebrow>
        <Text variant="title">No counter. No queue. No paperwork.</Text>
        <Text tone="muted">Three steps from search to keys in hand.</Text>
        {STEPS.map((s, i) => (
          <View key={s.title} style={{ gap: space.sm }}>
            <Image source={s.image} style={styles.stepImage} contentFit="cover" accessibilityLabel={s.title} />
            <View style={styles.stepHead}>
              <View style={[styles.stepNum, { backgroundColor: c.primary }]}>
                <Text variant="label" style={{ color: c.primaryForeground }}>{i + 1}</Text>
              </View>
              <Text variant="heading">{s.title}</Text>
            </View>
            <Text tone="muted">{s.body}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Eyebrow>Why CatoDrive</Eyebrow>
        <Text variant="title">A rental company that works the way you travel.</Text>
        {WHY_ITEMS.map(({ icon: Icon, title, body }) => (
          <Card key={title}>
            <View style={[styles.whyIcon, { backgroundColor: c.primarySoft }]}>
              <Icon size={22} color={c.primary} />
            </View>
            <Text variant="heading" style={{ marginTop: space.md }}>{title}</Text>
            <Text tone="muted" style={{ marginTop: space.xs }}>{body}</Text>
          </Card>
        ))}
      </View>

      <View style={[styles.partner, { backgroundColor: c.ink }]}>
        <Text variant="small" style={{ color: c.inkForeground, opacity: 0.8, letterSpacing: 2 }}>ASSET PARTNER PROGRAMME</Text>
        <Text variant="display" style={{ color: '#fff' }}>
          Your car can pay <Text variant="display" style={{ color: 'rgba(255,255,255,0.55)' }}>for itself.</Text>
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.7)' }}>We list it, price it, deliver it and service it - with no calendar to manage, no guests to coordinate, no hassle.</Text>
        <Button title="Become an Asset Partner" variant="secondary" icon={<ArrowRight size={18} color={c.foreground} />} onPress={() => void openInAppBrowser(webUrl('/asset-partners'))} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { aspectRatio: 3 / 2, borderRadius: radius.xl + 10, overflow: 'hidden' },
  overlap: { marginTop: -40, marginHorizontal: space.sm },
  section: { gap: space.md, marginTop: space.md },
  stepImage: { width: '100%', aspectRatio: 16 / 10, borderRadius: radius.xl },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  whyIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  partner: { borderRadius: radius.xl + 6, padding: space.xl, gap: space.md, marginTop: space.md },
});
