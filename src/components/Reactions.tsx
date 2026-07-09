// Emoji reactions on chat messages and solves (reactions table, migration 0021).
// Usage: const rx = useReactions('message', ids, uid)
//        <ReactionChips data={rx.for(id)} onToggle={e => rx.toggle(id, e)} />

import { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { colors, radius, space } from '@/theme';

export const REACTION_EMOJI = ['🔥', '👑', '💀', '🎉'] as const;
export type ReactionEmoji = typeof REACTION_EMOJI[number];
export type TargetType = 'message' | 'solve';

export type ReactionSummary = Record<string, { count: number; mine: boolean }>;

type Row = { target_id: string; emoji: string; user_id: string };

export function useReactions(targetType: TargetType, targetIds: string[], userId: string) {
  const qc = useQueryClient();
  // Key on the id set so new messages/solves get picked up.
  const idKey = targetIds.length ? [...targetIds].sort().join(',') : '';

  const { data } = useQuery({
    queryKey: ['reactions', targetType, idKey],
    enabled: targetIds.length > 0,
    staleTime: 1000 * 30,
    queryFn: async () => {
      const { data } = await supabase
        .from('reactions')
        .select('target_id, emoji, user_id')
        .eq('target_type', targetType)
        .in('target_id', targetIds);
      return (data ?? []) as Row[];
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`reactions-${targetType}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => {
        qc.invalidateQueries({ queryKey: ['reactions', targetType] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc, targetType]);

  const summaryFor = useCallback((targetId: string): ReactionSummary => {
    const out: ReactionSummary = {};
    for (const r of data ?? []) {
      if (r.target_id !== targetId) continue;
      const cur = out[r.emoji] ?? { count: 0, mine: false };
      cur.count += 1;
      if (r.user_id === userId) cur.mine = true;
      out[r.emoji] = cur;
    }
    return out;
  }, [data, userId]);

  const toggle = useCallback(async (targetId: string, emoji: ReactionEmoji) => {
    const mine = (data ?? []).some(r => r.target_id === targetId && r.emoji === emoji && r.user_id === userId);
    if (mine) {
      await supabase.from('reactions').delete()
        .eq('user_id', userId).eq('target_type', targetType)
        .eq('target_id', targetId).eq('emoji', emoji);
    } else {
      await supabase.from('reactions').insert({
        user_id: userId, target_type: targetType, target_id: targetId, emoji,
      });
    }
    qc.invalidateQueries({ queryKey: ['reactions', targetType] });
  }, [data, userId, targetType, qc]);

  return { for: summaryFor, toggle };
}

export function ReactionChips({
  data, onToggle, expanded, onExpand,
}: {
  data: ReactionSummary;
  onToggle: (emoji: ReactionEmoji) => void;
  /** When true, shows the full picker row instead of just active chips. */
  expanded: boolean;
  onExpand: () => void;
}) {
  const active = REACTION_EMOJI.filter(e => data[e]?.count);
  if (!expanded && active.length === 0) return null;
  const shown = expanded ? REACTION_EMOJI : active;
  return (
    <View style={s.row}>
      {shown.map(e => {
        const info = data[e];
        return (
          <Pressable
            key={e}
            style={[s.chip, info?.mine && s.chipMine]}
            onPress={() => onToggle(e)}
            hitSlop={4}
          >
            <Text style={s.emoji}>{e}</Text>
            {!!info?.count && <Text style={[s.count, info.mine && s.countMine]}>{info.count}</Text>}
          </Pressable>
        );
      })}
      {!expanded && (
        <Pressable style={s.chip} onPress={onExpand} hitSlop={4}>
          <Text style={s.plus}>+</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: space(1), marginTop: space(2), flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.bg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  chipMine: { borderColor: colors.accent + '70', backgroundColor: colors.accentLight },
  emoji: { fontSize: 12 },
  count: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  countMine: { color: colors.accentText },
  plus: { color: colors.textLight, fontSize: 13, fontWeight: '700', paddingHorizontal: 2 },
});
