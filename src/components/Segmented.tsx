import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, pressed, radius, shadow } from '@/theme';

export interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

export interface SegmentedProps<T extends string> {
  /** Either plain strings (used as both label and value) or {label,value}. */
  options: readonly (T | SegmentedOption<T>)[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * iOS-style segmented control per §3.3:
 * track rgba(120,120,128,.24) radius 11 padding 2; segments radius 9, 8px
 * v-padding, 14/600 white; selected rgba(120,120,128,.34) + a soft shadow.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  testID,
}: SegmentedProps<T>) {
  const items: SegmentedOption<T>[] = options.map((o) =>
    typeof o === 'string' ? ({ label: o, value: o } as SegmentedOption<T>) : o,
  );

  return (
    <View style={[s.track, style]} testID={testID}>
      {items.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={({ pressed: p }) => [
              s.segment,
              active && s.segmentActive,
              active && shadow.sm,
              p && !active && pressed,
            ]}>
            <Text style={[s.label, !active && s.labelInactive]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.control,
    borderRadius: radius.segmentTrack,
    padding: 2,
  },
  segment: {
    flex: 1,
    borderRadius: radius.segment,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: colors.controlSelected },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  labelInactive: { color: colors.textSecondary },
});

export default Segmented;
