/**
 * Composer (§3.8) — glass bar, `rgba(120,120,128,.26)` radius-22 field, 38px
 * accent send button.
 *
 * The field is disabled while a send is in flight and while the optimistic
 * queue is at its cap; both states are visible, not silent, so a burst of taps
 * can't stack up an unbounded queue of unsent messages.
 */

import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

import { blur, colors, pressed, radius } from '@/theme';
import { MAX_MESSAGE_LENGTH } from './useCrewChat';
import { H } from './parts';

export function Composer({
  value,
  onChangeText,
  onSend,
  sending,
  capReason,
  bottomInset,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSend: () => void;
  sending: boolean;
  /** `none` unless the optimistic queue is full; see `useCrewChat`. */
  capReason: 'none' | 'inflight' | 'failed';
  bottomInset: number;
}) {
  const atCap = capReason !== 'none';
  const locked = sending || atCap;
  const canSend = !!value.trim() && !locked;
  const near = value.length > MAX_MESSAGE_LENGTH - 60;

  return (
    <BlurView intensity={blur.tabBar} tint="dark" style={s.blur}>
      <View style={[s.bar, { paddingBottom: bottomInset }]}>
        {atCap && (
          <Text style={s.notice}>
            {capReason === 'failed'
              ? 'Messages above didn’t send — tap one to retry, hold to discard.'
              : 'Still sending — hold on a second.'}
          </Text>
        )}
        <View style={s.row}>
          <View style={[s.field, locked && s.fieldOff]}>
            <TextInput
              style={s.input}
              placeholder={atCap ? 'Catching up…' : 'Message your crew'}
              placeholderTextColor={colors.textPlaceholder}
              value={value}
              onChangeText={onChangeText}
              onSubmitEditing={() => canSend && onSend()}
              editable={!locked}
              returnKeyType="send"
              blurOnSubmit={false}
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
              accessibilityLabel="Message your crew"
            />
            {near && (
              <Text style={s.counter}>{MAX_MESSAGE_LENGTH - value.length}</Text>
            )}
          </View>

          <Pressable
            onPress={onSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={({ pressed: p }) => [s.send, !canSend && s.sendOff, p && canSend && pressed]}>
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="arrow-up" size={18} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </View>
    </BlurView>
  );
}

const s = StyleSheet.create({
  blur: { borderTopWidth: 0.5, borderTopColor: colors.hairline },
  bar: { paddingHorizontal: H, paddingTop: 8, backgroundColor: colors.tabBar },
  notice: {
    fontSize: 12,
    color: colors.textTertiary,
    marginBottom: 6,
    marginLeft: 6,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: colors.controlAlt26,
    borderRadius: radius.input,
    borderWidth: 0.5,
    borderColor: colors.borderSmall,
    paddingLeft: 16,
    paddingRight: 12,
  },
  fieldOff: { opacity: 0.55 },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15.5,
    lineHeight: 20,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
  },
  counter: {
    fontSize: 11,
    color: colors.textQuaternary,
    marginBottom: 12,
    marginLeft: 6,
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 1,
  },
  sendOff: { backgroundColor: colors.controlAlt, opacity: 0.7 },
});
