import {
  View, Text, Pressable, StyleSheet, FlatList,
  Alert, Share, Modal, TextInput, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { Avatar } from '@/components/Avatar';
import { colors, radius, space, shadow } from '@/theme';

const PAD = space(4);

// ─── Types ────────────────────────────────────────────────────────────────────

type Member = {
  user_id: string;
  role: string;
  username: string;
  display_name: string | null;
  weekPoints: number;
  weekSolved: number;
};

type GroupData = {
  id: string;
  name: string;
  invite_code: string;
  weekly_quota: number;
  members: Member[];
};

type RawMessage = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: { username: string; display_name: string | null } | null;
};

type RawSolve = {
  id: string;
  user_id: string;
  solved_at: string;
  points: number;
  problems: { title: string; difficulty: string } | null;
  profiles: { username: string; display_name: string | null } | null;
};

type MsgItem  = { kind: 'msg';  id: string; userId: string; name: string; content: string; ts: string; isMe: boolean };
type HardItem = { kind: 'hard'; id: string; userId: string; name: string; title: string;   ts: string; isMe: boolean; points: number };
type ChatItem = MsgItem | HardItem;

// ─── Fetchers ─────────────────────────────────────────────────────────────────

async function fetchMyGroup(userId: string): Promise<GroupData | null> {
  const { data: membership } = await supabase
    .from('group_members').select('group_id').eq('user_id', userId).limit(1).maybeSingle();
  if (!membership) return null;

  const { data: group } = await supabase
    .from('groups').select('id, name, invite_code, weekly_quota').eq('id', membership.group_id).maybeSingle();
  if (!group) return null;

  const { data: members } = await supabase
    .from('group_members').select('user_id, role, profiles(username, display_name)').eq('group_id', membership.group_id);

  const memberIds = (members ?? []).map((m: any) => m.user_id);
  const since = new Date();
  since.setDate(since.getDate() - since.getDay() + 1);
  since.setHours(0, 0, 0, 0);

  const { data: solves } = memberIds.length
    ? await supabase.from('solves').select('user_id, points').in('user_id', memberIds).gte('solved_at', since.toISOString())
    : { data: [] };

  const pts = new Map<string, { p: number; s: number }>();
  for (const r of solves ?? []) {
    const cur = pts.get(r.user_id) ?? { p: 0, s: 0 };
    cur.p += r.points; cur.s += 1;
    pts.set(r.user_id, cur);
  }

  const memberList: Member[] = (members ?? []).map((m: any) => ({
    user_id: m.user_id, role: m.role,
    username: m.profiles?.username ?? '—',
    display_name: m.profiles?.display_name ?? null,
    weekPoints: pts.get(m.user_id)?.p ?? 0,
    weekSolved: pts.get(m.user_id)?.s ?? 0,
  })).sort((a, b) => b.weekPoints - a.weekPoints);

  return { ...group, members: memberList };
}

async function fetchMessages(groupId: string): Promise<RawMessage[]> {
  const { data } = await supabase
    .from('group_messages')
    .select('id, user_id, content, created_at, profiles(username, display_name)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(100);
  return (data ?? []) as unknown as RawMessage[];
}

async function fetchHardSolves(memberIds: string[]): Promise<RawSolve[]> {
  if (!memberIds.length) return [];
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('solves')
    .select('id, user_id, solved_at, points, problems(title, difficulty), profiles(username, display_name)')
    .in('user_id', memberIds)
    .gte('solved_at', since)
    .order('solved_at', { ascending: false })
    .limit(50);
  return ((data ?? []) as unknown as RawSolve[]).filter(s => s.problems?.difficulty === 'hard');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function GroupTab() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goToBattle = () => router.push('/battle/lobby');
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  const { data: group, isLoading } = useQuery({
    queryKey: ['my-group', userId],
    enabled: !!userId,
    queryFn: () => fetchMyGroup(userId),
  });

  const memberIds = useMemo(() => group?.members.map(m => m.user_id) ?? [], [group?.members]);

  const { data: messages } = useQuery({
    queryKey: ['group-messages', group?.id],
    enabled: !!group?.id,
    queryFn: () => fetchMessages(group!.id),
    staleTime: 0,
  });

  const { data: hardSolves } = useQuery({
    queryKey: ['group-hard', group?.id],
    enabled: !!group?.id,
    queryFn: () => fetchHardSolves(memberIds),
    staleTime: 1000 * 60,
  });

  // Realtime subscriptions
  useEffect(() => {
    if (!group?.id) return;
    const ch = supabase
      .channel(`grp-chat-${group.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `group_id=eq.${group.id}` }, () => {
        qc.invalidateQueries({ queryKey: ['group-messages', group.id] });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solves' }, () => {
        qc.invalidateQueries({ queryKey: ['group-hard', group.id] });
        qc.invalidateQueries({ queryKey: ['my-group', userId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [group?.id]);

  const chatItems = useMemo<ChatItem[]>(() => {
    const msgs: ChatItem[] = (messages ?? []).map(m => ({
      kind: 'msg', id: m.id, userId: m.user_id,
      name: m.profiles?.display_name ?? m.profiles?.username ?? '?',
      content: m.content, ts: m.created_at, isMe: m.user_id === userId,
    }));
    const hard: ChatItem[] = (hardSolves ?? []).map(s => ({
      kind: 'hard', id: `h-${s.id}`, userId: s.user_id,
      name: s.profiles?.display_name ?? s.profiles?.username ?? '?',
      title: s.problems?.title ?? 'Unknown problem',
      ts: s.solved_at, isMe: s.user_id === userId, points: s.points,
    }));
    return [...msgs, ...hard].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [messages, hardSolves, userId]);

  const myStats = group?.members.find(m => m.user_id === userId);
  const myRankIdx = group?.members.findIndex(m => m.user_id === userId) ?? -1;
  const myRank = myRankIdx >= 0 ? myRankIdx + 1 : null;
  const quotaPct = group?.weekly_quota ? Math.min(1, (myStats?.weekSolved ?? 0) / group.weekly_quota) : 0;

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || !group || sending) return;
    setInputText('');
    setSending(true);
    await supabase.from('group_messages').insert({ group_id: group.id, user_id: userId, content: text });
    setSending(false);
  };

  const leaveGroup = () => {
    if (!group) return;
    Alert.alert(
      'Leave clan',
      group.members.length === 1 ? 'You\'re the last member. Leaving will delete this clan.' : 'Leave this clan?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: async () => {
          const { error } = await supabase.rpc('leave_group', { p_group_id: group.id });
          if (error) return Alert.alert('Error', error.message);
          qc.invalidateQueries({ queryKey: ['my-group'] });
          qc.invalidateQueries({ queryKey: ['feed'] });
        }},
      ],
    );
  };

  if (isLoading) return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.loader}><ActivityIndicator color={colors.accent} size="large" /></View>
    </View>
  );

  if (!group) return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.emptyRoot}>
        <Text style={s.emptyTitle}>No clan yet</Text>
        <Text style={s.emptySub}>Create or join a clan to compete with your crew.</Text>
        <Link href="/group/create" asChild>
          <Pressable style={s.primaryBtn}>
            <Ionicons name="add-circle-outline" size={17} color="#fff" />
            <Text style={s.primaryBtnText}>Create clan</Text>
          </Pressable>
        </Link>
        <Link href="/group/join" asChild>
          <Pressable style={s.secondaryBtn}><Text style={s.secondaryBtnText}>Join with invite code</Text></Pressable>
        </Link>
      </View>
    </View>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* ── Clan banner ─────────────────────────────── */}
      <Pressable style={s.banner} onPress={() => setStandingsOpen(true)}>
        <View style={s.bannerMain}>
          <View style={{ flex: 1 }}>
            <Text style={s.bannerName} numberOfLines={1}>{group.name}</Text>
            <Text style={s.bannerMeta}>{group.members.length} members · standings</Text>
          </View>
          <Pressable style={s.duelBtn} onPress={e => { e.stopPropagation(); goToBattle(); }}>
            <Ionicons name="flash" size={13} color={colors.hard} />
            <Text style={s.duelBtnText}>Duel</Text>
          </Pressable>
          <View style={s.rankBlock}>
            {myRank !== null && (
              <>
                <Text style={s.rankNum}>#{myRank}</Text>
                <Text style={s.rankSub}>of {group.members.length}</Text>
              </>
            )}
            <Ionicons name="chevron-forward" size={13} color={colors.textLight} style={{ marginTop: 2 }} />
          </View>
        </View>

        {group.weekly_quota > 0 && (
          <View style={s.quotaRow}>
            <View style={s.quotaTrack}>
              <View style={[s.quotaFill, { width: `${Math.round(quotaPct * 100)}%` }]} />
            </View>
            <Text style={s.quotaLabel}>{myStats?.weekSolved ?? 0}/{group.weekly_quota}</Text>
          </View>
        )}
      </Pressable>

      {/* ── Chat ────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <FlatList
          data={chatItems}
          keyExtractor={i => i.id}
          inverted
          contentContainerStyle={s.chatContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <Text style={s.emptyChatTitle}>No messages yet</Text>
              <Text style={s.emptyChatSub}>Be the first to say something.</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const prev = chatItems[index + 1];
            const showAvatar = !prev || prev.userId !== item.userId || prev.kind !== item.kind;
            if (item.kind === 'hard') return <HardCard event={item} />;
            return <MessageBubble item={item} showName={showAvatar} />;
          }}
        />

        {/* ── Input bar ───────────────────────────── */}
        <View style={[s.inputBar, { paddingBottom: insets.bottom + space(2) }]}>
          <TextInput
            style={s.input}
            placeholder="Message..."
            placeholderTextColor={colors.textLight}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={sendMessage}
            returnKeyType="send"
            multiline={false}
            maxLength={500}
          />
          <Pressable
            style={[s.sendBtn, (!inputText.trim() || sending) && s.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!inputText.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="arrow-up" size={17} color="#fff" />
            }
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* ── Standings modal ─────────────────────────── */}
      <StandingsModal
        visible={standingsOpen}
        group={group}
        userId={userId}
        insets={insets}
        onClose={() => setStandingsOpen(false)}
        onLeave={leaveGroup}
        onInvite={() => Share.share({ message: `Join my Grind clan "${group.name}"! Code: ${group.invite_code}` })}
        onMemberPress={uid => { setStandingsOpen(false); router.push(`/profile/${uid}`); }}
      />
    </View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ item, showName }: { item: MsgItem; showName: boolean }) {
  return (
    <View style={[s.bubbleRow, item.isMe && s.bubbleRowMe]}>
      {!item.isMe && (
        <View style={s.bubbleAvatar}>
          {showName ? <Avatar name={item.name} size={28} /> : <View style={{ width: 28 }} />}
        </View>
      )}
      <View style={[s.bubble, item.isMe ? s.bubbleMe : s.bubbleThem]}>
        {!item.isMe && showName && (
          <Text style={s.bubbleName}>{item.name}</Text>
        )}
        <Text style={[s.bubbleText, item.isMe && s.bubbleTextMe]}>{item.content}</Text>
        <Text style={[s.bubbleTime, item.isMe && s.bubbleTimeMe]}>{timeAgo(item.ts)}</Text>
      </View>
    </View>
  );
}

// ─── Hard solve card ──────────────────────────────────────────────────────────

function HardCard({ event }: { event: HardItem }) {
  return (
    <View style={s.hardCard}>
      <View style={s.hardLeft} />
      <View style={s.hardBody}>
        <View style={s.hardTop}>
          <View style={s.hardBadge}>
            <Text style={s.hardBadgeText}>HARD</Text>
          </View>
          <Text style={s.hardPts}>+{event.points} pts</Text>
        </View>
        <Text style={[s.hardName, event.isMe && { color: colors.accent }]}>
          {event.isMe ? 'You' : event.name}
        </Text>
        <Text style={s.hardTitle} numberOfLines={2}>{event.title}</Text>
        <Text style={s.hardTime}>{timeAgo(event.ts)}</Text>
      </View>
    </View>
  );
}

// ─── Standings modal ──────────────────────────────────────────────────────────

function StandingsModal({
  visible, group, userId, insets, onClose, onLeave, onInvite, onMemberPress,
}: {
  visible: boolean; group: GroupData; userId: string;
  insets: ReturnType<typeof useSafeAreaInsets>;
  onClose: () => void; onLeave: () => void;
  onInvite: () => void; onMemberPress: (uid: string) => void;
}) {
  const topPts = group.members[0]?.weekPoints || 1;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.modalBg} onPress={onClose} />
      <View style={[s.sheet, { paddingBottom: insets.bottom + space(4) }]}>
        <View style={s.sheetHandle} />

        {/* Header row */}
        <View style={s.sheetHeaderRow}>
          <View>
            <Text style={s.sheetTitle}>{group.name}</Text>
            <Text style={s.sheetSub}>THIS WEEK · {group.members.length} MEMBERS</Text>
          </View>
          <Pressable style={s.inviteBtn} onPress={onInvite}>
            <Ionicons name="person-add-outline" size={14} color={colors.accent} />
            <Text style={s.inviteBtnText}>Invite</Text>
          </Pressable>
        </View>

        {/* Invite code strip */}
        <View style={s.codeStrip}>
          <Text style={s.codeLabel}>CODE</Text>
          <Text style={s.codeValue}>{group.invite_code}</Text>
        </View>

        {/* Member list */}
        <ScrollView showsVerticalScrollIndicator={false}>
          {group.members.map((m, i) => {
            const isMe = m.user_id === userId;
            const pct = m.weekPoints / topPts;
            const isTop3 = i < 3;
            const rankColor = isTop3
              ? (['#F5C842', '#A8B2BF', '#C47A3A'] as const)[i]
              : isMe ? colors.accent : colors.textDim;

            return (
              <Pressable
                key={m.user_id}
                style={[s.memberRow, isMe && s.memberRowMe]}
                onPress={() => onMemberPress(m.user_id)}
              >
                <Text style={[s.memberRank, { color: rankColor }]}>{i + 1}</Text>
                <Avatar name={m.display_name ?? m.username} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.memberName, isMe && { color: colors.accent }]} numberOfLines={1}>
                    {m.display_name ?? m.username}{isMe ? '  (you)' : ''}
                  </Text>
                  <View style={s.memberBarBg}>
                    <View style={[s.memberBarFill, { width: `${Math.max(3, pct * 100)}%`, backgroundColor: rankColor }]} />
                  </View>
                </View>
                <View style={s.memberRight}>
                  <Text style={[s.memberPts, { color: rankColor }]}>{m.weekPoints}</Text>
                  <Text style={s.memberSolvedLabel}>{m.weekSolved} solved</Text>
                </View>
                <Ionicons name="chevron-forward" size={11} color={colors.border} />
              </Pressable>
            );
          })}

          <Pressable style={s.leaveBtn} onPress={() => { onClose(); onLeave(); }}>
            <Text style={s.leaveBtnText}>Leave clan</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Empty (no group)
  emptyRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(8), gap: space(4) },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  emptySub: { color: colors.textDim, fontSize: 14, textAlign: 'center' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: space(2),
    backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingHorizontal: space(6), paddingVertical: space(4),
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: { paddingVertical: space(3) },
  secondaryBtnText: { color: colors.accent, fontWeight: '600', fontSize: 15 },

  // Clan banner
  banner: {
    marginHorizontal: PAD, marginTop: space(4), marginBottom: space(2),
    backgroundColor: colors.card, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: space(4), ...shadow.sm,
  },
  bannerMain: { flexDirection: 'row', alignItems: 'center' },
  bannerName: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  bannerMeta: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  duelBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.hard + '50', backgroundColor: 'rgba(248,81,73,0.08)', borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(1), marginRight: space(2) },
  duelBtnText: { color: colors.hard, fontSize: 12, fontWeight: '700' },
  rankBlock: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  rankNum: { color: colors.accent, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  rankSub: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  quotaRow: { flexDirection: 'row', alignItems: 'center', gap: space(3), marginTop: space(3) },
  quotaTrack: { flex: 1, height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
  quotaFill: { height: 4, backgroundColor: colors.accent, borderRadius: 2 },
  quotaLabel: { color: colors.textDim, fontSize: 10, fontWeight: '700', minWidth: 36, textAlign: 'right' },

  // Chat
  chatContent: { paddingHorizontal: PAD, paddingVertical: space(3), gap: space(1) },

  // Empty chat
  emptyChat: { alignItems: 'center', paddingTop: space(20), gap: space(2) },
  emptyChatTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  emptyChatSub: { color: colors.textDim, fontSize: 13 },

  // Message bubbles
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space(2), marginBottom: space(1) },
  bubbleRowMe: { flexDirection: 'row-reverse' },
  bubbleAvatar: { marginBottom: 2 },
  bubble: {
    maxWidth: '75%', borderRadius: radius.lg, padding: space(3),
    borderWidth: 1,
  },
  bubbleThem: {
    backgroundColor: colors.card, borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleMe: {
    backgroundColor: colors.accentLight, borderColor: colors.accent + '40',
    borderBottomRightRadius: 4,
  },
  bubbleName: { color: colors.accent, fontSize: 11, fontWeight: '700', marginBottom: 3 },
  bubbleText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  bubbleTextMe: { color: colors.text },
  bubbleTime: { color: colors.textLight, fontSize: 10, marginTop: 4 },
  bubbleTimeMe: { textAlign: 'right' },

  // Hard solve card
  hardCard: {
    flexDirection: 'row', backgroundColor: colors.card,
    borderRadius: radius.lg, borderWidth: 1,
    borderColor: colors.hard + '50', overflow: 'hidden',
    marginVertical: space(2),
    shadowColor: colors.hard, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 3,
  },
  hardLeft: { width: 4, backgroundColor: colors.hard },
  hardBody: { flex: 1, padding: space(3) },
  hardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(2) },
  hardBadge: {
    backgroundColor: colors.hard, borderRadius: 4,
    paddingHorizontal: space(2), paddingVertical: 2,
  },
  hardBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  hardPts: { color: colors.hard, fontSize: 13, fontWeight: '800' },
  hardName: { color: colors.text, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  hardTitle: { color: colors.textDim, fontSize: 12, lineHeight: 17 },
  hardTime: { color: colors.textLight, fontSize: 10, marginTop: space(2) },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'center', gap: space(2),
    paddingHorizontal: PAD, paddingTop: space(2),
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.lg,
    paddingHorizontal: space(4), paddingVertical: space(3),
    color: colors.text, fontSize: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35, shadowRadius: 6, elevation: 4,
  },
  sendBtnDisabled: { backgroundColor: colors.border, shadowOpacity: 0 },

  // Standings modal
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: space(3), paddingHorizontal: PAD,
    borderTopWidth: 1, borderTopColor: colors.border,
    maxHeight: '82%',
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: space(5),
  },
  sheetHeaderRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: space(4),
  },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  sheetSub: { color: colors.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginTop: 3 },
  inviteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: space(2),
    borderWidth: 1, borderColor: colors.accent + '50',
    borderRadius: radius.md, paddingHorizontal: space(3), paddingVertical: space(2),
    backgroundColor: colors.accentLight,
  },
  inviteBtnText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  codeStrip: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    backgroundColor: colors.card, borderRadius: radius.lg,
    paddingHorizontal: space(4), paddingVertical: space(3),
    borderWidth: 1, borderColor: colors.border,
    marginBottom: space(5),
  },
  codeLabel: { color: colors.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  codeValue: { color: colors.text, fontSize: 18, fontWeight: '900', letterSpacing: 4 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  memberRowMe: { backgroundColor: colors.accentLight, borderRadius: radius.md, marginHorizontal: -space(1), paddingHorizontal: space(1) },
  memberRank: { fontSize: 13, fontWeight: '800', width: 22, textAlign: 'center' },
  memberName: { color: colors.text, fontWeight: '600', fontSize: 14 },
  memberBarBg: { height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden', marginTop: 5 },
  memberBarFill: { height: 3, borderRadius: 2 },
  memberRight: { alignItems: 'flex-end' },
  memberPts: { fontSize: 15, fontWeight: '900', letterSpacing: -0.3 },
  memberSolvedLabel: { color: colors.textLight, fontSize: 10 },
  leaveBtn: {
    alignItems: 'center', paddingVertical: space(4), marginTop: space(4),
    marginBottom: space(2),
  },
  leaveBtnText: { color: colors.hard, fontSize: 13, fontWeight: '700' },
});
