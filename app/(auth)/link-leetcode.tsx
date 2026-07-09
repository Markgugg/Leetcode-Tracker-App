import { useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOnboarding } from '@/stores/onboarding';
import { OnboardingStep } from '@/components/OnboardingStep';
import { verifyLcUsername, fetchLcStats, type LcStats } from '@/lib/leetcode';
import { rankForSolves } from '@/ranks/ranks-data';
import { GemChip } from '@/ranks/GemChip';
import { colors, radius, space } from '@/theme';

type Status = 'idle' | 'checking' | 'valid' | 'invalid';

/** Onboarding step 2 of 4 — link LeetCode, with a live import preview. */
export default function LinkLeetCode() {
  const router = useRouter();
  const ob = useOnboarding();
  const [lcUsername, setLcUsername] = useState(ob.lcUsername);
  const [status, setStatus] = useState<Status>(ob.lcPreview ? 'valid' : 'idle');
  const [preview, setPreview] = useState<LcStats | null>(ob.lcPreview);

  const check = async () => {
    const trimmed = lcUsername.trim();
    if (!trimmed) return;
    setStatus('checking');
    setPreview(null);
    try {
      const valid = await verifyLcUsername(trimmed);
      if (!valid) { setStatus('invalid'); return; }
      setStatus('valid');
      // The payoff: show what the import gets them.
      const stats = await fetchLcStats(trimmed);
      setPreview(stats);
    } catch {
      setStatus('idle');
      Alert.alert('Could not verify', 'Check your connection and try again.');
    }
  };

  const next = (withLc: boolean) => {
    if (withLc && status !== 'valid') return;
    ob.set({
      lcUsername: withLc ? lcUsername.trim() : '',
      lcPreview: withLc ? preview : null,
    });
    router.push('/goal');
  };

  const startingRank = preview ? rankForSolves(preview.total) : null;
  const total = Math.max(1, (preview?.easy ?? 0) + (preview?.medium ?? 0) + (preview?.hard ?? 0));

  return (
    <OnboardingStep
      step={2}
      title="Link LeetCode"
      subtitle="Your solves import automatically — past and future."
    >
      <View style={s.row}>
        <TextInput
          style={[
            s.input,
            status === 'valid' && { borderColor: colors.easy },
            status === 'invalid' && { borderColor: colors.hard },
          ]}
          placeholder="your_lc_handle"
          placeholderTextColor={colors.textLight}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          value={lcUsername}
          onChangeText={v => { setLcUsername(v); setStatus('idle'); setPreview(null); }}
          returnKeyType="done"
          onSubmitEditing={check}
        />
        <Pressable
          style={[
            s.verifyBtn,
            status === 'valid' && { backgroundColor: colors.easy },
            (status === 'checking' || !lcUsername.trim()) && { opacity: 0.5 },
          ]}
          onPress={check}
          disabled={status === 'checking' || !lcUsername.trim()}
        >
          {status === 'checking'
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.verifyText}>{status === 'valid' ? '✓' : 'Verify'}</Text>
          }
        </Pressable>
      </View>
      {status === 'invalid' && <Text style={s.err}>Username not found on LeetCode</Text>}

      {/* Import preview */}
      {preview && (
        <View style={s.previewCard}>
          <View style={s.previewTop}>
            <Text style={s.previewLabel}>IMPORT PREVIEW</Text>
            <View style={s.countPill}>
              <Text style={s.countPillText}>{preview.total} solves</Text>
            </View>
          </View>
          <View style={s.bars}>
            {preview.easy > 0 && <View style={[s.bar, { flex: preview.easy / total, backgroundColor: colors.easy }]} />}
            {preview.medium > 0 && <View style={[s.bar, { flex: preview.medium / total, backgroundColor: colors.medium }]} />}
            {preview.hard > 0 && <View style={[s.bar, { flex: preview.hard / total, backgroundColor: colors.hard }]} />}
          </View>
          <View style={s.legendRow}>
            <Text style={[s.legend, { color: colors.easy }]}>{preview.easy} easy</Text>
            <Text style={[s.legend, { color: colors.medium }]}>{preview.medium} medium</Text>
            <Text style={[s.legend, { color: colors.hard }]}>{preview.hard} hard</Text>
          </View>
          {startingRank && (
            <View style={s.rankRow}>
              <GemChip tier={startingRank} size={26} />
              <Text style={s.rankText}>
                You'd start at <Text style={{ color: startingRank.glow, fontWeight: '800' }}>{startingRank.name}</Text>
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={{ flex: 1 }} />
      <Pressable
        style={[s.cta, status !== 'valid' && s.ctaDisabled]}
        onPress={() => next(true)}
        disabled={status !== 'valid'}
      >
        <Text style={s.ctaText}>Import my history</Text>
      </Pressable>
      <Pressable style={s.skip} onPress={() => next(false)}>
        <Text style={s.skipText}>I don't have a LeetCode account</Text>
      </Pressable>
    </OnboardingStep>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  input: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.lg,
    padding: space(4), color: colors.text, fontSize: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  verifyBtn: {
    backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingHorizontal: space(4), height: 52, minWidth: 74,
    alignItems: 'center', justifyContent: 'center',
  },
  verifyText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  err: { color: colors.hard, fontSize: 12, marginTop: space(2) },

  previewCard: {
    backgroundColor: '#151a2e', borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.accent + '45',
    padding: space(4), marginTop: space(4), gap: space(3),
  },
  previewTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewLabel: { color: colors.accentText, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  countPill: {
    backgroundColor: colors.accentLight, borderRadius: 20,
    paddingHorizontal: space(3), paddingVertical: 3,
  },
  countPillText: { color: colors.accentText, fontSize: 12, fontWeight: '800' },
  bars: { flexDirection: 'row', gap: 3, height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { borderRadius: 3 },
  legendRow: { flexDirection: 'row', gap: space(3) },
  legend: { fontSize: 12, fontWeight: '700' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: space(1) },
  rankText: { color: colors.textDim, fontSize: 13 },

  cta: {
    backgroundColor: colors.accent, borderRadius: radius.lg, padding: space(4),
    alignItems: 'center', minHeight: 52, justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  skip: { alignItems: 'center', paddingVertical: space(3) },
  skipText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
});
