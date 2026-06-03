import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space } from '@/theme';

type Problem = { title: string; difficulty: 'easy' | 'medium' | 'hard'; tests: number };
type Opponent = { user_id: string; username: string; display_name: string | null };

const DIFF_COLOR = { easy: colors.easy, medium: colors.medium, hard: colors.hard };

function mmss(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Live dot ─────────────────────────────────────────────────────────────────

function LiveDot({ color = colors.hard }: { color?: string }) {
  const [on, setOn] = useState(true);
  useEffect(() => { const t = setInterval(() => setOn(v => !v), 600); return () => clearInterval(t); }, []);
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity: on ? 1 : 0.2 }} />;
}

// ─── Test grid ────────────────────────────────────────────────────────────────

function TestGrid({ passed, total, color }: { passed: number; total: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View key={i} style={[s.testCell, { backgroundColor: i < passed ? color : 'rgba(255,255,255,0.06)' }]} />
      ))}
    </View>
  );
}

// ─── Player lane ──────────────────────────────────────────────────────────────

function Lane({
  name, isMe, passed, total, status, accent, leading,
}: {
  name: string; isMe: boolean; passed: number; total: number;
  status: string; accent: string; leading: boolean;
}) {
  const pct = (passed / total) * 100;
  return (
    <View style={[s.lane, leading && { borderColor: accent, shadowColor: accent, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 4 }]}>
      <View style={s.laneTop}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), marginBottom: 3 }}>
            <Text style={[s.laneName, isMe && { color: colors.accent }]}>
              {isMe ? 'You' : name}
            </Text>
            {leading && (
              <View style={[s.leadingBadge, { backgroundColor: accent + '22' }]}>
                <Text style={[s.leadingText, { color: accent }]}>LEADING</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
            <LiveDot color={accent} />
            <Text style={s.laneStatus}>{status}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.laneTestNum, { color: accent }]}>
            {passed}<Text style={s.laneTestTotal}>/{total}</Text>
          </Text>
          <Text style={s.laneTestLabel}>TESTS</Text>
        </View>
      </View>

      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${pct}%`, backgroundColor: accent }]} />
      </View>
      <TestGrid passed={passed} total={total} color={accent} />
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BattleLive() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ opponentJson: string; problemJson: string }>();

  const opponent: Opponent = JSON.parse(params.opponentJson ?? '{}');
  const problem: Problem = JSON.parse(params.problemJson ?? '{}');
  const total = problem.tests ?? 12;
  const oppName = opponent.display_name ?? opponent.username ?? 'Opponent';

  const [myTests, setMyTests] = useState(0);
  const [oppTests, setOppTests] = useState(0);
  const [secs, setSecs] = useState(0);
  const secsRef = useRef(0);
  const [feed, setFeed] = useState<Array<{ text: string; color: string; id: number }>>([
    { text: `${oppName} opened the problem`, color: colors.textDim, id: 0 },
  ]);
  const [submitted, setSubmitted] = useState(false);
  const feedIdRef = useRef(1);
  const oppRef = useRef(oppTests);
  oppRef.current = oppTests;
  const myRef = useRef(myTests);
  myRef.current = myTests;

  const addFeed = (text: string, color: string) => {
    setFeed(f => [{ text, color, id: feedIdRef.current++ }, ...f].slice(0, 5));
  };

  // Timer
  useEffect(() => {
    const t = setInterval(() => setSecs(s => { secsRef.current = s + 1; return s + 1; }), 1000);
    return () => clearInterval(t);
  }, []);

  // Opponent auto-advances
  useEffect(() => {
    const t = setInterval(() => {
      setOppTests(v => {
        if (v >= total) return v;
        const nv = v + 1;
        addFeed(`${oppName} passed ${nv} test${nv > 1 ? 's' : ''}`, colors.hard);
        return nv;
      });
    }, 2800);
    return () => clearInterval(t);
  }, [oppName, total]);

  // End game when either player finishes
  useEffect(() => {
    if ((myTests >= total || oppTests >= total) && !submitted) {
      setSubmitted(true);
      setTimeout(() => {
        router.replace({
          pathname: '/battle/victory',
          params: {
            won: String(myTests >= oppTests),
            myTests: String(myTests),
            oppTests: String(oppTests),
            totalTests: String(total),
            elapsed: String(secsRef.current),
            oppName,
          },
        });
      }, 1200);
    }
  }, [myTests, oppTests, submitted]);

  const runTests = () => {
    setMyTests(v => {
      if (v >= total) return v;
      const nv = Math.min(total, v + 2 + Math.floor(Math.random() * 2));
      addFeed(`You passed ${nv} test${nv > 1 ? 's' : ''}`, colors.accent);
      return nv;
    });
  };

  const meLead = myTests > oppTests;
  const oppLead = oppTests > myTests;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.closeBtn} onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={16} color={colors.textDim} />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={[s.timerText, secs > 300 && { color: colors.hard }]}>{mmss(secs)}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
            <LiveDot color={colors.hard} />
            <Text style={s.liveLabel}>LIVE DUEL</Text>
            <Text style={s.watcherText}>· 6 watching</Text>
          </View>
        </View>
        <View style={{ width: 34 }} />
      </View>

      {/* Problem strip */}
      <View style={s.problemStrip}>
        <Text style={s.problemTitle} numberOfLines={1}>{problem.title}</Text>
        <View style={[s.diffPill, { backgroundColor: DIFF_COLOR[problem.difficulty] + '1F' }]}>
          <Text style={[s.diffLabel, { color: DIFF_COLOR[problem.difficulty] }]}>
            {problem.difficulty.charAt(0).toUpperCase() + problem.difficulty.slice(1)}
          </Text>
        </View>
        <Text style={s.ruleText}>most correct wins</Text>
      </View>

      {/* Lanes */}
      <View style={s.lanes}>
        <Lane isMe name="You" passed={myTests} total={total}
          status={myTests >= total ? 'all tests green' : 'running tests…'}
          accent={colors.accent} leading={meLead} />
        <View style={s.vsDivider}>
          <View style={s.vsDividerLine} />
          <Text style={s.vsText}>VS</Text>
          <View style={s.vsDividerLine} />
        </View>
        <Lane isMe={false} name={oppName} passed={oppTests} total={total}
          status={oppTests >= total ? 'submitting…' : 'typing…'}
          accent={colors.hard} leading={oppLead} />
      </View>

      {/* Feed */}
      <View style={s.feedWrap}>
        <Text style={s.feedLabel}>PLAY-BY-PLAY</Text>
        {feed.map((f, i) => (
          <View key={f.id} style={[s.feedRow, { opacity: Math.max(0.2, 1 - i * 0.2) }]}>
            <View style={[s.feedDot, { backgroundColor: f.color }]} />
            <Text style={s.feedText}>{f.text}</Text>
          </View>
        ))}
      </View>

      {/* Actions */}
      <View style={[s.actions, { paddingBottom: insets.bottom + space(4) }]}>
        <Pressable style={s.editorBtn}>
          <Text style={s.editorBtnText}>Editor</Text>
        </Pressable>
        <Pressable
          style={[s.runBtn, myTests >= total && { backgroundColor: colors.success }]}
          onPress={runTests}
          disabled={submitted}
        >
          {submitted
            ? <ActivityIndicator size="small" color="#fff" />
            : myTests >= total
              ? <><Ionicons name="checkmark" size={16} color="#fff" /><Text style={s.runBtnText}>Submit</Text></>
              : <><Ionicons name="flash" size={16} color="#fff" /><Text style={s.runBtnText}>Run tests</Text></>
          }
        </Pressable>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const PAD = space(4);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: PAD, paddingBottom: space(3) },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', gap: 4 },
  timerText: { color: colors.text, fontSize: 24, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: 1 },
  liveLabel: { color: colors.hard, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  watcherText: { color: colors.textDim, fontSize: 10 },

  problemStrip: { flexDirection: 'row', alignItems: 'center', gap: space(2), marginHorizontal: PAD, marginBottom: space(4), padding: space(3), backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  problemTitle: { color: colors.text, fontWeight: '800', fontSize: 14, flex: 1 },
  diffPill: { paddingHorizontal: space(2), paddingVertical: 2, borderRadius: 5 },
  diffLabel: { fontSize: 10, fontWeight: '700' },
  ruleText: { color: colors.textDim, fontSize: 10, fontWeight: '600' },

  // Lanes
  lanes: { paddingHorizontal: PAD, gap: 0 },
  lane: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, padding: space(4), gap: space(3) },
  laneTop: { flexDirection: 'row', alignItems: 'flex-start' },
  laneName: { color: colors.text, fontWeight: '800', fontSize: 14 },
  leadingBadge: { paddingHorizontal: space(2), paddingVertical: 1, borderRadius: 4 },
  leadingText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  laneStatus: { color: colors.textDim, fontSize: 11 },
  laneTestNum: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  laneTestTotal: { color: colors.textLight, fontSize: 12, fontWeight: '600' },
  laneTestLabel: { color: colors.textLight, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  barTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  testCell: { width: 14, height: 6, borderRadius: 2 },

  vsDivider: { flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2) },
  vsDividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  vsText: { color: colors.textLight, fontSize: 11, fontWeight: '900', fontStyle: 'italic' },

  // Feed
  feedWrap: { flex: 1, paddingHorizontal: PAD, paddingTop: space(4), gap: space(2) },
  feedLabel: { color: colors.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: space(1) },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  feedDot: { width: 5, height: 5, borderRadius: 2.5 },
  feedText: { color: colors.text, fontSize: 12 },

  // Actions
  actions: { flexDirection: 'row', gap: space(3), paddingHorizontal: PAD, paddingTop: space(3), borderTopWidth: 1, borderTopColor: colors.border },
  editorBtn: { flex: 1, paddingVertical: space(4), borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, alignItems: 'center' },
  editorBtnText: { color: colors.textDim, fontWeight: '700', fontSize: 14 },
  runBtn: { flex: 1.6, paddingVertical: space(4), borderRadius: radius.lg, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(2), shadowColor: colors.accent, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 5 },
  runBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
