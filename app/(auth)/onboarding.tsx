import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { BlurView } from 'expo-blur';
import Svg, { Circle, Path } from 'react-native-svg';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { registerForPushNotifications } from '@/lib/push';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { GlassCard } from '@/components/GlassCard';
import { Segmented } from '@/components/Segmented';
import {
  EASE,
  clamp,
  colors,
  deriveGoals,
  duration,
  pressed,
  radius,
  tabular,
  type,
} from '@/theme';

/**
 * §3.2–§3.5 — the four-step onboarding, plus the account step.
 *
 * Order matters: the password wall is LAST. Steps 1–4 run with no session at
 * all (the root layout allows any `(auth)` route while signed out), so the
 * LeetCode import, the goal and the crew choice are collected first and
 * committed once the account exists.
 *
 * Every step is skippable. `step` is persisted so a killed app resumes.
 */

const STORAGE_KEY = 'leetai.onboarding.v2';
const TOTAL_STEPS = 4; // the account step is not counted in "N of 4"

type StepIndex = 0 | 1 | 2 | 3 | 4;

type PendingCrew =
  | { kind: 'create' }
  | { kind: 'join' }
  | { kind: 'open'; groupId: string; name: string }
  | null;

interface Persisted {
  step: StepIndex;
  lcName: string;
  goal: number;
  pendingCrew: PendingCrew;
  wantsPush: boolean;
}

/* ------------------------------------------------------------------ */
/* LeetCode import                                                     */
/* ------------------------------------------------------------------ */

const LC_QUERY = `query onboardingUser($username: String!) {
  matchedUser(username: $username) {
    username
    submitStatsGlobal { acSubmissionNum { difficulty count } }
    userCalendar { submissionCalendar }
  }
}`;

export interface LcImport {
  username: string;
  total: number;
  easy: number;
  medium: number;
  hard: number;
  /** Last 14 days of accepted-submission counts, oldest first. */
  spark: number[];
}

function last14FromCalendar(raw: unknown): number[] {
  const out = new Array(14).fill(0) as number[];
  if (typeof raw !== 'string') return out;
  let map: Record<string, number>;
  try {
    map = JSON.parse(raw) as Record<string, number>;
  } catch {
    return out;
  }
  const DAY = 86400;
  const todayUtc = Math.floor(Date.now() / 1000 / DAY) * DAY;
  for (let i = 0; i < 14; i++) {
    const ts = todayUtc - (13 - i) * DAY;
    out[i] = Number(map[String(ts)] ?? 0);
  }
  return out;
}

/** The existing `matchedUser` check, widened to also bring back the import. */
async function fetchLcUser(username: string): Promise<LcImport | null> {
  const res = await fetch('https://leetcode.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Referer: `https://leetcode.com/${username}/`,
      'User-Agent': 'Mozilla/5.0 Grind/0.1',
    },
    body: JSON.stringify({ query: LC_QUERY, variables: { username } }),
  });
  if (!res.ok) throw new Error('LeetCode unreachable');
  const json = (await res.json()) as any;
  const user = json?.data?.matchedUser;
  if (!user) return null;

  const nums: { difficulty: string; count: number }[] =
    user.submitStatsGlobal?.acSubmissionNum ?? [];
  const pick = (d: string) => Number(nums.find((n) => n.difficulty === d)?.count ?? 0);

  return {
    username: user.username ?? username,
    total: pick('All'),
    easy: pick('Easy'),
    medium: pick('Medium'),
    hard: pick('Hard'),
    spark: last14FromCalendar(user.userCalendar?.submissionCalendar),
  };
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<StepIndex>(0);

  const [lcName, setLcName] = useState('');
  const [lcImport, setLcImport] = useState<LcImport | null>(null);
  const [lcChecking, setLcChecking] = useState(false);
  const [lcError, setLcError] = useState<string | null>(null);

  // §3.3 gotcha: the goal is a single source of truth in local state. There is
  // deliberately no prop/config default that could shadow it.
  const [goal, setGoal] = useState(10);

  const [pendingCrew, setPendingCrew] = useState<PendingCrew>(null);
  const [wantsPush, setWantsPush] = useState(false);

  /* ---- persistence ------------------------------------------------ */

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        try {
          const p = JSON.parse(raw) as Partial<Persisted>;
          if (typeof p.step === 'number') setStep(Math.min(4, Math.max(0, p.step)) as StepIndex);
          if (typeof p.lcName === 'string') setLcName(p.lcName);
          if (typeof p.goal === 'number') setGoal(clamp(p.goal, 3, 21));
          if (p.pendingCrew !== undefined) setPendingCrew(p.pendingCrew ?? null);
          if (typeof p.wantsPush === 'boolean') setWantsPush(p.wantsPush);
        } catch {
          /* corrupt payload — start clean */
        }
      })
      .finally(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const payload: Persisted = { step, lcName, goal, pendingCrew, wantsPush };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload)).catch(() => {});
  }, [hydrated, step, lcName, goal, pendingCrew, wantsPush]);

  /* ---- debounced LeetCode check (§3.2, ~600ms, no Verify button) --- */

  const seq = useRef(0);

  useEffect(() => {
    const handle = lcName.trim();
    const mine = ++seq.current;

    setLcError(null);
    if (handle.length < 2) {
      setLcImport(null);
      setLcChecking(false);
      return;
    }
    if (lcImport && lcImport.username.toLowerCase() === handle.toLowerCase()) return;

    setLcChecking(true);
    const t = setTimeout(async () => {
      try {
        const result = await fetchLcUser(handle);
        if (seq.current !== mine) return;
        setLcImport(result);
        if (!result) setLcError('No LeetCode account with that handle.');
      } catch {
        if (seq.current !== mine) return;
        setLcImport(null);
        setLcError('Could not reach LeetCode. Check your connection.');
      } finally {
        if (seq.current === mine) setLcChecking(false);
      }
    }, 600);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lcName]);

  /* ---- navigation -------------------------------------------------- */

  const next = useCallback(() => setStep((v) => Math.min(4, v + 1) as StepIndex), []);

  const back = useCallback(() => {
    setStep((v) => {
      if (v === 0) {
        router.replace('/sign-in');
        return v;
      }
      return (v - 1) as StepIndex;
    });
  }, [router]);

  if (!hydrated) {
    return (
      <View style={[s.root, s.center]}>
        <AmbientBackdrop />
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      <AmbientBackdrop />
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[s.flex, { paddingTop: insets.top + 6 }]}>
          <StepHeader step={step} onBack={back} />

          {step === 0 && (
            <ConnectStep
              value={lcName}
              onChange={setLcName}
              checking={lcChecking}
              result={lcImport}
              error={lcError}
              onContinue={next}
              onSkip={() => {
                setLcName('');
                setLcImport(null);
                next();
              }}
              bottomInset={insets.bottom}
            />
          )}

          {step === 1 && (
            <GoalStep goal={goal} setGoal={setGoal} onContinue={next} bottomInset={insets.bottom} />
          )}

          {step === 2 && (
            <CrewStep
              hasSession={!!session}
              onPick={(c) => {
                setPendingCrew(c);
                next();
              }}
              onSolo={() => {
                setPendingCrew(null);
                next();
              }}
              bottomInset={insets.bottom}
            />
          )}

          {step === 3 && (
            <NotificationsStep
              onAllow={() => setWantsPush(true)}
              onContinue={next}
              bottomInset={insets.bottom}
            />
          )}

          {step === 4 && (
            <AccountStep
              lcName={lcImport?.username ?? lcName.trim()}
              goal={goal}
              pendingCrew={pendingCrew}
              wantsPush={wantsPush}
              bottomInset={insets.bottom}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Header — back button + 4px progress track + "N of 4"                */
/* ------------------------------------------------------------------ */

function StepHeader({ step, onBack }: { step: StepIndex; onBack: () => void }) {
  const [trackW, setTrackW] = useState(0);
  const w = useSharedValue(0);
  const target = Math.min(1, (step + 1) / TOTAL_STEPS);

  useEffect(() => {
    w.value = withTiming(target * trackW, {
      duration: 450,
      easing: Easing.bezier(...EASE.standard),
    });
  }, [target, trackW]);

  const fillStyle = useAnimatedStyle(() => ({ width: w.value }));

  return (
    <View style={s.header}>
      <Pressable onPress={onBack} hitSlop={10} style={({ pressed: p }) => [s.backBtn, p && pressed]}>
        <Svg width={16} height={16} viewBox="0 0 24 24">
          <Path
            d="M15 5l-7 7 7 7"
            stroke={colors.text}
            strokeWidth={2.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </Pressable>

      <View style={s.track} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
        <Animated.View style={[s.trackFill, fillStyle]} />
      </View>

      <Text style={s.stepCount}>
        {Math.min(step + 1, TOTAL_STEPS)} of {TOTAL_STEPS}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  // §3.2: two explicit states, never an interpolated middle style.
  const off = !!disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={off || busy}
      style={({ pressed: p }) => [
        s.pillBtn,
        off ? s.pillBtnOff : s.pillBtnOn,
        p && !off && pressed,
      ]}>
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={[type.buttonLabel, off ? s.pillLabelOff : s.pillLabelOn]}>{label}</Text>
      )}
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed: p }) => [s.pillBtn, s.pillBtnSecondary, p && pressed]}>
      <Text style={[type.buttonLabel, { color: colors.accentText }]}>{label}</Text>
    </Pressable>
  );
}

function OutlineButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed: p }) => [s.pillBtn, s.pillBtnOutline, p && pressed]}>
      <Text style={[type.buttonLabel, { color: colors.accentText }]}>{label}</Text>
    </Pressable>
  );
}

function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed: p }) => [s.textBtn, p && pressed]}>
      <Text style={s.textBtnLabel}>{label}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Step 1 — Connect LeetCode                                           */
/* ------------------------------------------------------------------ */

function ConnectStep({
  value,
  onChange,
  checking,
  result,
  error,
  onContinue,
  onSkip,
  bottomInset,
}: {
  value: string;
  onChange: (v: string) => void;
  checking: boolean;
  result: LcImport | null;
  error: string | null;
  onContinue: () => void;
  onSkip: () => void;
  bottomInset: number;
}) {
  return (
    <View style={s.stepBody}>
      <ScrollView
        contentContainerStyle={s.stepScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Connect LeetCode</Text>
        <Text style={s.body}>
          We read your public solve history, so you never log a problem by hand.
        </Text>

        <GlassCard variant="small" radius={radius.input} padding={0} style={s.inputCard}>
          <View style={s.inputRow}>
            <Text style={s.inputPrefix}>leetcode.com/u/</Text>
            <TextInput
              style={s.handleInput}
              value={value}
              onChangeText={onChange}
              placeholder="handle"
              placeholderTextColor={colors.textPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="done"
            />
            {checking ? (
              <View style={s.checkSlot}>
                <ActivityIndicator color={colors.textTertiary} />
              </View>
            ) : result ? (
              <PopCheck />
            ) : (
              <View style={s.checkSlot} />
            )}
          </View>
        </GlassCard>

        {error && !checking ? (
          <Animated.Text entering={FadeIn.duration(200)} style={s.errorText}>
            {error}
          </Animated.Text>
        ) : null}

        {result ? (
          <Animated.View entering={FadeInDown.duration(duration.fadeUp)}>
            <View style={s.foundRow}>
              <View style={s.foundDot} />
              <Text style={s.foundText}>Found — {result.total} problems solved</Text>
            </View>

            <GlassCard variant="small" radius={24} padding={18}>
              <Text style={s.microLabel}>YOUR HISTORY</Text>
              <Sparkline values={result.spark} />
              <View style={s.hairline} />
              <View style={s.diffRow}>
                <DiffCol label="Easy" value={result.easy} color={colors.easy} />
                <DiffCol label="Medium" value={result.medium} color={colors.medium} />
                <DiffCol label="Hard" value={result.hard} color={colors.hard} />
              </View>
            </GlassCard>
          </Animated.View>
        ) : null}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: bottomInset + 16 }]}>
        <PrimaryButton label="Continue" onPress={onContinue} disabled={!result} />
        {/* Skipping must be allowed — the old hard gate on a verified handle is gone. */}
        <TextButton label="Skip for now" onPress={onSkip} />
      </View>
    </View>
  );
}

/** §1 `pop` — scale .6 → 1.12 → 1 + opacity, 420ms. */
function PopCheck() {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.bezier(...EASE.standard);
    scale.value = withSequence(
      withTiming(1.12, { duration: duration.pop * 0.55, easing: ease }),
      withTiming(1, { duration: duration.pop * 0.45, easing: ease }),
    );
    opacity.value = withTiming(1, { duration: duration.pop * 0.4 });
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[s.checkCircle, style]}>
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path
          d="M5 12.5l4.5 4.5L19 7"
          stroke="#0A1400"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

/** 14-bar sparkline, 74px tall, 5px gap, `growUp` entry (§3.2). */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <View style={s.spark}>
      {values.map((v, i) => (
        <SparkBar key={i} ratio={v / max} index={i} />
      ))}
    </View>
  );
}

function SparkBar({ ratio, index }: { ratio: number; index: number }) {
  const h = useSharedValue(0);
  const target = Math.max(0.08, ratio) * 74;

  useEffect(() => {
    h.value = withDelay(
      index * 18,
      withTiming(target, { duration: duration.growUp, easing: Easing.bezier(...EASE.standard) }),
    );
  }, [target, index]);

  const style = useAnimatedStyle(() => ({ height: h.value }));
  // Three opacity levels by value — §3.2.
  const opacity = ratio >= 0.66 ? 1 : ratio >= 0.33 ? 0.6 : 0.32;

  return (
    <View style={s.sparkSlot}>
      <Animated.View style={[s.sparkBar, { opacity }, style]} />
    </View>
  );
}

function DiffCol({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={s.diffCol}>
      <Text style={[s.diffValue, { color }, tabular]}>{value}</Text>
      <Text style={s.diffLabel}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Step 2 — Weekly Volume Goal                                         */
/* ------------------------------------------------------------------ */

const INTENSITY = [
  { label: 'Lightly', value: 'lightly' as const, goal: 5 },
  { label: 'Moderately', value: 'moderately' as const, goal: 10 },
  { label: 'Highly', value: 'highly' as const, goal: 17 },
];

type Intensity = (typeof INTENSITY)[number]['value'];

function intensityFor(goal: number): Intensity {
  if (goal <= 6) return 'lightly';
  if (goal <= 13) return 'moderately';
  return 'highly';
}

function GoalStep({
  goal,
  setGoal,
  onContinue,
  bottomInset,
}: {
  goal: number;
  setGoal: (v: number) => void;
  onContinue: () => void;
  bottomInset: number;
}) {
  // Derived, never stored separately.
  const derived = useMemo(() => deriveGoals(goal), [goal]);

  return (
    <View style={s.stepBody}>
      <ScrollView
        contentContainerStyle={s.stepScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={s.titleGoal}>Weekly Volume Goal</Text>
        <Text style={s.body}>
          Set a goal based on how much you solve now, or how much you'd like to.
        </Text>

        <Segmented
          options={INTENSITY.map((i) => ({ label: i.label, value: i.value }))}
          value={intensityFor(goal)}
          onChange={(v) => setGoal(INTENSITY.find((i) => i.value === v)?.goal ?? 10)}
          style={s.segmented}
        />

        <View style={s.stepper}>
          <StepperButton glyph="minus" onPress={() => setGoal(Math.max(3, goal - 1))} />
          <View style={s.stepperCenter}>
            <Text style={[s.goalNumeral, tabular]}>{goal}</Text>
            <Text style={s.goalUnit}>PROBLEMS/WEEK</Text>
          </View>
          <StepperButton glyph="plus" onPress={() => setGoal(Math.min(21, goal + 1))} />
        </View>

        <GlassCard variant="small" radius={24} padding={0} contentStyle={s.derivedCard}>
          <DerivedRow
            dot={colors.difficulty}
            text={`At least ${derived.difficulty} medium${derived.difficulty === 1 ? '' : 's'}`}
            right="Difficulty ring"
          />
          <View style={s.hairlineInset} />
          <DerivedRow
            dot={colors.streak}
            text={`Solve on ${derived.streak}+ days`}
            right="Streak ring"
          />
        </GlassCard>

        <Text style={s.footnote}>Rings reset Monday. Adjust any time.</Text>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: bottomInset + 16 }]}>
        <SecondaryButton label="Set Weekly Goal" onPress={onContinue} />
      </View>
    </View>
  );
}

function StepperButton({ glyph, onPress }: { glyph: 'minus' | 'plus'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed: p }) => [s.stepperBtn, p && pressed]}>
      <Svg width={26} height={26} viewBox="0 0 24 24">
        <Path
          d={glyph === 'minus' ? 'M5 12h14' : 'M12 5v14M5 12h14'}
          stroke="#FFFFFF"
          strokeWidth={3.2}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}

function DerivedRow({ dot, text, right }: { dot: string; text: string; right: string }) {
  return (
    <View style={s.derivedRow}>
      <View style={[s.derivedDot, { backgroundColor: dot }]} />
      <Text style={s.derivedText}>{text}</Text>
      <Text style={s.derivedRight}>{right}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Step 3 — Find your crew                                             */
/* ------------------------------------------------------------------ */

interface OpenCrew {
  group_id: string;
  name: string;
  member_count: number;
  avg_points: number;
}

/**
 * The crew badge is chrome, not identity, so it uses the one neutral surface
 * the redesign keeps for that — rgba(120,120,128,.30) + a .5px hairline, the
 * same treatment as `src/components/Avatar.tsx`. It previously cycled the ring
 * hues (#A2F73D / #FF9F0A / #FA114F) as saturated fills, which re-introduced
 * exactly the pattern the Avatar rewrite removed: ring colours used as
 * identity, glowing on the true-black ground.
 */
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function CrewStep({
  hasSession,
  onPick,
  onSolo,
  bottomInset,
}: {
  hasSession: boolean;
  onPick: (c: PendingCrew) => void;
  onSolo: () => void;
  bottomInset: number;
}) {
  const router = useRouter();

  // `open_crews` (migration 0024) is granted to `authenticated` only, so the
  // list is empty for a signed-out user and the section simply doesn't render.
  const { data: openCrews = [] } = useQuery<OpenCrew[]>({
    queryKey: ['open-crews'],
    enabled: hasSession,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('open_crews')
        .select('group_id, name, member_count, avg_points')
        .limit(5);
      if (error) return [];
      return (data ?? []) as OpenCrew[];
    },
  });

  const goCreate = () => {
    if (hasSession) router.push('/group/create');
    else onPick({ kind: 'create' });
  };
  const goJoin = () => {
    if (hasSession) router.push('/group/join');
    else onPick({ kind: 'join' });
  };
  const joinOpen = async (c: OpenCrew) => {
    if (!hasSession) return onPick({ kind: 'open', groupId: c.group_id, name: c.name });
    await supabase.rpc('join_open_group', { p_group_id: c.group_id });
    onPick(null);
  };

  return (
    <View style={s.stepBody}>
      <ScrollView contentContainerStyle={s.stepScroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Find your crew</Text>
        <Text style={s.body}>
          People who grind alone quit in 11 days. People in a crew last 4 months.
        </Text>

        <ActionRow
          color={colors.difficulty}
          glyph="plus"
          title="Start a crew"
          subtitle="Invite up to 12 friends"
          onPress={goCreate}
        />
        <ActionRow
          color={colors.streak}
          glyph="hash"
          title="Join with a code"
          subtitle="Six characters from a friend"
          onPress={goJoin}
        />

        {openCrews.length > 0 ? (
          <>
            <Text style={[s.microLabel, s.sectionLabel]}>OPEN CREWS NEAR YOUR LEVEL</Text>
            <GlassCard variant="small" radius={24} padding={0} contentStyle={s.crewList}>
              {openCrews.map((c, i) => (
                <View key={c.group_id}>
                  {i > 0 ? <View style={s.hairlineInset} /> : null}
                  <View style={s.crewRow}>
                    <View style={s.crewAvatar}>
                      <Text style={s.crewInitials}>{initials(c.name)}</Text>
                    </View>
                    <View style={s.flex}>
                      <Text style={s.crewName}>{c.name}</Text>
                      <Text style={s.crewMeta}>
                        {c.member_count} members · {c.avg_points} avg pts
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => joinOpen(c)}
                      style={({ pressed: p }) => [s.joinChip, p && pressed]}>
                      <Text style={s.joinChipLabel}>Join</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </GlassCard>
          </>
        ) : null}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: bottomInset + 16 }]}>
        {/* Crew is optional. */}
        <TextButton label="Solo for now" onPress={onSolo} />
      </View>
    </View>
  );
}

function ActionRow({
  color,
  glyph,
  title,
  subtitle,
  onPress,
}: {
  color: string;
  glyph: 'plus' | 'hash';
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <GlassCard variant="small" radius={24} padding={18} style={s.actionRowCard} onPress={onPress}>
      <View style={s.actionRow}>
        <View style={[s.actionIcon, { backgroundColor: color }]}>
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Path
              d={glyph === 'plus' ? 'M12 5v14M5 12h14' : 'M6 9h13M5 15h13M10 4L8 20M17 4l-2 16'}
              stroke="#0A1400"
              strokeWidth={2.6}
              strokeLinecap="round"
              fill="none"
            />
          </Svg>
        </View>
        <View style={s.flex}>
          <Text style={s.actionTitle}>{title}</Text>
          <Text style={s.actionSub}>{subtitle}</Text>
        </View>
        <Svg width={15} height={15} viewBox="0 0 24 24">
          <Path
            d="M9 5l7 7-7 7"
            stroke="rgba(235,235,245,0.3)"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </Svg>
      </View>
    </GlassCard>
  );
}

/* ------------------------------------------------------------------ */
/* Step 4 — Notifications                                              */
/* ------------------------------------------------------------------ */

function NotificationsStep({
  onAllow,
  onContinue,
  bottomInset,
}: {
  onAllow: () => void;
  onContinue: () => void;
  bottomInset: number;
}) {
  const [asked, setAsked] = useState(false);

  const allow = async () => {
    setAsked(true);
    onAllow();
    // The real OS prompt fires here, right after the faux one — that ordering
    // is the whole point of §3.5. The Expo push token is registered once the
    // account exists (it needs a user id).
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      /* Expo Go / simulator — the token step later is a no-op anyway */
    }
    onContinue();
  };

  const deny = () => {
    setAsked(true);
    onContinue();
  };

  return (
    <View style={s.stepBody}>
      <ScrollView contentContainerStyle={s.stepScrollCenter} showsVerticalScrollIndicator={false}>
        <View style={s.fauxWrap}>
          {/* faux lock screen */}
          <BlurView intensity={20} tint="dark" style={s.lockScreen}>
            <View style={s.lockInner}>
              <Text style={s.lockClock}>9:41</Text>
              <View style={s.lockNotif}>
                <View style={s.lockAppIcon}>
                  <Svg width={22} height={22} viewBox="0 0 60 60">
                    <Circle
                      cx={30}
                      cy={30}
                      r={20}
                      stroke={colors.volume}
                      strokeWidth={6}
                      fill="none"
                      strokeDasharray="94 126"
                      strokeLinecap="round"
                    />
                    <Circle
                      cx={30}
                      cy={30}
                      r={11}
                      stroke={colors.difficulty}
                      strokeWidth={6}
                      fill="none"
                      strokeDasharray="45 69"
                      strokeLinecap="round"
                    />
                  </Svg>
                </View>
                <View style={s.flex}>
                  <View style={[s.lockBar, { width: '62%' }]} />
                  <View style={[s.lockBar, { width: '88%' }]} />
                  <View style={[s.lockBar, { width: '44%' }]} />
                </View>
              </View>
            </View>
          </BlurView>

          {/* the alert, overlapping */}
          <BlurView intensity={40} tint="dark" style={s.alert}>
            <View style={s.alertInner}>
              <View style={s.alertCopy}>
                <Text style={s.alertTitle}>
                  "LeetAI" Would Like to Send You Notifications
                </Text>
                <Text style={s.alertBody}>
                  Crew activity, your Sunday check-in, and a heads-up when your streak is at risk.
                </Text>
              </View>
              <View style={s.alertDivider} />
              <View style={s.alertActions}>
                <Pressable
                  onPress={deny}
                  disabled={asked}
                  style={({ pressed: p }) => [s.alertBtn, p && pressed]}>
                  <Text style={s.alertBtnLabel}>Don't Allow</Text>
                </Pressable>
                <View style={s.alertVDivider} />
                <Pressable
                  onPress={allow}
                  disabled={asked}
                  style={({ pressed: p }) => [s.alertBtn, p && pressed]}>
                  <Text style={[s.alertBtnLabel, s.alertBtnStrong]}>Allow</Text>
                </Pressable>
              </View>
            </View>
          </BlurView>
        </View>

        <Text style={s.fauxCaption}>
          Notifications help you close your rings, cheer on your crew, and keep a streak alive.
        </Text>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: bottomInset + 16 }]}>
        <OutlineButton label="Continue" onPress={onContinue} />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Step 5 — Account (credentials LAST)                                 */
/* ------------------------------------------------------------------ */

function AccountStep({
  lcName,
  goal,
  pendingCrew,
  wantsPush,
  bottomInset,
}: {
  lcName: string;
  goal: number;
  pendingCrew: PendingCrew;
  wantsPush: boolean;
  bottomInset: number;
}) {
  const router = useRouter();
  const { session } = useAuth();
  const hasSession = !!session;

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const handleOk = /^[a-z0-9_]{2,20}$/.test(username.trim().toLowerCase());
  const ready = handleOk && (hasSession || (email.trim().length > 3 && password.length >= 6));

  /** Everything collected in steps 1–4 is committed here, in one go. */
  const finish = async (userId: string) => {
    await supabase.from('profiles').upsert({
      id: userId,
      username: username.trim().toLowerCase(),
      leetcode_username: lcName || null,
    });

    // Personal ring goals (migration 0020). The RPC re-derives the other two.
    const { error: goalErr } = await supabase.rpc('set_volume_goal', { p_volume: goal });
    if (goalErr) {
      await supabase.from('profiles').update({ volume_goal: goal }).eq('id', userId);
    }

    if (wantsPush) await registerForPushNotifications(userId).catch(() => null);

    if (pendingCrew?.kind === 'open') {
      await supabase.rpc('join_open_group', { p_group_id: pendingCrew.groupId });
    }

    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});

    if (pendingCrew?.kind === 'create') router.replace('/group/create');
    else if (pendingCrew?.kind === 'join') router.replace('/group/join');
    else router.replace('/(tabs)');
  };

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    if (hasSession && session) {
      await finish(session.user.id);
      setBusy(false);
      return;
    }

    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    if (!data.session || !data.user) {
      // Email confirmation is on — the profile is written on first sign-in.
      setBusy(false);
      setCheckEmail(true);
      return;
    }
    await finish(data.user.id);
    setBusy(false);
  };

  if (checkEmail) {
    return (
      <View style={[s.stepBody, s.center]}>
        <Text style={s.title}>Check your email</Text>
        <Text style={[s.body, s.centerText]}>
          Confirm your address, then sign in — your goal and LeetCode handle are saved on this
          device and applied automatically.
        </Text>
      </View>
    );
  }

  return (
    <View style={s.stepBody}>
      <ScrollView
        contentContainerStyle={s.stepScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={s.title}>{hasSession ? 'Pick a username' : 'Create your account'}</Text>
        <Text style={s.body}>
          {hasSession
            ? 'This is what your crew will see.'
            : 'Last step. Your rings, goal and crew are already set.'}
        </Text>

        <GlassCard variant="small" radius={radius.input} padding={0} style={s.field}>
          <TextInput
            style={s.plainInput}
            value={username}
            onChangeText={(t) => { setUsername(t); setError(null); }}
            placeholder="username"
            placeholderTextColor={colors.textPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />
        </GlassCard>

        {!hasSession ? (
          <>
            <GlassCard variant="small" radius={radius.input} padding={0} style={s.field}>
              <TextInput
                style={s.plainInput}
                value={email}
                onChangeText={(t) => { setEmail(t); setError(null); }}
                placeholder="you@email.com"
                placeholderTextColor={colors.textPlaceholder}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
              />
            </GlassCard>
            <GlassCard variant="small" radius={radius.input} padding={0} style={s.field}>
              <TextInput
                style={s.plainInput}
                value={password}
                onChangeText={(t) => { setPassword(t); setError(null); }}
                placeholder="Password (6+ characters)"
                placeholderTextColor={colors.textPlaceholder}
                secureTextEntry
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={submit}
              />
            </GlassCard>
          </>
        ) : null}

        {username.length > 0 && !handleOk ? (
          <Text style={s.errorText}>2–20 characters: letters, numbers and underscores.</Text>
        ) : null}
        {error ? <Text style={s.errorText}>{error}</Text> : null}

        <GlassCard variant="small" radius={24} padding={0} contentStyle={s.derivedCard}>
          <DerivedRow dot={colors.volume} text={`${goal} problems a week`} right="Volume ring" />
          <View style={s.hairlineInset} />
          <DerivedRow
            dot={colors.difficulty}
            text={lcName ? `LeetCode: ${lcName}` : 'No LeetCode handle'}
            right={lcName ? 'Auto-sync on' : 'Add later'}
          />
        </GlassCard>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: bottomInset + 16 }]}>
        <PrimaryButton
          label={hasSession ? 'Finish' : 'Create Account'}
          onPress={submit}
          disabled={!ready}
          busy={busy}
        />
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  centerText: { textAlign: 'center' },

  /* header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 22,
    paddingBottom: 18,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.controlAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.controlAlt30,
    overflow: 'hidden',
  },
  trackFill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  stepCount: { fontSize: 13, fontWeight: '600', color: colors.textTertiary, ...tabular },

  /* step scaffolding */
  stepBody: { flex: 1 },
  stepScroll: { paddingHorizontal: 22, paddingBottom: 24 },
  stepScrollCenter: {
    paddingHorizontal: 22,
    paddingBottom: 24,
    flexGrow: 1,
    justifyContent: 'center',
  },
  title: { ...type.onboardingTitle, color: colors.text },
  titleGoal: { ...type.onboardingTitleGoal, color: colors.text },
  body: { ...type.body, color: colors.textSecondary, marginTop: 10 },
  microLabel: { ...type.microLabel, color: colors.textSecondary, textTransform: 'uppercase' },
  sectionLabel: { marginTop: 26, marginBottom: 10 },
  footnote: {
    ...type.bodySecondary,
    color: colors.textQuaternary,
    textAlign: 'center',
    marginTop: 18,
  },
  errorText: { ...type.bodySecondary, color: colors.hard, marginTop: 10 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginVertical: 14 },
  hairlineInset: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
    marginHorizontal: 18,
  },

  /* footer / buttons */
  footer: { paddingHorizontal: 22, paddingTop: 8 },
  pillBtn: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBtnOn: { backgroundColor: 'rgba(120,120,128,0.22)' },
  pillBtnOff: { backgroundColor: colors.controlAlt },
  pillBtnSecondary: { backgroundColor: colors.controlAlt30 },
  pillBtnOutline: { borderWidth: 0.5, borderColor: colors.borderOutline },
  pillLabelOn: { color: colors.accentText },
  pillLabelOff: { color: 'rgba(235,235,245,0.4)' },
  textBtn: { height: 54, alignItems: 'center', justifyContent: 'center' },
  textBtnLabel: { fontSize: 16, fontWeight: '400', color: colors.textTertiary },

  /* step 1 */
  inputCard: { marginTop: 26 },
  inputRow: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 18,
    paddingRight: 5,
    paddingVertical: 5,
  },
  inputPrefix: { fontSize: 16, fontWeight: '400', color: colors.textPlaceholder },
  handleInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  checkSlot: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  checkCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.difficulty,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foundRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 14 },
  foundDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.difficulty },
  foundText: { fontSize: 13.5, fontWeight: '500', color: colors.difficulty },
  spark: { height: 74, flexDirection: 'row', alignItems: 'flex-end', gap: 5, marginTop: 14 },
  sparkSlot: { flex: 1, height: 74, justifyContent: 'flex-end' },
  sparkBar: { width: '100%', borderRadius: 3, backgroundColor: colors.difficulty },
  diffRow: { flexDirection: 'row' },
  diffCol: { flex: 1 },
  diffValue: { fontSize: 27, fontWeight: '700', letterSpacing: -0.8 },
  diffLabel: { ...type.bodySecondary, color: colors.textSecondary, marginTop: 2 },

  /* step 2 */
  segmented: { marginTop: 26 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 52,
  },
  stepperBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.volume,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCenter: { alignItems: 'center' },
  goalNumeral: { ...type.goalNumeral, color: colors.text },
  goalUnit: { fontSize: 14, fontWeight: '700', color: colors.text, letterSpacing: 0.4 },
  derivedCard: { paddingVertical: 4, paddingHorizontal: 0 },
  derivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  derivedDot: { width: 9, height: 9, borderRadius: 5 },
  derivedText: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  derivedRight: { fontSize: 15, fontWeight: '400', color: colors.textTertiary },

  /* step 3 */
  actionRowCard: { marginTop: 16 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actionIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  actionSub: { ...type.bodySecondary, color: colors.textSecondary, marginTop: 2 },
  crewList: { paddingVertical: 4, paddingHorizontal: 0 },
  crewRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  crewAvatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.controlAlt30,
    borderWidth: 0.5,
    borderColor: colors.borderOutline,
  },
  crewInitials: { fontSize: 14, fontWeight: '600', color: colors.text, letterSpacing: 0.2 },
  crewName: { fontSize: 15.5, fontWeight: '600', color: colors.text },
  crewMeta: { fontSize: 12.5, fontWeight: '400', color: colors.textSecondary, marginTop: 2 },
  joinChip: {
    borderRadius: 16,
    backgroundColor: colors.controlAlt30,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  joinChipLabel: { fontSize: 13.5, fontWeight: '600', color: colors.accentText },

  /* step 4 */
  fauxWrap: { width: 266, alignSelf: 'center', marginBottom: 54 },
  lockScreen: { borderRadius: 30, overflow: 'hidden' },
  lockInner: {
    backgroundColor: 'rgba(44,44,46,0.40)',
    paddingTop: 34,
    paddingHorizontal: 14,
    paddingBottom: 92,
  },
  lockClock: {
    fontSize: 58,
    fontWeight: '200',
    letterSpacing: -2,
    color: 'rgba(235,235,245,0.22)',
    textAlign: 'center',
    marginBottom: 22,
  },
  lockNotif: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 10,
  },
  lockAppIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(235,235,245,0.22)',
    marginBottom: 5,
  },
  alert: {
    position: 'absolute',
    left: -6,
    right: -6,
    bottom: -14,
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 50,
    elevation: 24,
  },
  alertInner: { backgroundColor: 'rgba(58,58,60,0.62)' },
  alertCopy: { paddingHorizontal: 18, paddingTop: 20, paddingBottom: 18 },
  alertTitle: { fontSize: 17, fontWeight: '600', color: colors.text, textAlign: 'center' },
  alertBody: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  alertDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.18)' },
  alertActions: { flexDirection: 'row' },
  alertVDivider: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.18)' },
  alertBtn: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  alertBtnLabel: { fontSize: 17, fontWeight: '400', color: colors.accentText },
  alertBtnStrong: { fontWeight: '600' },
  fauxCaption: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
  },

  /* step 5 */
  field: { marginTop: 12 },
  plainInput: {
    minHeight: 60,
    paddingHorizontal: 18,
    paddingVertical: 18,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
});
