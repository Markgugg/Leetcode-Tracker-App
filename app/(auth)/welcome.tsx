import { useRef, useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Dimensions, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GemChip } from '@/ranks/GemChip';
import { RANKS } from '@/ranks/ranks-data';
import { colors, radius, space } from '@/theme';

const { width: SW } = Dimensions.get('window');

type Slide = {
  title: string;
  body: string;
  render: () => React.ReactNode;
};

function ValueRow({ icon, title, body }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; body: string }) {
  return (
    <View style={s.valRow}>
      <View style={s.valIcon}>
        <Ionicons name={icon} size={17} color={colors.accentText} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.valTitle}>{title}</Text>
        <Text style={s.valBody}>{body}</Text>
      </View>
    </View>
  );
}

const SLIDES: Slide[] = [
  {
    title: 'Grind\ntogether.',
    body: 'LeetCode is lonely. Your squad sees every solve, your streak, your rank — the moment it happens.',
    render: () => (
      <View style={s.valList}>
        <ValueRow icon="sync" title="Auto-synced" body="Solve on LeetCode, it shows up here. No logging." />
        <ValueRow icon="diamond" title="Ranked" body="Bronze to Grandmaster. Your squad watches you climb." />
        <ValueRow icon="flag" title="Accountable" body="Weekly goals with a leaderboard that resets Monday." />
      </View>
    ),
  },
  {
    title: 'Every solve,\nseen.',
    body: 'A live feed of your squad’s grind. Hard solves get celebrated. Slacking gets noticed.',
    render: () => (
      <View style={s.feedPreview}>
        <View style={s.previewCard}>
          <Text style={s.previewName}>dhruv <Text style={s.previewDim}>solved</Text> Trapping Rain Water</Text>
          <View style={[s.previewPill, { backgroundColor: colors.hard + '20' }]}>
            <Text style={[s.previewPillText, { color: colors.hard }]}>HARD · +60 pts</Text>
          </View>
        </View>
        <View style={[s.previewCard, { opacity: 0.75 }]}>
          <Text style={s.previewName}>ronak <Text style={s.previewDim}>is on a</Text> 21-day streak 🔥</Text>
        </View>
        <View style={[s.previewCard, { opacity: 0.5 }]}>
          <Text style={s.previewName}>you're <Text style={s.previewDim}>#2 this week ·</Text> 45 pts behind</Text>
        </View>
      </View>
    ),
  },
  {
    title: 'Climb the\nladder.',
    body: 'Nine gem ranks driven by difficulty, breadth, and consistency — not just volume.',
    render: () => (
      <View style={s.gemRow}>
        {RANKS.slice(0, 5).map(r => (
          <View key={r.key} style={s.gemItem}>
            <GemChip tier={r} size={44} />
            <Text style={s.gemLabel}>{r.name}</Text>
          </View>
        ))}
      </View>
    ),
  },
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom + space(4) }]}>
      <StatusBar barStyle="light-content" />

      <View style={s.logoWrap}>
        <View style={s.logoMark}><Text style={s.logoLetter}>G</Text></View>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={e => setPage(Math.round(e.nativeEvent.contentOffset.x / SW))}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={[s.slide, { width: SW }]}>
            <Text style={s.h1}>{slide.title}</Text>
            <Text style={s.body}>{slide.body}</Text>
            {slide.render()}
          </View>
        ))}
      </ScrollView>

      <View style={s.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, page === i && s.dotOn]} />
        ))}
      </View>

      <View style={s.footer}>
        <Pressable style={s.cta} onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'up' } })}>
          <Text style={s.ctaText}>Get started</Text>
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: '/sign-in', params: { mode: 'in' } })} style={s.signin}>
          <Text style={s.signinText}>
            Have an account? <Text style={s.signinLink}>Sign in</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  logoWrap: { alignItems: 'center', paddingTop: space(6), paddingBottom: space(2) },
  logoMark: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 14, elevation: 8,
  },
  logoLetter: { color: '#fff', fontSize: 28, fontWeight: '900' },

  slide: { paddingHorizontal: space(8), paddingTop: space(6) },
  h1: { color: colors.text, fontSize: 36, fontWeight: '800', letterSpacing: -1, lineHeight: 41 },
  body: { color: colors.textDim, fontSize: 15, lineHeight: 22, marginTop: space(3), marginBottom: space(6) },

  valList: { gap: space(4) },
  valRow: { flexDirection: 'row', gap: space(3), alignItems: 'flex-start' },
  valIcon: {
    width: 36, height: 36, borderRadius: 11, backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  valTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  valBody: { color: colors.textDim, fontSize: 12.5, marginTop: 1, lineHeight: 18 },

  feedPreview: { gap: space(2) },
  previewCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: space(3),
    borderWidth: 1, borderColor: colors.border, gap: space(2),
  },
  previewName: { color: colors.text, fontSize: 13, fontWeight: '700' },
  previewDim: { color: colors.textDim, fontWeight: '500' },
  previewPill: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  previewPillText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  gemRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space(4), justifyContent: 'center', paddingTop: space(2) },
  gemItem: { alignItems: 'center', gap: space(1) },
  gemLabel: { color: colors.textDim, fontSize: 10, fontWeight: '700' },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7, paddingVertical: space(4) },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent, width: 18 },

  footer: { paddingHorizontal: space(6), gap: space(2) },
  cta: {
    backgroundColor: colors.accent, borderRadius: radius.lg, padding: space(4),
    alignItems: 'center', minHeight: 52, justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 12, elevation: 6,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  signin: { alignItems: 'center', paddingVertical: space(2) },
  signinText: { color: colors.textDim, fontSize: 14 },
  signinLink: { color: colors.accent, fontWeight: '700' },
});
