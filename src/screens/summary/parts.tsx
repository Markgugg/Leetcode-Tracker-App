import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, pressed, type } from '@/theme';

/** The 26px circular chevron that opens a card's sheet (§3.6.3). */
export function ChevronButton({
  onPress,
  size = 26,
  fill = colors.controlSelected,
}: {
  onPress?: () => void;
  size?: number;
  fill?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed: p }) => [
        s.chev,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: fill },
        p && pressed,
      ]}>
      <Svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24">
        <Path
          d="M9 5l7 7-7 7"
          stroke={colors.text}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}

/** "NEXT UP · PICKED FOR YOU" — 11.5/600/+0.6 uppercase with a colored dot. */
export function MicroLabel({
  text,
  dot,
  color = colors.textTertiary,
  style,
}: {
  text: string;
  dot?: string;
  color?: string;
  style?: any;
}) {
  return (
    <View style={[s.microRow, style]}>
      {dot ? <View style={[s.dot, { backgroundColor: dot }]} /> : null}
      <Text style={[type.microLabel, { color }]}>{text.toUpperCase()}</Text>
    </View>
  );
}

/** Card title row: title left, optional trailing node right. */
export function CardHeader({
  title,
  right,
  style,
}: {
  title: string;
  right?: React.ReactNode;
  style?: any;
}) {
  return (
    <View style={[s.headerRow, style]}>
      <Text style={s.cardTitle}>{title}</Text>
      {right}
    </View>
  );
}

/** A 6px rounded progress bar (ring sheet + topic sheet). */
export function Bar({
  progress,
  color,
  height = 6,
  track = 'rgba(120,120,128,0.30)',
}: {
  progress: number;
  color: string;
  height?: number;
  track?: string;
}) {
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track, overflow: 'hidden' }}>
      <View
        style={{
          width: `${p * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

export const Hairline = ({ style }: { style?: any }) => <View style={[s.hairline, style]} />;

const s = StyleSheet.create({
  chev: { alignItems: 'center', justifyContent: 'center' },
  microRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: { ...type.cardTitle, color: colors.text },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
});
