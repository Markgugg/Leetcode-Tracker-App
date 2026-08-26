import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { PillButton } from '@/components/PillButton';
import { ProgressRing } from '@/components/Ring';
import { colors, pressed } from '@/theme';
import type { CrewMemberStat } from './useSummaryData';

export interface SharingSectionProps {
  crewName: string | null;
  members: CrewMemberStat[];
  onPressCrew: () => void;
  /** Opens the weekly-recap preview sheet. Omit to hide the affordance. */
  onShareRecap?: () => void;
}

/**
 * §3.6.7 — section title 20/700/-0.5 + the crew name as a link, then a row of
 * 56px avatars each ringed by that member's volume progress in `#FA114F`,
 * with the name at 11/500 beneath.
 *
 * The weekly recap lives here rather than on the rings card: this is the one
 * section on the screen that is *about* showing your week to someone else, and
 * the rings card header already spends its right-hand slot on the chevron. It
 * is also why the section now survives having no crew — a soloist still has a
 * week worth sharing, they just have no avatars above the button.
 */
export function SharingSection({
  crewName,
  members,
  onPressCrew,
  onShareRecap,
}: SharingSectionProps) {
  const hasCrew = !!crewName && members.length > 0;
  if (!hasCrew && !onShareRecap) return null;

  return (
    <View>
      <View style={s.header}>
        <Text style={s.title}>Sharing</Text>
        {hasCrew ? (
          <Pressable onPress={onPressCrew} hitSlop={8} style={({ pressed: p }) => [p && pressed]}>
            <Text style={s.link}>{crewName}</Text>
          </Pressable>
        ) : null}
      </View>

      {hasCrew ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.row}>
        {members.map((m) => (
          <Pressable
            key={m.id}
            onPress={onPressCrew}
            style={({ pressed: p }) => [s.member, p && pressed]}>
            <ProgressRing
              size={56}
              r={26}
              strokeWidth={4}
              color={colors.volume}
              trackColor={colors.volumeTrack}
              progress={m.goal > 0 ? m.volume / m.goal : 0}>
              <Avatar name={m.name} url={m.avatarUrl} size={44} />
            </ProgressRing>
            <Text style={[s.name, m.isMe && s.nameMe]} numberOfLines={1}>
              {m.isMe ? 'You' : m.name.split(' ')[0]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      ) : null}

      {onShareRecap ? (
        <PillButton
          label="Share weekly recap"
          icon="share-outline"
          variant="accent"
          size="md"
          onPress={onShareRecap}
          style={[s.recap, !hasCrew && s.recapSolo]}
          testID="share-recap"
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.5, color: colors.text },
  link: { fontSize: 14, fontWeight: '600', color: colors.accentText },
  row: { gap: 16, paddingRight: 4 },
  member: { alignItems: 'center', gap: 7, width: 62 },
  recap: { marginTop: 16 },
  recapSolo: { marginTop: 0 },
  name: { fontSize: 11, fontWeight: '500', color: colors.textTertiary },
  nameMe: { color: colors.text },
});

export default SharingSection;
