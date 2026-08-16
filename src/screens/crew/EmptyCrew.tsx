/** No-crew state — the only place in Crew with a primary call to action. */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { PillButton } from '@/components/PillButton';
import { Ring } from '@/components/Ring';
import { colors, radius, type } from '@/theme';
import { H } from './parts';

const THIRD = { value: 1, goal: 3 };
const HALF = { value: 1, goal: 2 };
const FULL = { value: 1, goal: 1 };

export function EmptyCrew() {
  const router = useRouter();

  return (
    <View style={s.wrap}>
      <GlassCard radius={radius.cardLarge} style={s.card} contentStyle={s.cardBody}>
        <Ring volume={FULL} difficulty={HALF} streak={THIRD} size={104} stagger={90} />
        <Text style={s.title}>No crew yet</Text>
        <Text style={s.sub}>
          People who grind alone quit in 11 days. People in a crew last 4 months.
        </Text>
      </GlassCard>

      <PillButton
        label="Create a crew"
        variant="accent"
        onPress={() => router.push('/group/create')}
      />
      <PillButton label="Join with an invite code" onPress={() => router.push('/group/join')} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: H + 8, gap: 12 },
  card: { marginBottom: 12 },
  cardBody: { alignItems: 'center', gap: 14, paddingVertical: 28 },
  title: { ...type.screenSubtitle, color: colors.text, textAlign: 'center' },
  sub: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
});
