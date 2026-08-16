/**
 * Milestone card (§3.8) — the reaction loop.
 *
 * Glass first: a BlurView carries the surface, the §3.8 crimson gradient sits
 * on top of it as a tint rather than as an opaque fill, so the card reads as
 * the same material as every other surface, just coloured.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { Ring } from '@/components/Ring';
import { blur, colors, pressed, tabular, type } from '@/theme';
import { timeAgo } from './api';
import { EMOJIS, type Emoji, type MilestoneItem } from './types';

const FULL = { value: 1, goal: 1 };

export const MilestoneCard = React.memo(function MilestoneCard({
  item,
  reactionMap,
  onReact,
}: {
  item: MilestoneItem;
  reactionMap: Map<string, { count: number; mine: boolean }>;
  onReact: (emoji: Emoji, mine: boolean) => void;
}) {
  return (
    <View style={s.wrap}>
      <BlurView intensity={blur.cardSmall} tint="dark" style={s.blur}>
        <LinearGradient
          // 150deg ≈ this start/end pair on a roughly square card.
          colors={['rgba(250,17,79,0.18)', 'rgba(250,17,79,0.04)']}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={s.card}>
          <View style={s.top}>
            <Ring volume={FULL} difficulty={FULL} streak={FULL} size={40} stagger={70} />
            <View style={s.topText}>
              <Text style={s.label}>
                {item.ringsClosed ? 'RINGS CLOSED · HARD CLEARED' : 'HARD CLEARED'}
              </Text>
              <Text style={s.sentence}>
                {item.isMe ? 'You' : item.name} took {item.title}
              </Text>
            </View>
          </View>

          <View style={s.chipRow}>
            {EMOJIS.map((e) => {
              const r = reactionMap.get(`${item.solveId}|${e}`);
              const mine = r?.mine ?? false;
              const count = r?.count ?? 0;
              return (
                <Pressable
                  key={e}
                  onPress={() => onReact(e, mine)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityState={{ selected: mine }}
                  accessibilityLabel={`React ${e}${count ? `, ${count} so far` : ''}`}
                  style={({ pressed: p }) => [s.chip, mine && s.chipOn, p && pressed]}>
                  <Text style={s.chipEmoji}>{e}</Text>
                  {count > 0 && (
                    <Text style={[s.chipCount, tabular, mine && { color: colors.accentText }]}>
                      {count}
                    </Text>
                  )}
                </Pressable>
              );
            })}
            <Text style={s.time}>{timeAgo(item.ts)}</Text>
          </View>
        </LinearGradient>
      </BlurView>
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { marginVertical: 8 },
  blur: { borderRadius: 24, overflow: 'hidden' },
  card: {
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: 'rgba(250,17,79,0.32)',
    padding: 16,
    gap: 14,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  topText: { flex: 1, gap: 6 },
  label: { ...type.microLabel, color: colors.volume },
  sentence: { fontSize: 15, fontWeight: '600', lineHeight: 20, color: colors.text },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 52,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: colors.borderSmall,
    backgroundColor: colors.controlAlt,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: {
    backgroundColor: colors.accentSelectedFill,
    borderColor: colors.accentSelectedBorder,
  },
  chipEmoji: { fontSize: 15 },
  chipCount: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  time: { marginLeft: 'auto', fontSize: 12, color: colors.textQuaternary },
});

export default MilestoneCard;
