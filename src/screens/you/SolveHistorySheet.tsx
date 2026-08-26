/**
 * Solve History drill-down — the sheet behind the You tab's heatmap card.
 *
 * The heatmap answers "when"; this answers "what". It is the priced event feed
 * `computeTrophies` already emits (`TrophyEvent[]`, oldest first) read
 * backwards and capped, joined to the problems catalog for titles — so opening
 * it costs a render, not a request, and every `+N` on it is the same number
 * that paid into the total on the Arena card.
 *
 * A re-solve is shown, not hidden: it kept the streak alive even though it paid
 * nothing, and a list that silently dropped it would disagree with the heatmap
 * cell above it.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { TROPHY_GOLD, formatTrophies, type TrophyEvent } from '@/lib/trophies';
import { colors, difficultyColor, tabular, type } from '@/theme';

/** Newest-first cap. Long enough to scroll, short enough to stay a drill-down. */
export const HISTORY_LIMIT = 50;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const dayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** "Today" / "Yesterday" / "Tue 12 Aug", with the year once it stops being this one. */
function dateHeader(iso: string, today: string): string {
  const delta = dayNumber(today) - dayNumber(iso);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Yesterday';
  const d = new Date(`${iso}T00:00:00`);
  const stem = `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(`${today}T00:00:00`).getFullYear()
    ? stem
    : `${stem} ${d.getFullYear()}`;
}

/** `two-sum` → `Two Sum`, for a slug the catalog has not seeded a title for. */
function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

interface DayGroup {
  date: string;
  header: string;
  /** Trophies this day's shown rows paid. */
  paid: number;
  rows: TrophyEvent[];
}

export function SolveHistorySheet({
  visible,
  onClose,
  events,
  titleBySlug,
  today,
}: {
  visible: boolean;
  onClose: () => void;
  /** The priced feed from `useTrophies`, oldest first. */
  events: readonly TrophyEvent[];
  /** Catalog titles. A missing slug falls back to a de-slugged title. */
  titleBySlug: ReadonlyMap<string, string>;
  /** `YYYY-MM-DD`; injectable so "Today" is testable. */
  today: string;
}) {
  const { groups, shown, paid } = useMemo(() => {
    /* `events` is oldest first and the newest rows are the ones worth showing,
       so take from the end rather than sorting a copy of the whole history. */
    const recent = events.slice(Math.max(0, events.length - HISTORY_LIMIT)).reverse();
    const out: DayGroup[] = [];
    let sum = 0;
    for (const e of recent) {
      sum += e.amount;
      const last = out[out.length - 1];
      if (last && last.date === e.date) {
        last.rows.push(e);
        last.paid += e.amount;
      } else {
        out.push({ date: e.date, header: dateHeader(e.date, today), paid: e.amount, rows: [e] });
      }
    }
    return { groups: out, shown: recent.length, paid: sum };
  }, [events, today]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Solve History"
      subtitle={shown ? `Last ${shown}` : undefined}>
      {shown === 0 ? (
        <Text style={s.empty}>
          Nothing logged yet. Your first solve opens the day for +5 on top of
          what the problem itself is worth.
        </Text>
      ) : (
        <>
          <View style={s.summary}>
            <Text style={[s.summaryNumeral, { color: TROPHY_GOLD }]}>
              +{formatTrophies(paid)}
            </Text>
            <Text style={s.summaryCaption}>
              from the last {shown} {shown === 1 ? 'solve' : 'solves'}
            </Text>
          </View>

          {groups.map((g) => (
            <View key={g.date} style={s.group}>
              <View style={s.groupHead}>
                <Text style={s.groupTitle}>{g.header}</Text>
                <Text style={s.groupMeta}>
                  {g.rows.length} {g.rows.length === 1 ? 'solve' : 'solves'}
                  {g.paid ? ` · +${formatTrophies(g.paid)}` : ''}
                </Text>
              </View>

              {g.rows.map((e, i) => (
                <Row
                  key={`${e.date}|${e.slug}|${i}`}
                  event={e}
                  title={titleBySlug.get(e.slug) ?? titleFromSlug(e.slug)}
                  first={i === 0}
                />
              ))}
            </View>
          ))}

          <Text style={s.footnote}>
            Newest {shown} shown. A problem pays the first time you solve it;
            solving it again still counts as an active day, which is why a
            re-solve is listed at +0.
          </Text>
        </>
      )}
    </Sheet>
  );
}

function Row({
  event,
  title,
  first,
}: {
  event: TrophyEvent;
  title: string;
  first: boolean;
}) {
  const color = difficultyColor(event.difficulty);
  const paid = event.amount > 0;
  return (
    <View style={[s.row, !first && s.rowRule]}>
      <View style={[s.diffBar, { backgroundColor: color }]} />
      <View style={s.rowBody}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={s.rowMetaRow}>
          <Text style={[s.rowDifficulty, { color }]}>
            {event.difficulty.toUpperCase()}
          </Text>
          {event.firstOfDay ? <Text style={s.rowTag}>· First of the day +5</Text> : null}
          {event.multiplier > 1 ? (
            <Text style={s.rowTag}>· ×{event.multiplier} streak</Text>
          ) : null}
          {!paid ? <Text style={s.rowTag}>· Re-solve</Text> : null}
        </View>
      </View>
      <Text style={[s.rowAmount, paid ? { color: TROPHY_GOLD } : s.rowAmountZero]}>
        {paid ? `+${formatTrophies(event.amount)}` : '+0'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  empty: { ...type.bodySecondary, color: colors.textTertiary, paddingVertical: 12 },

  summary: { paddingBottom: 6 },
  summaryNumeral: { fontSize: 34, fontWeight: '700', letterSpacing: -1.2, ...tabular },
  summaryCaption: { ...type.caption, color: colors.textTertiary, marginTop: 1 },

  group: { paddingTop: 22 },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  groupTitle: { ...type.microLabel, color: colors.textSecondary, textTransform: 'uppercase' },
  groupMeta: { ...type.chartLabel, ...tabular, color: colors.textQuaternary },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  /* Hairlines between rows, not around them — nothing on a sheet is boxed. */
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  diffBar: { width: 3, alignSelf: 'stretch', borderRadius: 2, minHeight: 30 },
  rowBody: { flex: 1 },
  rowTitle: { ...type.bodyRow, color: colors.text, letterSpacing: -0.2 },
  rowMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'wrap' },
  rowDifficulty: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  rowTag: { fontSize: 10.5, fontWeight: '500', color: colors.textQuaternary },
  rowAmount: { fontSize: 17, fontWeight: '700', letterSpacing: -0.4, ...tabular },
  rowAmountZero: { color: colors.textQuaternary },

  footnote: { ...type.bodySecondary, color: colors.textTertiary, marginTop: 24 },
});

export default SolveHistorySheet;
