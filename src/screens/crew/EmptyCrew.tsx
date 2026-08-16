/** No-crew state — the only place in Crew with a primary call to action. */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Link } from 'expo-router';

import { GlassCard } from '@/components/GlassCard';
import { Ring } from '@/components/Ring';
import { colors, pressed, radius, shadow, type } from '@/theme';
import { H } from './parts';

const THIRD = { value: 1, goal: 3 };
const HALF = { value: 1, goal: 2 };
const FULL = { value: 1, goal: 1 };

export function EmptyCrew() {
  return (
    <View style={s.wrap}>
      <GlassCard radius={radius.cardLarge} style={s.card} contentStyle={s.cardBody}>
        <Ring volume={FULL} difficulty={HALF} streak={THIRD} size={104} stagger={90} />
        <Text style={s.title}>No crew yet</Text>
        <Text style={s.sub}>
          People who grind alone quit in 11 days. People in a crew last 4 months.
        </Text>
      </GlassCard>

      <Link href="/group/create" asChild>
        <Pressable
          accessibilityRole="button"
          style={({ pressed: p }) => [s.primaryPill, p && pressed]}>
          <Text style={s.primaryPillLabel}>Create a crew</Text>
        </Pressable>
      </Link>
      <Link href="/group/join" asChild>
        <Pressable accessibilityRole="button" style={({ pressed: p }) => [s.textBtn, p && pressed]}>
          <Text style={s.textBtnLabel}>Join with an invite code</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingHorizontal: H + 8, gap: 10 },
  card: { marginBottom: 12 },
  cardBody: { alignItems: 'center', gap: 14, paddingVertical: 28 },
  title: { ...type.screenSubtitle, color: colors.text, textAlign: 'center' },
  sub: { ...type.body, color: colors.textSecondary, textAlign: 'center' },
  primaryPill: {
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    ...shadow.sm,
  },
  primaryPillLabel: { ...type.buttonLabel, color: '#FFFFFF' },
  textBtn: { height: 54, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  textBtnLabel: { fontSize: 16, fontWeight: '400', color: colors.accentText },
});
