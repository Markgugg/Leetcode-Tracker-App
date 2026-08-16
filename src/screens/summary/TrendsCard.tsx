import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { GlassCard } from '@/components/GlassCard';
import { colors, tabular, type } from '@/theme';
import { CardHeader, Hairline } from './parts';
import type { TrendRow } from './useSummaryData';

const fmt = (v: number, unit: 'count' | 'pct') =>
  unit === 'pct' ? `${Math.round(v)}%` : `${v}`;

/**
 * §3.6.6 — title + "vs 90-day average"; rows with a 30px circular tinted badge
 * holding an up/down arrow (`#A2F73D` up / `#FF9F0A` down, the down arrow is
 * the same glyph rotated 180°), label 15.5/500, current value 17/700 in the
 * trend color, and the 90-day average right-aligned in a 34px column.
 */
export function TrendsCard({ rows }: { rows: TrendRow[] }) {
  if (rows.length === 0) return null;

  return (
    <GlassCard>
      <CardHeader
        title="Trends"
        right={<Text style={s.vs}>vs 90-day average</Text>}
      />

      <View style={s.list}>
        {rows.map((r, i) => {
          const up = r.direction === 'up';
          const color = up ? colors.trendUp : colors.trendDown;
          return (
            <View key={r.metric}>
              {i > 0 ? <Hairline /> : null}
              <View style={s.row}>
                <View style={[s.badge, { backgroundColor: `${color}26` }]}>
                  <Svg
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    style={{ transform: [{ rotate: up ? '0deg' : '180deg' }] }}>
                    <Path
                      d="M12 19V5M5.5 11.5 12 5l6.5 6.5"
                      stroke={color}
                      strokeWidth={2.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </Svg>
                </View>

                <Text style={s.label} numberOfLines={1}>
                  {r.label}
                </Text>

                <Text style={[s.value, { color }]}>{fmt(r.current_value, r.unit)}</Text>
                <Text style={s.baseline}>{fmt(r.baseline_value, r.unit)}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </GlassCard>
  );
}

const s = StyleSheet.create({
  vs: { fontSize: 13, fontWeight: '400', color: colors.textTertiary },
  list: { marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  badge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  label: { ...type.bodyRow, color: colors.text, flex: 1 },
  value: { fontSize: 17, fontWeight: '700', ...tabular },
  baseline: {
    width: 34,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '400',
    color: colors.textQuaternary,
    ...tabular,
  },
});

export default TrendsCard;
