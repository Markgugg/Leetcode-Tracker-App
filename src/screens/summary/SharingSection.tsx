import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { ProgressRing } from '@/components/Ring';
import { colors, pressed } from '@/theme';
import type { CrewMemberStat } from './useSummaryData';

export interface SharingSectionProps {
  crewName: string | null;
  members: CrewMemberStat[];
  onPressCrew: () => void;
}

/**
 * §3.6.7 — section title 20/700/-0.5 + the crew name as a link, then a row of
 * 56px avatars each ringed by that member's volume progress in `#FA114F`,
 * with the name at 11/500 beneath.
 */
export function SharingSection({ crewName, members, onPressCrew }: SharingSectionProps) {
  if (!crewName || members.length === 0) return null;

  return (
    <View>
      <View style={s.header}>
        <Text style={s.title}>Sharing</Text>
        <Pressable onPress={onPressCrew} hitSlop={8} style={({ pressed: p }) => [p && pressed]}>
          <Text style={s.link}>{crewName}</Text>
        </Pressable>
      </View>

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
  name: { fontSize: 11, fontWeight: '500', color: colors.textTertiary },
  nameMe: { color: colors.text },
});

export default SharingSection;
