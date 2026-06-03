import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, space } from '@/theme';

interface Props {
  done: number;
  quota: number;
}

export function QuotaRing({ done, quota }: Props) {
  const pct = Math.min(1, done / Math.max(1, quota));
  return (
    <View style={s.box}>
      <Text style={s.label}>THIS WEEK</Text>
      <Text style={s.num}>
        {done}
        <Text style={s.sub}> / {quota}</Text>
      </Text>
      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${pct * 100}%` }]} />
      </View>
      <Text style={s.hint}>
        {done >= quota ? '🔥 quota hit — streak safe' : `${quota - done} to go this week`}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    backgroundColor: colors.card, padding: space(5), borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  label: { color: colors.textDim, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  num: { color: colors.text, fontSize: 56, fontWeight: '900', lineHeight: 60, marginTop: space(1) },
  sub: { color: colors.textDim, fontSize: 28, fontWeight: '600' },
  barBg: { height: 6, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden', marginTop: space(3) },
  barFill: { height: 6, backgroundColor: colors.accent },
  hint: { color: colors.textDim, fontSize: 13, marginTop: space(2) },
});
