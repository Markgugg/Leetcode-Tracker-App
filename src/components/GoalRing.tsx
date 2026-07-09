import { View, Text } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { colors } from '@/theme';

interface Props {
  done: number;
  goal: number;
  size?: number;
  stroke?: number;
  color?: string;
}

/** Circular weekly-goal progress ring with a done/goal center label. */
export function GoalRing({ done, goal, size = 84, stroke = 9, color = colors.accent }: Props) {
  const pct = Math.min(1, done / Math.max(1, goal));
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const complete = done >= goal && goal > 0;
  const ringColor = complete ? colors.success : color;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size}>
        <G rotation="-90" origin={`${cx},${cx}`}>
          <Circle cx={cx} cy={cx} r={r} fill="none" stroke={colors.border} strokeWidth={stroke} />
          {pct > 0 && (
            <Circle
              cx={cx} cy={cx} r={r} fill="none"
              stroke={ringColor} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${circ * pct} ${circ}`}
            />
          )}
        </G>
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontSize: size * 0.24, fontWeight: '800', lineHeight: size * 0.28 }}>
          {done}
          <Text style={{ color: colors.textDim, fontSize: size * 0.15, fontWeight: '600' }}>/{goal}</Text>
        </Text>
      </View>
    </View>
  );
}
