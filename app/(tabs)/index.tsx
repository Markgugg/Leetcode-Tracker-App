/**
 * Summary — the home tab (§3.6).
 *
 * Replaces the old social feed (`app/(tabs)/feed.tsx`, deleted): the app no
 * longer opens on other people, it opens on you, today, as three rings.
 *
 * Order: header · week strip · Activity Rings · Topic Coverage radar ·
 * Next up · Trends · Sharing. 20px h-padding, 120px bottom padding to clear
 * the floating tab bar.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { Avatar } from '@/components/Avatar';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/stores/auth';
import { EASE, colors, duration, spacing, type } from '@/theme';

import { ActivityRingsCard } from '@/screens/summary/ActivityRingsCard';
import { NextUpCard } from '@/screens/summary/NextUpCard';
import { RingDetailSheet } from '@/screens/summary/RingDetailSheet';
import { SharingSection } from '@/screens/summary/SharingSection';
import { TopicCoverageSheet } from '@/screens/summary/TopicCoverageSheet';
import { TopicRadarCard } from '@/screens/summary/TopicRadarCard';
import { TrendsCard } from '@/screens/summary/TrendsCard';
import { DAY_TARGETS, WeekStrip } from '@/screens/summary/WeekStrip';
import { useSummaryData } from '@/screens/summary/useSummaryData';

type SheetKind = null | 'ring' | 'topics';

export default function SummaryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const data = useSummaryData(userId);
  const { show, toastNode } = useToast();

  const [sheet, setSheet] = useState<SheetKind>(null);
  const [compare, setCompare] = useState(false);
  const [pickIndex, setPickIndex] = useState(0);

  const pick = data.picks.length ? data.picks[pickIndex % data.picks.length] : null;

  const dateLine = useMemo(
    () =>
      new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }),
    [],
  );

  /* fadeUp — 380ms, translateY 16→0, opacity 0→1 (§1) */
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withTiming(1, {
      duration: duration.fadeUp,
      easing: Easing.bezier(...EASE.standard),
    });
  }, []);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 16 }],
  }));

  const openProblem = () => {
    if (!pick) return;
    Linking.openURL(`https://leetcode.com/problems/${pick.problem.slug}/`).catch(() => {
      show('Could not open LeetCode');
    });
  };

  const reroll = () => {
    if (data.picks.length < 2) return;
    setPickIndex((i) => (i + 1) % data.picks.length);
    show('Picked a different problem');
  };

  return (
    <View style={s.root}>
      <AmbientBackdrop />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.content, { paddingTop: insets.top + 8 }]}
        refreshControl={
          <RefreshControl
            tintColor={colors.accentText}
            refreshing={data.isRefetching}
            onRefresh={data.refetch}
          />
        }>
        <Animated.View style={enterStyle}>
          {/* 1 — header */}
          <View style={s.header}>
            <View style={s.headerText}>
              <Text style={s.title}>Summary</Text>
              <Text style={s.date}>{dateLine}</Text>
            </View>
            <Pressable
              onPress={() => router.push('/you')}
              hitSlop={8}
              style={({ pressed: p }) => [s.avatarChip, p && { opacity: 0.55 }]}>
              <Avatar
                name={data.displayName || '?'}
                url={data.profile?.avatar_url ?? null}
                size={37}
              />
            </Pressable>
          </View>

          {/* 2 — week strip */}
          <WeekStrip
            days={data.weekDays}
            onDayPress={(d) =>
              show(
                d.isFuture
                  ? 'That day has not happened yet'
                  : `${d.solves} solved · ${d.medPlus} med+ · goal ${DAY_TARGETS.volume}`,
              )
            }
          />

          {/* 3 — Activity Rings */}
          <View style={s.card}>
            <ActivityRingsCard
              goals={data.goals}
              week={data.week}
              onOpenSheet={() => setSheet('ring')}
              onTipPress={openProblem}
            />
          </View>

          {/* 4 — Topic Coverage radar */}
          <View style={s.card}>
            <TopicRadarCard
              radar={data.radar}
              median={data.radarMedian}
              thinnest={data.thinnest}
              compare={compare}
              onToggleCompare={() => setCompare((c) => !c)}
              onOpenSheet={() => setSheet('topics')}
            />
          </View>

          {/* 5 — Next up */}
          <View style={s.card}>
            <NextUpCard pick={pick} onStart={openProblem} onReroll={reroll} />
          </View>

          {/* 6 — Trends */}
          <View style={s.card}>
            <TrendsCard rows={data.trends} />
          </View>

          {/* 7 — Sharing */}
          <View style={s.section}>
            <SharingSection
              crewName={data.crew.groupName}
              members={data.crew.members}
              onPressCrew={() => router.push('/crew')}
            />
          </View>
        </Animated.View>
      </ScrollView>

      <RingDetailSheet
        visible={sheet === 'ring'}
        onClose={() => setSheet(null)}
        weekNumber={data.weekNumber}
        goals={data.goals}
        week={data.week}
        days={data.weekDays}
        dayGoal={DAY_TARGETS.volume}
        onAdd={() => {
          setSheet(null);
          openProblem();
        }}
      />

      <TopicCoverageSheet
        visible={sheet === 'topics'}
        onClose={() => setSheet(null)}
        topicsByRange={data.topicsByRange}
        totalSolved={data.totalSolved}
        totalProblems={data.totalProblems}
      />

      {toastNode}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: spacing.screenH,
    paddingBottom: spacing.contentBottom,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerText: { flex: 1 },
  title: { ...type.largeTitle, color: colors.text },
  date: { fontSize: 15, fontWeight: '400', color: colors.textSecondary, marginTop: 2 },
  avatarChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.controlAlt30,
    borderWidth: 0.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  card: { marginTop: spacing.cardGap },
  section: { marginTop: spacing.sectionGap },
});
