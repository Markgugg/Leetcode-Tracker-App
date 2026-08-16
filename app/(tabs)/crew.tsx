/**
 * Crew — design_handoff/README.md §3.8 (+ sheets §3.11).
 *
 * Replaces app/(tabs)/group.tsx and absorbs app/(tabs)/leaderboard.tsx.
 *  · Standings are always visible and ranked on **ring completion %**, not points.
 *  · The merged chat + milestone feed is kept; milestone cards carry reactions
 *    (optimistic write to `solve_reactions`, then reconcile against
 *    `solve_reaction_counts`).
 *  · Multi-crew: reads every membership, opens on `profiles.active_group_id`,
 *    switcher lives in the overflow menu.
 *  · No Alert.alert — every message is the Toast component or inline state.
 *
 * Chat mechanics live in `src/screens/crew/useCrewChat.ts`. The list is
 * `inverted`, which is what makes a long history open on the newest message
 * for free: offset 0 *is* the bottom, so there is no scroll-to-end race on
 * mount and no jump when older pages load in above.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { AmbientBackdrop } from '@/components/AmbientBackdrop';
import { useToast } from '@/components/Toast';
import { colors, pressed, tabular, type } from '@/theme';

import {
  Composer,
  CrewMenuSheet,
  DayDivider,
  EmptyCrew,
  GlassCircleButton,
  H,
  InviteSheet,
  MessageGroup,
  MilestoneCard,
  NewMessagesPill,
  SectionRule,
  StandingsCard,
  StandingsSheet,
  fetchCrew,
  fetchMilestones,
  fetchReactions,
  useCrewChat,
  weekNumber,
} from '@/screens/crew';
import type { Emoji, FeedItem, ReactionRow } from '@/screens/crew';

/** Inverted list: this many px from offset 0 still counts as "at the bottom". */
const BOTTOM_SLOP = 64;
/** Clearance for the floating tab bar (§3.10). */
const TAB_BAR_CLEARANCE = 96;

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export default function CrewScreen() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show, toastNode } = useToast(TAB_BAR_CLEARANCE + 8);

  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const keyboardUp = useKeyboardVisible();

  const listRef = useRef<FlatList<FeedItem>>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [unread, setUnread] = useState(0);

  const { data: crew, isLoading } = useQuery({
    queryKey: ['crew', userId],
    enabled: !!userId,
    queryFn: () => fetchCrew(userId),
  });

  const groupId = crew?.active.id;
  const members = useMemo(() => crew?.members ?? [], [crew?.members]);
  const memberIds = useMemo(() => members.map((m) => m.user_id), [members]);

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

  const completionOf = useCallback(
    (uid: string) => members.find((m) => m.user_id === uid)?.completion ?? 0,
    [members],
  );

  const chat = useCrewChat({
    groupId,
    userId,
    members,
    milestones,
    completionOf,
    onError: show,
  });
  const { feed, pushRealtimeMessage } = chat;

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
        (payload) => pushRealtimeMessage(payload.new as any),
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
  }, [groupId, userId, qc, pushRealtimeMessage]);

  /* — unread pill: only counts what arrived while the reader was away — */
  const newest = useMemo(() => {
    for (const item of feed) {
      if (item.kind === 'msgGroup') {
        const last = item.lines[item.lines.length - 1];
        return { key: last?.id ?? item.id, isMe: item.isMe };
      }
      if (item.kind === 'milestone') return { key: item.id, isMe: item.isMe };
    }
    return null;
  }, [feed]);

  const seenKey = useRef<string | null>(null);
  useEffect(() => {
    const key = newest?.key ?? null;
    if (key === seenKey.current) return;
    const isFirstLoad = seenKey.current === null;
    seenKey.current = key;
    if (isFirstLoad || !key) return;
    // Sticky bottom, or it's our own message: the list already shows it.
    if (atBottomRef.current || newest?.isMe) return;
    setUnread((u) => u + 1);
  }, [newest]);

  useEffect(() => {
    if (atBottom) setUnread(0);
  }, [atBottom]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Inverted: y grows as you travel back in time, so 0 is the newest message.
    const next = e.nativeEvent.contentOffset.y <= BOTTOM_SLOP;
    if (next !== atBottomRef.current) {
      atBottomRef.current = next;
      setAtBottom(next);
    }
  }, []);

  const jumpToBottom = useCallback(() => {
    setUnread(0);
    atBottomRef.current = true;
    setAtBottom(true);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  /* — reactions — */
  const reactionMap = useMemo(() => {
    const m = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions ?? []) {
      m.set(`${r.solve_id}|${r.emoji}`, { count: r.count, mine: r.reacted_by_me });
    }
    return m;
  }, [reactions]);

  const reactionKey = useMemo(
    () => ['crew-reactions', groupId, solveIds.join(',')],
    [groupId, solveIds],
  );

  const toggleReaction = useMutation({
    mutationFn: async ({
      solveId,
      emoji,
      mine,
    }: {
      solveId: string;
      emoji: Emoji;
      mine: boolean;
    }) => {
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

  /* — actions — */

  const onSend = useCallback(async () => {
    const text = draft;
    if (!text.trim()) return;
    setDraft('');
    atBottomRef.current = true;
    setAtBottom(true);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    const result = await chat.send(text);
    // Only a rejection loses the text — a queued message that then fails keeps
    // its own bubble, and restoring the draft too would duplicate it.
    if (result === 'rejected') setDraft((d) => d || text);
  }, [draft, chat]);

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
    } catch {
      show("Couldn't open the share sheet");
    }
  }, [crew, show]);

  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => {
      if (item.kind === 'day') return <DayDivider label={item.label} />;
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
      return <MessageGroup item={item} onRetry={chat.retry} onDiscard={chat.discard} />;
    },
    [reactionMap, toggleReaction, chat.retry, chat.discard],
  );

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
        <EmptyCrew />
        {toastNode}
      </View>
    );
  }

  const me = members.find((m) => m.user_id === userId);
  const myRank = members.findIndex((m) => m.user_id === userId) + 1;

  return (
    <View style={s.root}>
      <AmbientBackdrop />

      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        <View style={s.headerText}>
          <Text style={s.crewName} numberOfLines={1}>
            {crew.active.name}
          </Text>
          <Text style={s.crewMeta}>
            {members.length} member{members.length === 1 ? '' : 's'} · week{' '}
            {weekNumber(crew.active.created_at)}
          </Text>
        </View>
        <GlassCircleButton
          icon="ellipsis-horizontal"
          accessibilityLabel="Crew options"
          style={s.overflowBtn}
          onPress={() => {
            setConfirmLeave(false);
            setMenuOpen(true);
          }}
        />
      </View>

      {/* ── Standings (pinned) ─────────────────────────────────── */}
      <View style={s.standings}>
        {keyboardUp ? (
          <Pressable
            onPress={() => setStandingsOpen(true)}
            accessibilityRole="button"
            style={({ pressed: p }) => [s.compactStrip, p && pressed]}>
            <Text style={s.compactLabel}>Standings</Text>
            <Text style={[s.compactValue, tabular]}>
              {me ? `${ordinal(myRank)} · ${Math.round(me.completion * 100)}%` : '—'}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
          </Pressable>
        ) : (
          <StandingsCard
            members={members}
            userId={userId}
            limit={3}
            onMemberPress={(uid) => router.push(`/profile/${uid}`)}
            onSeeAll={() => setStandingsOpen(true)}
          />
        )}
        <View style={s.rule}>
          <SectionRule label="ACTIVITY" />
        </View>
      </View>

      {/* ── Feed + composer ────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.flex}>
          <FlatList
            ref={listRef}
            data={feed}
            inverted
            keyExtractor={(i) => i.id}
            renderItem={renderItem}
            contentContainerStyle={s.feedContent}
            showsVerticalScrollIndicator={false}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onScroll={onScroll}
            scrollEventThrottle={16}
            // Inverted: the "end" is the oldest message, so this is the pull
            // that pages history in.
            onEndReached={chat.loadOlder}
            onEndReachedThreshold={0.4}
            initialNumToRender={14}
            maxToRenderPerBatch={12}
            windowSize={11}
            removeClippedSubviews={Platform.OS === 'android'}
            ListFooterComponent={
              chat.loadingOlder ? (
                <View style={s.olderSpinner}>
                  <ActivityIndicator size="small" color={colors.textTertiary} />
                </View>
              ) : !chat.hasOlder && feed.length > 0 ? (
                <Text style={s.historyEnd}>Start of {crew.active.name}</Text>
              ) : null
            }
            ListEmptyComponent={
              chat.isLoading ? null : (
                <View style={s.emptyFeed}>
                  <Text style={s.emptyFeedText}>Nothing yet. Say something.</Text>
                </View>
              )
            }
          />

          <NewMessagesPill
            visible={!atBottom && unread > 0}
            count={unread}
            onPress={jumpToBottom}
            bottom={12}
          />
        </View>

        <Composer
          value={draft}
          onChangeText={setDraft}
          onSend={onSend}
          sending={chat.sending}
          capReason={chat.capReason}
          bottomInset={keyboardUp ? 10 : insets.bottom + TAB_BAR_CLEARANCE}
        />
      </KeyboardAvoidingView>

      <CrewMenuSheet
        visible={menuOpen}
        crews={crew.crews}
        active={crew.active}
        confirmLeave={confirmLeave}
        onClose={() => setMenuOpen(false)}
        onInvite={() => {
          setMenuOpen(false);
          setInviteOpen(true);
        }}
        onSwitch={switchCrew}
        onLeave={() => (confirmLeave ? leaveCrew() : setConfirmLeave(true))}
      />

      <InviteSheet
        visible={inviteOpen}
        crew={crew.active}
        onClose={() => setInviteOpen(false)}
        onShare={shareInvite}
      />

      <StandingsSheet
        visible={standingsOpen}
        members={members}
        userId={userId}
        onClose={() => setStandingsOpen(false)}
        onMemberPress={(uid) => router.push(`/profile/${uid}`)}
      />

      {toastNode}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function useKeyboardVisible() {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const a = Keyboard.addListener(showEvt, () => setUp(true));
    const b = Keyboard.addListener(hideEvt, () => setUp(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return up;
}

function ordinal(n: number) {
  if (n <= 0) return '—';
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n}st`;
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
  return `${n}th`;
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: H,
    paddingBottom: 14,
  },
  headerText: { flex: 1 },
  crewName: { ...type.screenSubtitle, color: colors.text },
  crewMeta: { fontSize: 15, fontWeight: '400', color: colors.textSecondary, marginTop: 2 },
  overflowBtn: { marginTop: 6 },

  standings: { paddingHorizontal: H },
  rule: { marginTop: 20, marginBottom: 10 },
  compactStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  compactLabel: { flex: 1, ...type.microLabel, color: colors.textTertiary },
  compactValue: { fontSize: 13.5, fontWeight: '600', color: colors.text },

  feedContent: { paddingHorizontal: H, paddingVertical: 8, flexGrow: 1 },

  olderSpinner: { paddingVertical: 16, alignItems: 'center' },
  historyEnd: {
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 12,
    color: colors.textQuaternary,
  },

  // VirtualizedList already composes the inversion transform onto the empty,
  // header and footer components, so nothing here counter-flips by hand.
  emptyFeed: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 28 },
  emptyFeedText: { fontSize: 13.5, color: colors.textTertiary },
});
