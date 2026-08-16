/**
 * Crew — design_handoff/README.md §3.8 (+ invite sheet §3.11).
 *
 * Replaces app/(tabs)/group.tsx and absorbs app/(tabs)/leaderboard.tsx.
 *  · Standings are always visible and ranked on **ring completion %**, not points.
 *  · The merged chat + milestone feed is kept; milestone cards now carry reactions
 *    (optimistic write to `solve_reactions`, then reconcile against
 *    `solve_reaction_counts`).
 *  · Multi-crew: reads every membership, opens on `profiles.active_group_id`,
 *    switcher lives in the overflow menu.
 *  · No Alert.alert — every message is the Toast component or inline state.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { Avatar } from '@/components/Avatar';
import { GlassCard } from '@/components/GlassCard';
import { Ring, ProgressRing } from '@/components/Ring';
import { Sheet } from '@/components/Sheet';
import { useToast } from '@/components/Toast';
import { clamp, colors, radius, shadow, stroke, tabular, type } from '@/theme';

const H = 20; // screen h-padding
const EMOJIS = ['🔥', '💀', '👏'] as const;
type Emoji = (typeof EMOJIS)[number];

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type Member = {
  user_id: string;
  role: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  volume: number;
  medPlus: number;
  days: number;
  volumeGoal: number;
  difficultyGoal: number;
  daysGoal: number;
  completion: number; // 0..1, mean of the three clamped ring fractions
};

type Crew = {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
};

type CrewData = {
  crews: Crew[];
  active: Crew;
  members: Member[];
};

type RawMessage = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

type RawSolve = {
  id: string;
  user_id: string;
  solved_at: string;
  points: number;
  problems: { title: string; difficulty: string } | null;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

type MsgItem = {
  kind: 'msg';
  id: string;
  userId: string;
  name: string;
  avatar: string | null;
  content: string;
  ts: string;
  isMe: boolean;
};
type MilestoneItem = {
  kind: 'milestone';
  id: string;
  solveId: string;
  userId: string;
  name: string;
  title: string;
  ts: string;
  isMe: boolean;
  ringsClosed: boolean;
};
type FeedItem = MsgItem | MilestoneItem;

type ReactionRow = { solve_id: string; emoji: string; count: number; reacted_by_me: boolean };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Monday of the current week as `YYYY-MM-DD` (matches date_trunc('week')). */
function mondayISO(d = new Date()) {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // Mon = 0
  x.setDate(x.getDate() - dow);
  x.setHours(0, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

function weekNumber(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(1, Math.floor(ms / (7 * 24 * 3600 * 1000)) + 1);
}

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const frac = (v: number, goal: number) => (goal > 0 ? clamp(v / goal) : 1);

/** The status line under a standings name — §3.8 / screenshot 12. */
function statusLine(m: Member) {
  const closed =
    m.volume >= m.volumeGoal && m.medPlus >= m.difficultyGoal && m.days >= m.daysGoal;
  if (closed) return `Rings closed · ${m.volume} solved`;
  if (m.volume === 0) return 'Quiet this week';
  const medBehind = m.difficultyGoal - m.medPlus;
  const dayBehind = m.daysGoal - m.days;
  if (medBehind > 0 && m.completion >= 0.5) {
    return `${medBehind} medium${medBehind === 1 ? '' : 's'} behind`;
  }
  if (dayBehind > 0 && m.completion < 0.4) return 'Streak at risk';
  if (m.completion >= 0.6) return 'On pace';
  const left = Math.max(0, m.volumeGoal - m.volume);
  return `${left} solve${left === 1 ? '' : 's'} to go`;
}

/* ------------------------------------------------------------------ */
/* Fetchers                                                            */
/* ------------------------------------------------------------------ */

async function fetchCrew(userId: string): Promise<CrewData | null> {
  const [{ data: memberships }, { data: me }] = await Promise.all([
    supabase
      .from('group_members')
      .select('group_id, groups(id, name, invite_code, created_at)')
      .eq('user_id', userId),
    supabase.from('profiles').select('active_group_id').eq('id', userId).maybeSingle(),
  ]);

  const crews: Crew[] = ((memberships ?? []) as any[])
    .map((r) => r.groups)
    .filter(Boolean)
    .map((g: any) => ({
      id: g.id,
      name: g.name,
      invite_code: g.invite_code,
      created_at: g.created_at,
    }));
  if (!crews.length) return null;

  const activeId = (me as any)?.active_group_id as string | null | undefined;
  const active = crews.find((c) => c.id === activeId) ?? crews[0];

  const { data: rows } = await supabase
    .from('group_members')
    .select(
      'user_id, role, profiles(username, display_name, avatar_url, volume_goal, difficulty_goal, days_goal)',
    )
    .eq('group_id', active.id);

  const memberIds = ((rows ?? []) as any[]).map((r) => r.user_id);

  const { data: stats } = memberIds.length
    ? await supabase
        .from('weekly_stats')
        .select('user_id, volume, med_plus, active_days, volume_goal, difficulty_goal, days_goal')
        .in('user_id', memberIds)
        .eq('week_start', mondayISO())
    : { data: [] as any[] };

  const byUser = new Map<string, any>();
  for (const r of (stats ?? []) as any[]) byUser.set(r.user_id, r);

  const members: Member[] = ((rows ?? []) as any[]).map((r) => {
    const p = r.profiles ?? {};
    const w = byUser.get(r.user_id);
    const volumeGoal = w?.volume_goal ?? p.volume_goal ?? 10;
    const difficultyGoal = w?.difficulty_goal ?? p.difficulty_goal ?? 3;
    const daysGoal = w?.days_goal ?? p.days_goal ?? 5;
    const volume = w?.volume ?? 0;
    const medPlus = w?.med_plus ?? 0;
    const days = w?.active_days ?? 0;
    const completion =
      (frac(volume, volumeGoal) + frac(medPlus, difficultyGoal) + frac(days, daysGoal)) / 3;
    return {
      user_id: r.user_id,
      role: r.role,
      username: p.username ?? '—',
      display_name: p.display_name ?? null,
      avatar_url: p.avatar_url ?? null,
      volume,
      medPlus,
      days,
      volumeGoal,
      difficultyGoal,
      daysGoal,
      completion,
    };
  });

  // ⚠️ Ranked on ring completion, not points (§3.8).
  members.sort((a, b) => b.completion - a.completion || b.volume - a.volume);

  return { crews, active, members };
}

async function fetchMessages(groupId: string): Promise<RawMessage[]> {
  const { data } = await supabase
    .from('group_messages')
    .select('id, user_id, content, created_at, profiles(username, display_name, avatar_url)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(100);
  return (data ?? []) as unknown as RawMessage[];
}

async function fetchMilestones(memberIds: string[]): Promise<RawSolve[]> {
  if (!memberIds.length) return [];
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from('solves')
    .select(
      'id, user_id, solved_at, points, problems(title, difficulty), profiles(username, display_name, avatar_url)',
    )
    .in('user_id', memberIds)
    .gte('solved_at', since)
    .order('solved_at', { ascending: false })
    .limit(50);
  return ((data ?? []) as unknown as RawSolve[]).filter(
    (s) => (s.problems?.difficulty ?? '').toLowerCase() === 'hard',
  );
}

async function fetchReactions(solveIds: string[]): Promise<ReactionRow[]> {
  if (!solveIds.length) return [];
  const { data } = await supabase
    .from('solve_reaction_counts')
    .select('solve_id, emoji, count, reacted_by_me')
    .in('solve_id', solveIds);
  return (data ?? []) as unknown as ReactionRow[];
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function CrewScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show, toastNode } = useToast(98);

  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const listRef = useRef<FlatList<FeedItem>>(null);
  const stickToBottom = useRef(true);

  const { data: crew, isLoading } = useQuery({
    queryKey: ['crew', userId],
    enabled: !!userId,
    queryFn: () => fetchCrew(userId),
  });

  const groupId = crew?.active.id;
  const memberIds = useMemo(() => crew?.members.map((m) => m.user_id) ?? [], [crew?.members]);

  const { data: messages } = useQuery({
    queryKey: ['crew-messages', groupId],
    enabled: !!groupId,
    queryFn: () => fetchMessages(groupId!),
    staleTime: 0,
  });

  const { data: milestones } = useQuery({
    queryKey: ['crew-milestones', groupId],
    enabled: !!groupId,
    queryFn: () => fetchMilestones(memberIds),
    staleTime: 60_000,
  });

  const solveIds = useMemo(() => (milestones ?? []).map((s) => s.id), [milestones]);

  const { data: reactions } = useQuery({
    queryKey: ['crew-reactions', groupId, solveIds.join(',')],
    enabled: !!groupId && solveIds.length > 0,
    queryFn: () => fetchReactions(solveIds),
    staleTime: 0,
  });

  /* — realtime — */
  useEffect(() => {
    if (!groupId) return;
    const ch = supabase
      .channel(`crew-${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${groupId}`,
        },
        () => qc.invalidateQueries({ queryKey: ['crew-messages', groupId] }),
      )
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solves' }, () => {
        qc.invalidateQueries({ queryKey: ['crew-milestones', groupId] });
        qc.invalidateQueries({ queryKey: ['crew', userId] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solve_reactions' }, () => {
        qc.invalidateQueries({ queryKey: ['crew-reactions'] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [groupId, userId, qc]);

  /* — merged feed, oldest → newest — */
  const feed = useMemo<FeedItem[]>(() => {
    const msgs: FeedItem[] = (messages ?? []).map((m) => ({
      kind: 'msg',
      id: m.id,
      userId: m.user_id,
      name: m.profiles?.display_name ?? m.profiles?.username ?? '?',
      avatar: m.profiles?.avatar_url ?? null,
      content: m.content,
      ts: m.created_at,
      isMe: m.user_id === userId,
    }));
    const stones: FeedItem[] = (milestones ?? []).map((s) => ({
      kind: 'milestone',
      id: `m-${s.id}`,
      solveId: s.id,
      userId: s.user_id,
      name: s.profiles?.display_name ?? s.profiles?.username ?? '?',
      title: s.problems?.title ?? 'a hard problem',
      ts: s.solved_at,
      isMe: s.user_id === userId,
      ringsClosed:
        (crew?.members.find((mm) => mm.user_id === s.user_id)?.completion ?? 0) >= 1,
    }));
    return [...msgs, ...stones].sort(
      (a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime(),
    );
  }, [messages, milestones, userId, crew?.members]);

  /* — reactions: keyed lookup built from the reconciled server rows — */
  const reactionMap = useMemo(() => {
    const m = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions ?? []) m.set(`${r.solve_id}|${r.emoji}`, { count: r.count, mine: r.reacted_by_me });
    return m;
  }, [reactions]);

  const reactionKey = ['crew-reactions', groupId, solveIds.join(',')];

  const toggleReaction = useMutation({
    mutationFn: async ({ solveId, emoji, mine }: { solveId: string; emoji: Emoji; mine: boolean }) => {
      if (mine) {
        const { error } = await supabase
          .from('solve_reactions')
          .delete()
          .eq('solve_id', solveId)
          .eq('user_id', userId)
          .eq('emoji', emoji);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('solve_reactions')
          .insert({ solve_id: solveId, user_id: userId, emoji });
        if (error) throw error;
      }
    },
    // optimistic …
    onMutate: async ({ solveId, emoji, mine }) => {
      await qc.cancelQueries({ queryKey: reactionKey });
      const prev = qc.getQueryData<ReactionRow[]>(reactionKey);
      qc.setQueryData<ReactionRow[]>(reactionKey, (old) => {
        const rows = [...(old ?? [])];
        const i = rows.findIndex((r) => r.solve_id === solveId && r.emoji === emoji);
        if (i === -1) return [...rows, { solve_id: solveId, emoji, count: 1, reacted_by_me: true }];
        const next = { ...rows[i], count: rows[i].count + (mine ? -1 : 1), reacted_by_me: !mine };
        if (next.count <= 0) rows.splice(i, 1);
        else rows[i] = next;
        return rows;
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(reactionKey, ctx.prev);
      show("Couldn't save that reaction");
    },
    // … then reconcile.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['crew-reactions'] });
    },
  });

  const sendMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text || !groupId || sending) return;
    setDraft('');
    setSending(true);
    stickToBottom.current = true;
    const { error } = await supabase
      .from('group_messages')
      .insert({ group_id: groupId, user_id: userId, content: text });
    setSending(false);
    if (error) {
      setDraft(text);
      show("Message didn't send — try again");
    } else {
      qc.invalidateQueries({ queryKey: ['crew-messages', groupId] });
    }
  }, [draft, groupId, sending, userId, qc, show]);

  const switchCrew = useCallback(
    async (id: string) => {
      setMenuOpen(false);
      const { error } = await supabase.rpc('set_active_group', { p_group_id: id });
      if (error) return show("Couldn't switch crew");
      await qc.invalidateQueries({ queryKey: ['crew', userId] });
    },
    [qc, userId, show],
  );

  const leaveCrew = useCallback(async () => {
    if (!crew) return;
    const { error } = await supabase.rpc('leave_group', { p_group_id: crew.active.id });
    setMenuOpen(false);
    setConfirmLeave(false);
    if (error) return show("Couldn't leave this crew");
    show(`Left ${crew.active.name}`);
    qc.invalidateQueries({ queryKey: ['crew', userId] });
  }, [crew, qc, userId, show]);

  const shareInvite = useCallback(async () => {
    if (!crew) return;
    try {
      await Share.share({
        message: `Join my crew "${crew.active.name}" on LeetAI. Invite code: ${crew.active.invite_code}`,
      });
      show('Invite ready to share');
    } catch {
      show("Couldn't open the share sheet");
    }
  }, [crew, show]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    stickToBottom.current =
      contentSize.height - (contentOffset.y + layoutMeasurement.height) < 80;
  };

  /* — loading / empty — */

  if (isLoading) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <AmbientBackdrop />
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      </View>
    );
  }

  if (!crew) {
    return (
      <View style={[s.root, { paddingTop: insets.top }]}>
        <AmbientBackdrop />
        <View style={[s.center, { paddingHorizontal: 34, gap: 10 }]}>
          <Text style={s.emptyTitle}>No crew yet</Text>
          <Text style={s.emptySub}>
            People who grind alone quit in 11 days. People in a crew last 4 months.
          </Text>
          <Link href="/group/create" asChild>
            <Pressable style={({ pressed }) => [s.primaryPill, pressed && s.tap]}>
              <Text style={s.primaryPillLabel}>Create a crew</Text>
            </Pressable>
          </Link>
          <Link href="/group/join" asChild>
            <Pressable style={({ pressed }) => [s.textBtn, pressed && s.tap]}>
              <Text style={s.textBtnLabel}>Join with an invite code</Text>
            </Pressable>
          </Link>
        </View>
        {toastNode}
      </View>
    );
  }

  const listHeader = (
    <View>
      <StandingsCard
        members={crew.members}
        userId={userId}
        onMemberPress={(uid) => router.push(`/profile/${uid}`)}
      />
      <View style={s.activityRow}>
        <Text style={s.activityLabel}>ACTIVITY</Text>
        <View style={s.activityLine} />
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      <AmbientBackdrop />

      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.crewName} numberOfLines={1}>
            {crew.active.name}
          </Text>
          <Text style={s.crewMeta}>
            {crew.members.length} member{crew.members.length === 1 ? '' : 's'} · week{' '}
            {weekNumber(crew.active.created_at)}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            setConfirmLeave(false);
            setMenuOpen(true);
          }}
          hitSlop={8}
          style={({ pressed }) => [s.overflowBtn, pressed && s.tap]}>
          <Ionicons name="ellipsis-vertical" size={16} color={colors.text} />
        </Pressable>
      </View>

      {/* ── Standings + merged feed ────────────────────────────── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={feed}
          keyExtractor={(i) => i.id}
          ListHeaderComponent={listHeader}
          contentContainerStyle={s.feedContent}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={80}
          onContentSizeChange={() => {
            if (stickToBottom.current) listRef.current?.scrollToEnd({ animated: false });
          }}
          ListEmptyComponent={
            <View style={s.emptyFeed}>
              <Text style={s.emptyFeedText}>Nothing yet. Say something.</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            if (item.kind === 'milestone') {
              return (
                <MilestoneCard
                  item={item}
                  reactionMap={reactionMap}
                  onReact={(emoji, mine) =>
                    toggleReaction.mutate({ solveId: item.solveId, emoji, mine })
                  }
                />
              );
            }
            const prev = feed[index - 1];
            const showName =
              !prev || prev.kind !== 'msg' || prev.userId !== item.userId;
            return <Bubble item={item} showName={showName} />;
          }}
        />

        {/* ── Composer ─────────────────────────────────────────── */}
        <View style={[s.composer, { paddingBottom: insets.bottom + 96 }]}>
          <TextInput
            style={s.input}
            placeholder="Message your crew…"
            placeholderTextColor={colors.textPlaceholder}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
            maxLength={500}
          />
          <Pressable
            onPress={sendMessage}
            disabled={!draft.trim() || sending}
            style={({ pressed }) => [
              s.sendBtn,
              (!draft.trim() || sending) && s.sendBtnOff,
              pressed && s.tap,
            ]}>
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="arrow-up" size={18} color="#fff" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* ── Overflow menu ─────────────────────────────────────── */}
      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={crew.active.name}>
        <GlassCard variant="small" radius={22} padding={0} contentStyle={{ paddingHorizontal: 18 }}>
          <MenuRow
            label="Invite to crew"
            icon="person-add-outline"
            onPress={() => {
              setMenuOpen(false);
              setInviteOpen(true);
            }}
          />
          {crew.crews.length > 1 && <View style={s.hairline} />}
          {crew.crews
            .filter((c) => c.id !== crew.active.id)
            .map((c, i) => (
              <React.Fragment key={c.id}>
                {i > 0 && <View style={s.hairline} />}
                <MenuRow
                  label={`Switch to ${c.name}`}
                  icon="swap-horizontal-outline"
                  onPress={() => switchCrew(c.id)}
                />
              </React.Fragment>
            ))}
          <View style={s.hairline} />
          <MenuRow
            label={confirmLeave ? 'Tap again to leave' : 'Leave crew'}
            icon="exit-outline"
            danger
            onPress={() => (confirmLeave ? leaveCrew() : setConfirmLeave(true))}
          />
        </GlassCard>
        <Text style={s.menuFoot}>
          {crew.crews.length} crew{crew.crews.length === 1 ? '' : 's'} · rankings use ring
          completion, not points.
        </Text>
      </Sheet>

      {/* ── Invite sheet (§3.11) ──────────────────────────────── */}
      <Sheet
        visible={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite"
        subtitle={crew.active.name}
        scroll={false}>
        <Text style={s.inviteCopy}>
          Share this code. They enter it once and land in {crew.active.name}.
        </Text>
        <View style={s.codeBox}>
          <Text style={s.codeText} selectable>
            {crew.active.invite_code}
          </Text>
        </View>
        <Pressable onPress={shareInvite} style={({ pressed }) => [s.primaryPill, pressed && s.tap]}>
          <Text style={s.primaryPillLabel}>Copy Invite Link</Text>
        </Pressable>
      </Sheet>

      {toastNode}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Standings (§3.8) — always visible, ranked on ring completion         */
/* ------------------------------------------------------------------ */

function StandingsCard({
  members,
  userId,
  onMemberPress,
}: {
  members: Member[];
  userId: string;
  onMemberPress: (uid: string) => void;
}) {
  return (
    <GlassCard radius={28} padding={0} contentStyle={{ paddingHorizontal: 16 }} style={{ marginBottom: 22 }}>
      {members.map((m, i) => {
        const isMe = m.user_id === userId;
        const rankColor = i === 0 ? colors.medium : isMe ? colors.text : colors.textTertiary;
        return (
          <React.Fragment key={m.user_id}>
            {i > 0 && <View style={s.hairline} />}
            <Pressable
              onPress={() => onMemberPress(m.user_id)}
              style={({ pressed }) => [s.standingRow, pressed && s.tap]}>
              <Text style={[s.rank, tabular, { color: rankColor }]}>{i + 1}</Text>

              <ProgressRing
                progress={frac(m.volume, m.volumeGoal)}
                size={40}
                r={25}
                strokeWidth={stroke.crewRing}
                color={colors.volume}
                trackColor={colors.volumeTrack}
                delay={i * 60}>
                <Avatar
                  name={m.display_name ?? m.username}
                  url={m.avatar_url}
                  size={29}
                />
              </ProgressRing>

              <View style={{ flex: 1 }}>
                <Text
                  style={[s.memberName, isMe && { color: colors.accentText }]}
                  numberOfLines={1}>
                  {isMe ? 'You' : m.display_name ?? m.username}
                </Text>
                <Text style={s.memberStatus} numberOfLines={1}>
                  {statusLine(m)}
                </Text>
              </View>

              <Text style={[s.completion, tabular]}>{Math.round(m.completion * 100)}%</Text>
            </Pressable>
          </React.Fragment>
        );
      })}
    </GlassCard>
  );
}

/* ------------------------------------------------------------------ */
/* Milestone card + reactions (§3.8) — this is the loop                 */
/* ------------------------------------------------------------------ */

function MilestoneCard({
  item,
  reactionMap,
  onReact,
}: {
  item: MilestoneItem;
  reactionMap: Map<string, { count: number; mine: boolean }>;
  onReact: (emoji: Emoji, mine: boolean) => void;
}) {
  return (
    <View style={s.milestoneWrap}>
      <LinearGradient
        colors={['rgba(250,17,79,0.18)', 'rgba(250,17,79,0.04)']}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={s.milestone}>
        <View style={s.milestoneTop}>
          <Ring
            volume={{ value: 1, goal: 1 }}
            difficulty={{ value: 1, goal: 1 }}
            streak={{ value: 1, goal: 1 }}
            size={40}
            stagger={70}
          />
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={s.milestoneLabel}>
              {item.ringsClosed ? 'RINGS CLOSED · HARD CLEARED' : 'HARD CLEARED'}
            </Text>
            <Text style={s.milestoneText}>
              {item.isMe ? 'You' : item.name} took {item.title}
            </Text>
          </View>
        </View>

        <View style={s.chipRow}>
          {EMOJIS.map((e) => {
            const r = reactionMap.get(`${item.solveId}|${e}`);
            const mine = r?.mine ?? false;
            const count = r?.count ?? 0;
            return (
              <Pressable
                key={e}
                onPress={() => onReact(e, mine)}
                hitSlop={4}
                style={({ pressed }) => [s.chip, mine && s.chipOn, pressed && s.tap]}>
                <Text style={s.chipEmoji}>{e}</Text>
                {count > 0 && (
                  <Text style={[s.chipCount, tabular, mine && { color: colors.accentText }]}>
                    {count}
                  </Text>
                )}
              </Pressable>
            );
          })}
          <Text style={s.milestoneTime}>{timeAgo(item.ts)}</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Chat bubble                                                         */
/* ------------------------------------------------------------------ */

function Bubble({ item, showName }: { item: MsgItem; showName: boolean }) {
  return (
    <View style={[s.bubbleRow, item.isMe && s.bubbleRowMe]}>
      {!item.isMe &&
        (showName ? (
          <Avatar name={item.name} url={item.avatar} size={28} />
        ) : (
          <View style={{ width: 28 }} />
        ))}
      <View style={[s.bubble, item.isMe ? s.bubbleMe : s.bubbleThem]}>
        <Text style={[s.bubbleText, item.isMe && { color: '#FFFFFF' }]}>{item.content}</Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Menu row                                                            */
/* ------------------------------------------------------------------ */

function MenuRow({
  label,
  icon,
  danger,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  danger?: boolean;
  onPress: () => void;
}) {
  const tint = danger ? colors.volume : colors.text;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.menuRow, pressed && s.tap]}>
      <Ionicons name={icon} size={17} color={tint} />
      <Text style={[s.menuLabel, { color: tint }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={15} color={colors.textQuaternary} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tap: { opacity: 0.55, transform: [{ scale: 0.97 }] },
  hairline: { height: 0.5, backgroundColor: colors.hairline },

  /* header */
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: H,
    paddingBottom: 14,
  },
  crewName: { ...type.screenSubtitle, color: colors.text },
  crewMeta: { fontSize: 15, fontWeight: '400', color: colors.textSecondary, marginTop: 2 },
  overflowBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.controlSelected,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },

  /* feed */
  feedContent: { paddingHorizontal: H, paddingBottom: 12, gap: 4 },

  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  activityLabel: { ...type.microLabel, color: colors.textTertiary },
  activityLine: { flex: 1, height: 0.5, backgroundColor: colors.hairline },

  emptyFeed: { alignItems: 'center', paddingVertical: 28 },
  emptyFeedText: { fontSize: 13.5, color: colors.textTertiary },

  /* standings */
  standingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  rank: { fontSize: 15, fontWeight: '700', width: 18, textAlign: 'center' },
  memberName: { fontSize: 15, fontWeight: '600', color: colors.text },
  memberStatus: { fontSize: 12, fontWeight: '400', color: colors.textTertiary, marginTop: 2 },
  completion: { fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text },

  /* milestone */
  milestoneWrap: { marginVertical: 8 },
  milestone: {
    borderRadius: 24,
    borderWidth: 0.5,
    borderColor: 'rgba(250,17,79,0.32)',
    padding: 16,
    gap: 14,
  },
  milestoneTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  milestoneLabel: { ...type.microLabel, color: colors.volume },
  milestoneText: { fontSize: 15, fontWeight: '600', lineHeight: 20, color: colors.text },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 52,
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: 'transparent',
    backgroundColor: colors.controlAlt,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: {
    backgroundColor: colors.accentSelectedFill,
    borderColor: colors.accentSelectedBorder,
  },
  chipEmoji: { fontSize: 15 },
  chipCount: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  milestoneTime: { marginLeft: 'auto', fontSize: 12, color: colors.textQuaternary },

  /* bubbles */
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginVertical: 3 },
  bubbleRowMe: { flexDirection: 'row-reverse' },
  bubble: { maxWidth: '76%', borderRadius: radius.bubble, paddingVertical: 9, paddingHorizontal: 15 },
  bubbleThem: { backgroundColor: colors.controlAlt30 },
  bubbleMe: { backgroundColor: colors.accent },
  bubbleText: { fontSize: 15.5, lineHeight: 21, color: colors.text },

  /* composer */
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: H,
    paddingTop: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    backgroundColor: colors.controlAlt26,
    borderRadius: radius.input,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15.5,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnOff: { backgroundColor: colors.controlAlt },

  /* menu / invite sheets */
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15 },
  menuLabel: { flex: 1, fontSize: 15.5, fontWeight: '500' },
  menuFoot: {
    ...type.bodySecondary,
    color: colors.textQuaternary,
    textAlign: 'center',
    marginTop: 16,
  },
  inviteCopy: { ...type.bodySecondary, color: colors.textSecondary, marginBottom: 18 },
  codeBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(123,97,255,0.50)',
    borderRadius: 22,
    paddingVertical: 22,
    alignItems: 'center',
    marginBottom: 22,
  },
  codeText: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 4,
    color: colors.accentText,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  /* buttons */
  primaryPill: {
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    ...shadow.sm,
  },
  primaryPillLabel: { ...type.buttonLabel, color: '#FFFFFF' },
  textBtn: { height: 54, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  textBtnLabel: { fontSize: 16, fontWeight: '400', color: colors.accentText },

  /* empty */
  emptyTitle: { ...type.screenSubtitle, color: colors.text, textAlign: 'center' },
  emptySub: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 18,
  },
});
