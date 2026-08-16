/**
 * Standings (§3.8) — always visible, ranked on ring completion, not points.
 *
 * The card is pinned above the chat rather than scrolling inside it: the chat
 * list is `inverted` so it can open at the newest message, and anything in its
 * header would sit at the far end of the scrollback. Pinning also honours the
 * spec literally ("the old standings modal, now always visible").
 *
 * With more than `limit` members the card shows the podium plus a "See all"
 * row, and the full table moves into a sheet — a crew of 20 must not eat the
 * screen the chat lives in.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/Avatar';
import { GlassCard } from '@/components/GlassCard';
import { ProgressRing } from '@/components/Ring';
import { colors, pressed, radius, stroke, tabular } from '@/theme';
import { frac, statusLine } from './api';
import { Hairline } from './parts';
import type { Member } from './types';

export function StandingRow({
  member,
  index,
  isMe,
  onPress,
  animate = true,
}: {
  member: Member;
  index: number;
  isMe: boolean;
  onPress: () => void;
  animate?: boolean;
}) {
  const rankColor = index === 0 ? colors.medium : isMe ? colors.text : colors.textTertiary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${isMe ? 'You' : member.display_name ?? member.username}, rank ${
        index + 1
      }, ${Math.round(member.completion * 100)} percent of rings closed`}
      style={({ pressed: p }) => [s.row, p && pressed]}>
      <Text style={[s.rank, tabular, { color: rankColor }]}>{index + 1}</Text>

      <ProgressRing
        progress={frac(member.volume, member.volumeGoal)}
        size={40}
        r={25}
        strokeWidth={stroke.crewRing}
        color={colors.volume}
        trackColor={colors.volumeTrack}
        animate={animate}
        delay={animate ? Math.min(index, 6) * 60 : 0}>
        <Avatar name={member.display_name ?? member.username} url={member.avatar_url} size={29} />
      </ProgressRing>

      <View style={s.textCol}>
        <Text style={[s.name, isMe && { color: colors.accentText }]} numberOfLines={1}>
          {isMe ? 'You' : member.display_name ?? member.username}
        </Text>
        <Text style={s.status} numberOfLines={1}>
          {statusLine(member)}
        </Text>
      </View>

      <Text style={[s.completion, tabular]}>{Math.round(member.completion * 100)}%</Text>
    </Pressable>
  );
}

export function StandingsCard({
  members,
  userId,
  limit = 4,
  onMemberPress,
  onSeeAll,
}: {
  members: Member[];
  userId: string;
  /** Rows shown inline before collapsing into "See all". */
  limit?: number;
  onMemberPress: (uid: string) => void;
  onSeeAll: () => void;
}) {
  const collapsed = members.length > limit;
  const myIndex = members.findIndex((m) => m.user_id === userId);
  // Always keep the reader in the card: if they'd be cut off, swap them into
  // the last inline slot rather than hiding them behind "See all".
  const shown = React.useMemo(() => {
    if (!collapsed) return members.map((m, i) => ({ m, i }));
    const head = members.slice(0, limit).map((m, i) => ({ m, i }));
    if (myIndex >= limit) head[limit - 1] = { m: members[myIndex], i: myIndex };
    return head;
  }, [members, collapsed, limit, myIndex]);

  return (
    <GlassCard radius={radius.cardLarge} padding={0} contentStyle={s.cardBody}>
      {shown.map(({ m, i }, row) => (
        <React.Fragment key={m.user_id}>
          {row > 0 && <Hairline />}
          <StandingRow
            member={m}
            index={i}
            isMe={m.user_id === userId}
            onPress={() => onMemberPress(m.user_id)}
          />
        </React.Fragment>
      ))}
      {collapsed && (
        <>
          <Hairline />
          <Pressable
            onPress={onSeeAll}
            accessibilityRole="button"
            style={({ pressed: p }) => [s.seeAll, p && pressed]}>
            <Text style={s.seeAllLabel}>See all {members.length}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
          </Pressable>
        </>
      )}
    </GlassCard>
  );
}

const s = StyleSheet.create({
  cardBody: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rank: { fontSize: 15, fontWeight: '700', width: 18, textAlign: 'center' },
  textCol: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: colors.text },
  status: { fontSize: 12, fontWeight: '400', color: colors.textTertiary, marginTop: 2 },
  completion: { fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
  },
  seeAllLabel: { fontSize: 13.5, fontWeight: '500', color: colors.textSecondary },
});
