/** Crew sheets (§3.11): overflow menu, invite, full standings. */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { GlassCard } from '@/components/GlassCard';
import { Sheet } from '@/components/Sheet';
import { colors, pressed, radius, shadow, type } from '@/theme';
import { Hairline } from './parts';
import { StandingRow } from './StandingsCard';
import type { Crew, Member } from './types';

/* ------------------------------------------------------------------ */
/* Menu row                                                            */
/* ------------------------------------------------------------------ */

export function MenuRow({
  label,
  icon,
  danger,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
  onPress: () => void;
}) {
  const tint = danger ? colors.volume : colors.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed: p }) => [s.menuRow, p && pressed]}>
      <Ionicons name={icon} size={17} color={tint} />
      <Text style={[s.menuLabel, { color: tint }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={15} color={colors.textQuaternary} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Overflow menu                                                       */
/* ------------------------------------------------------------------ */

export function CrewMenuSheet({
  visible,
  crews,
  active,
  confirmLeave,
  onClose,
  onInvite,
  onSwitch,
  onLeave,
}: {
  visible: boolean;
  crews: Crew[];
  active: Crew;
  confirmLeave: boolean;
  onClose: () => void;
  onInvite: () => void;
  onSwitch: (id: string) => void;
  onLeave: () => void;
}) {
  const others = crews.filter((c) => c.id !== active.id);
  return (
    <Sheet visible={visible} onClose={onClose} title={active.name}>
      <GlassCard
        variant="small"
        radius={radius.smallCard}
        padding={0}
        contentStyle={s.menuCard}>
        <MenuRow label="Invite to crew" icon="person-add-outline" onPress={onInvite} />
        {others.map((c) => (
          <React.Fragment key={c.id}>
            <Hairline />
            <MenuRow
              label={`Switch to ${c.name}`}
              icon="swap-horizontal-outline"
              onPress={() => onSwitch(c.id)}
            />
          </React.Fragment>
        ))}
        <Hairline />
        <MenuRow
          label={confirmLeave ? 'Tap again to leave' : 'Leave crew'}
          icon="exit-outline"
          danger
          onPress={onLeave}
        />
      </GlassCard>
      <Text style={s.foot}>
        {crews.length} crew{crews.length === 1 ? '' : 's'} · rankings use ring completion, not
        points.
      </Text>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Invite                                                              */
/* ------------------------------------------------------------------ */

export function InviteSheet({
  visible,
  crew,
  onClose,
  onShare,
}: {
  visible: boolean;
  crew: Crew;
  onClose: () => void;
  onShare: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Invite" subtitle={crew.name} scroll={false}>
      <Text style={s.inviteCopy}>
        Share this code. They enter it once and land in {crew.name}.
      </Text>
      <View style={s.codeBox}>
        <Text style={s.codeText} selectable>
          {crew.invite_code}
        </Text>
      </View>
      <Pressable onPress={onShare} style={({ pressed: p }) => [s.primaryPill, p && pressed]}>
        <Text style={s.primaryPillLabel}>Share invite</Text>
      </Pressable>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Full standings                                                      */
/* ------------------------------------------------------------------ */

export function StandingsSheet({
  visible,
  members,
  userId,
  onClose,
  onMemberPress,
}: {
  visible: boolean;
  members: Member[];
  userId: string;
  onClose: () => void;
  onMemberPress: (uid: string) => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Standings"
      subtitle="Ring completion"
      maxHeightRatio={0.82}>
      <GlassCard variant="small" radius={radius.smallCard} padding={0} contentStyle={s.menuCard}>
        {members.map((m, i) => (
          <React.Fragment key={m.user_id}>
            {i > 0 && <Hairline />}
            <StandingRow
              member={m}
              index={i}
              isMe={m.user_id === userId}
              animate={false}
              onPress={() => {
                onClose();
                onMemberPress(m.user_id);
              }}
            />
          </React.Fragment>
        ))}
      </GlassCard>
    </Sheet>
  );
}

const s = StyleSheet.create({
  menuCard: { paddingHorizontal: 18 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  menuLabel: { flex: 1, fontSize: 15.5, fontWeight: '500' },
  foot: {
    ...type.bodySecondary,
    color: colors.textQuaternary,
    textAlign: 'center',
    marginTop: 16,
  },
  inviteCopy: { ...type.bodySecondary, color: colors.textSecondary, marginBottom: 18 },
  codeBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.accentSelectedBorder,
    backgroundColor: colors.accentSelectedFill,
    borderRadius: radius.smallCard,
    paddingVertical: 22,
    alignItems: 'center',
    marginBottom: 22,
  },
  codeText: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 4,
    color: colors.accentText,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
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
});
