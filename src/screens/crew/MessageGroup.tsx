/**
 * One collapsed run of messages (§3.8 bubbles).
 *
 * Consecutive messages from the same sender inside a minute render as one row:
 * one avatar, one name, one timestamp, and a tight stack of bubbles whose
 * inner corners shrink to 7 so the stack reads as a single utterance. That is
 * what keeps a spam burst from turning into forty avatars.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/Avatar';
import { colors, pressed, radius } from '@/theme';
import { clockTime } from './api';
import type { MsgGroupItem } from './types';

const TIGHT = 7;

export const MessageGroup = React.memo(function MessageGroup({
  item,
  onRetry,
  onDiscard,
}: {
  item: MsgGroupItem;
  onRetry: (tempId: string) => void;
  onDiscard: (tempId: string) => void;
}) {
  const { isMe, lines } = item;
  const last = lines[lines.length - 1];

  return (
    <View style={[s.row, isMe && s.rowMe]}>
      {!isMe ? (
        <Avatar name={item.name} url={item.avatar} size={28} style={s.avatar} />
      ) : null}

      <View style={[s.col, isMe && s.colMe]}>
        {!isMe && (
          <Text style={s.name} numberOfLines={1}>
            {item.name}
          </Text>
        )}

        {lines.map((line, i) => {
          const first = i === 0;
          const lastLine = i === lines.length - 1;
          const big = radius.bubble;
          const shape = isMe
            ? {
                borderTopLeftRadius: big,
                borderBottomLeftRadius: big,
                borderTopRightRadius: first ? big : TIGHT,
                borderBottomRightRadius: lastLine ? big : TIGHT,
              }
            : {
                borderTopRightRadius: big,
                borderBottomRightRadius: big,
                borderTopLeftRadius: first ? big : TIGHT,
                borderBottomLeftRadius: lastLine ? big : TIGHT,
              };
          const failed = line.status === 'failed';
          const bubble = (
            <View
              style={[
                s.bubble,
                shape,
                isMe ? s.bubbleMe : s.bubbleThem,
                line.status === 'sending' && s.bubbleSending,
                failed && s.bubbleFailed,
              ]}>
              <Text style={s.text}>{line.content}</Text>
            </View>
          );

          return (
            <View key={line.id} style={[s.line, isMe && s.lineMe, i > 0 && s.lineGap]}>
              {failed ? (
                <Pressable
                  onPress={() => onRetry(line.id)}
                  onLongPress={() => onDiscard(line.id)}
                  accessibilityRole="button"
                  accessibilityLabel="Message failed to send. Tap to retry, long press to discard."
                  style={({ pressed: p }) => [s.failRow, p && pressed]}>
                  <Ionicons name="alert-circle" size={15} color={colors.volume} />
                  {bubble}
                </Pressable>
              ) : (
                bubble
              )}
            </View>
          );
        })}

        <Text style={[s.meta, isMe && s.metaMe]}>
          {last?.status === 'failed'
            ? 'Not sent · tap to retry'
            : last?.status === 'sending'
              ? 'Sending…'
              : clockTime(item.ts)}
        </Text>
      </View>
    </View>
  );
});

/** Sticky-feeling day break between groups. */
export const DayDivider = React.memo(function DayDivider({ label }: { label: string }) {
  return (
    <View style={s.dayWrap}>
      <View style={s.dayLine} />
      <Text style={s.dayLabel}>{label}</Text>
      <View style={s.dayLine} />
    </View>
  );
});

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 5 },
  rowMe: { flexDirection: 'row-reverse' },
  avatar: { marginBottom: 18 },
  col: { flex: 1, alignItems: 'flex-start' },
  colMe: { alignItems: 'flex-end' },

  name: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textTertiary,
    marginBottom: 4,
    marginLeft: 4,
  },

  line: { maxWidth: '82%', alignSelf: 'flex-start' },
  lineMe: { alignSelf: 'flex-end' },
  lineGap: { marginTop: 2 },

  bubble: { paddingVertical: 9, paddingHorizontal: 15 },
  bubbleThem: { backgroundColor: colors.controlAlt30 },
  bubbleMe: { backgroundColor: colors.accent },
  bubbleSending: { opacity: 0.55 },
  bubbleFailed: { opacity: 0.5 },
  failRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  text: { fontSize: 15.5, lineHeight: 21, color: colors.text },

  meta: {
    fontSize: 11,
    color: colors.textQuaternary,
    marginTop: 4,
    marginLeft: 6,
  },
  metaMe: { marginLeft: 0, marginRight: 6 },

  dayWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 14,
    paddingHorizontal: 4,
  },
  dayLine: { flex: 1, height: 0.5, backgroundColor: colors.hairline },
  dayLabel: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.4, color: colors.textQuaternary },
});
