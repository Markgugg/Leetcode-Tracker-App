import {
  View, Text, Pressable, StyleSheet, FlatList,
  Alert, Share, TextInput, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useMemo } from 'react';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { Avatar } from '@/components/Avatar';
import { useReactions, ReactionChips, type ReactionEmoji, type ReactionSummary } from '@/components/Reactions';
import { timeAgo } from '@/lib/time';
import { colors, radius, space, shadow } from '@/theme';

const PAD = space(4);
const RANK_COLORS = ['#F5C842', '#A8B2BF', '#C47A3A'] as const;

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
type HardItem = { kind: 'hard'; id: string; solveId: string; userId: string; name: string; title: string; ts: string; isMe: boolean; points: number };
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

function daysUntilReset(): number {
  const day = new Date().getDay(); // 0=Sun … 6=Sat, resets Monday 00:00
  return day === 0 ? 1 : 8 - day;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SquadTab() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<'standings' | 'chat'>('standings');
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
      kind: 'hard', id: `h-${s.id}`, solveId: s.id, userId: s.user_id,
      name: s.profiles?.display_name ?? s.profiles?.username ?? '?',
      title: s.problems?.title ?? 'Unknown problem',
      ts: s.solved_at, isMe: s.user_id === userId, points: s.points,
    }));
    return [...msgs, ...hard].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  }, [messages, hardSolves, userId]);

  // Reactions (chat)
  const msgIds = useMemo(() => (messages ?? []).map(m => m.id), [messages]);
  const hardIds = useMemo(() => (hardSolves ?? []).map(h => h.id), [hardSolves]);
  const msgReactions = useReactions('message', msgIds, userId);
  const solveReactions = useReactions('solve', hardIds, userId);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text || !group || sending) return;
    setInputText('');
    setSending(true);
    await supabase.from('group_messages').insert({ group_id: group.id, user_id: userId, content: text });
    setSending(false);
  };

  const invite = () => {
    if (!group) return;
    Share.share({
      message: `Join my Grind squad "${group.name}"! Code: ${group.invite_code} — or open grind://group/join?code=${group.invite_code}`,
    });
  };

  const leaveSquad = () => {
    if (!group) return;
    Alert.alert(
      'Leave squad',
      group.members.length === 1 ? 'You\'re the last member. Leaving will delete this squad.' : 'Leave this squad?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Leave', style: 'destructive', onPress: async () => {
          const { error } = await supabase.rpc('leave_group', { p_group_id: group.id });
          if (error) return Alert.alert('Error', error.message);
          qc.invalidateQueries({ queryKey: ['my-group'] });
          qc.invalidateQueries({ queryKey: ['feed'] });
          qc.invalidateQueries({ queryKey: ['squad-position'] });
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
        <View style={s.emptyAvatars}>
          <View style={[s.emptyAv, { backgroundColor: '#2563EB' }]}><Text style={s.emptyAvText}>D</Text></View>
          <View style={[s.emptyAv, { backgroundColor: '#059669', marginLeft: -10 }]}><Text style={s.emptyAvText}>R</Text></View>
          <View style={[s.emptyAv, { backgroundColor: '#D97706', marginLeft: -10 }]}><Text style={s.emptyAvText}>+</Text></View>
        </View>
        <Text style={s.emptyTitle}>No squad yet</Text>
        <Text style={s.emptySub}>Shared leaderboard, streak pressure, and a chat that celebrates every hard solve.</Text>
        <Link href="/group/create" asChild>
          <Pressable style={s.primaryBtn}>
            <Ionicons name="add-circle-outline" size={17} color="#fff" />
            <Text style={s.primaryBtnText}>Start a squad</Text>
          </Pressable>
        </Link>
        <Link href="/group/join" asChild>
          <Pressable style={s.secondaryBtn}><Text style={s.secondaryBtnText}>I have an invite code</Text></Pressable>
        </Link>
      </View>
    </View>
  );

  const leader = group.members[0];
  const topPts = leader?.weekPoints || 1;
  const resetDays = daysUntilReset();
  const squadSolved = group.members.reduce((sum, m) => sum + m.weekSolved, 0);
  const squadQuota = group.weekly_quota * group.members.length;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* ── Header ──────────────────────────────────── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.headerName} numberOfLines={1}>{group.name}</Text>
          <Text style={s.headerMeta}>
            {group.members.length} member{group.members.length !== 1 ? 's' : ''} · resets in {resetDays} day{resetDays !== 1 ? 's' : ''}
          </Text>
        </View>
        <Pressable style={s.inviteIconBtn} onPress={invite} hitSlop={8}>
          <Ionicons name="person-add-outline" size={17} color={colors.accentText} />
        </Pressable>
      </View>

      {/* ── Segmented control ───────────────────────── */}
      <View style={s.seg}>
        {(['standings', 'chat'] as const).map(t => (
          <Pressable key={t} style={[s.segTab, tab === t && s.segTabOn]} onPress={() => setTab(t)}>
            <Text style={[s.segText, tab === t && s.segTextOn]}>
              {t === 'standings' ? 'Standings' : 'Chat'}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'standings' ? (
        /* ── Standings ─────────────────────────────── */
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: PAD, paddingBottom: insets.bottom + space(6) }}
        >
          {/* Crown card */}
          {leader && leader.weekPoints > 0 && (
            <View style={s.crownCard}>
              <View style={s.crownTop}>
                <Text style={s.crownLabel}>THIS WEEK'S CROWN</Text>
                <Text style={s.crownEmoji}>👑</Text>
              </View>
              <Pressable style={s.crownRow} onPress={() => router.push(`/profile/${leader.user_id}`)}>
                <Avatar name={leader.display_name ?? leader.username} size={40} />
                <View style={{ flex: 1 }}>
                  <Text style={s.crownName}>
                    {leader.user_id === userId ? 'You' : (leader.display_name ?? leader.username)}
                  </Text>
                  <Text style={s.crownSub}>
                    {leader.user_id === userId ? 'Defend it.' : 'Take it from them.'}
                  </Text>
                </View>
                <Text style={s.crownPts}>{leader.weekPoints}</Text>
              </Pressable>
            </View>
          )}

          {/* Member rows */}
          <View style={s.standCard}>
            {group.members.map((m, i) => {
              const isMe = m.user_id === userId;
              const pct = m.weekPoints / topPts;
              const gap = topPts - m.weekPoints;
              const rankColor = i < 3 ? RANK_COLORS[i] : isMe ? colors.accent : colors.textDim;
              const hitQuota = m.weekSolved >= group.weekly_quota;
              return (
                <Pressable
                  key={m.user_id}
                  style={[s.memberRow, isMe && s.memberRowMe, i < group.members.length - 1 && s.memberRowBorder]}
                  onPress={() => router.push(`/profile/${m.user_id}`)}
                >
                  <Text style={[s.memberRank, { color: rankColor }]}>{i + 1}</Text>
                  <Avatar name={m.display_name ?? m.username} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.memberName, isMe && { color: colors.accentText }]} numberOfLines={1}>
                      {isMe ? 'you' : (m.display_name ?? m.username)}
                    </Text>
                    <View style={s.memberBarBg}>
                      <View style={[s.memberBarFill, { width: `${Math.max(3, pct * 100)}%`, backgroundColor: rankColor }]} />
                    </View>
                    <Text style={s.memberSub}>
                      {i === 0
                        ? `${m.weekSolved} solved this week`
                        : `${gap} pts behind · ${m.weekSolved} solved`}
                      {!hitQuota && group.weekly_quota > 0 ? '  ·  ⚠️ quota' : ''}
                    </Text>
                  </View>
                  <Text style={[s.memberPts, { color: rankColor }]}>{m.weekPoints}</Text>
                  <Ionicons name="chevron-forward" size={12} color={colors.border} />
                </Pressable>
              );
            })}
          </View>

          {/* Squad quota */}
          {group.weekly_quota > 0 && (
            <View style={s.quotaCard}>
              <View style={{ flex: 1 }}>
                <Text style={s.quotaLabel}>SQUAD QUOTA</Text>
                <Text style={s.quotaText}>
                  <Text style={{ color: colors.text, fontWeight: '800' }}>{squadSolved}</Text> of {squadQuota} solves
                </Text>
              </View>
              <View style={s.quotaBarBg}>
                <View style={[s.quotaBarFill, { width: `${Math.min(100, Math.round((squadSolved / Math.max(1, squadQuota)) * 100))}%` }]} />
              </View>
              <Text style={s.quotaPct}>{Math.min(100, Math.round((squadSolved / Math.max(1, squadQuota)) * 100))}%</Text>
            </View>
          )}

          {/* Invite code */}
          <View style={s.codeStrip}>
            <View style={{ flex: 1 }}>
              <Text style={s.codeLabel}>INVITE CODE</Text>
              <Text style={s.codeValue}>{group.invite_code}</Text>
            </View>
            <Pressable style={s.shareBtn} onPress={invite}>
              <Ionicons name="share-outline" size={14} color={colors.accent} />
              <Text style={s.shareBtnText}>Share</Text>
            </Pressable>
          </View>

          <Pressable style={s.leaveBtn} onPress={leaveSquad}>
            <Text style={s.leaveBtnText}>Leave squad</Text>
          </Pressable>
        </ScrollView>
      ) : (
        /* ── Chat ──────────────────────────────────── */
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
              if (item.kind === 'hard') {
                return (
                  <HardCard
                    event={item}
                    reactions={solveReactions.for(item.solveId)}
                    pickerOpen={pickerFor === item.id}
                    onToggle={e => { solveReactions.toggle(item.solveId, e); setPickerFor(null); }}
                    onExpand={() => setPickerFor(item.id)}
                    onLongPress={() => setPickerFor(pickerFor === item.id ? null : item.id)}
                  />
                );
              }
              return (
                <MessageBubble
                  item={item}
                  showName={showAvatar}
                  reactions={msgReactions.for(item.id)}
                  pickerOpen={pickerFor === item.id}
                  onToggle={e => { msgReactions.toggle(item.id, e); setPickerFor(null); }}
                  onExpand={() => setPickerFor(item.id)}
                  onLongPress={() => setPickerFor(pickerFor === item.id ? null : item.id)}
                />
              );
            }}
          />

          {/* Input bar */}
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
      )}
    </View>
  );
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  item, showName, reactions, pickerOpen, onToggle, onExpand, onLongPress,
}: {
  item: MsgItem;
  showName: boolean;
  reactions: ReactionSummary;
  pickerOpen: boolean;
  onToggle: (e: ReactionEmoji) => void;
  onExpand: () => void;
  onLongPress: () => void;
}) {
  return (
    <View style={[s.bubbleRow, item.isMe && s.bubbleRowMe]}>
      {!item.isMe && (
        <View style={s.bubbleAvatar}>
          {showName ? <Avatar name={item.name} size={28} /> : <View style={{ width: 28 }} />}
        </View>
      )}
      <Pressable
        style={[s.bubble, item.isMe ? s.bubbleMe : s.bubbleThem]}
        onLongPress={onLongPress}
        delayLongPress={250}
      >
        {!item.isMe && showName && (
          <Text style={s.bubbleName}>{item.name}</Text>
        )}
        <Text style={s.bubbleText}>{item.content}</Text>
        <Text style={[s.bubbleTime, item.isMe && s.bubbleTimeMe]}>{timeAgo(item.ts)}</Text>
        <ReactionChips data={reactions} onToggle={onToggle} expanded={pickerOpen} onExpand={onExpand} />
      </Pressable>
    </View>
  );
}

// ─── Hard solve card ──────────────────────────────────────────────────────────

function HardCard({
  event, reactions, pickerOpen, onToggle, onExpand, onLongPress,
}: {
  event: HardItem;
  reactions: ReactionSummary;
  pickerOpen: boolean;
  onToggle: (e: ReactionEmoji) => void;
  onExpand: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable style={s.hardCard} onLongPress={onLongPress} delayLongPress={250}>
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
        <ReactionChips data={reactions} onToggle={onToggle} expanded={pickerOpen} onExpand={onExpand} />
      </View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Empty (no squad)
  emptyRoot: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space(8), gap: space(3) },
  emptyAvatars: { flexDirection: 'row', marginBottom: space(1) },
  emptyAv: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.bg,
  },
  emptyAvText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  emptySub: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: space(2),
    backgroundColor: colors.accent, borderRadius: radius.lg,
    paddingHorizontal: space(6), paddingVertical: space(4), marginTop: space(2),
    shadowColor: colors.accent, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: { paddingVertical: space(3) },
  secondaryBtnText: { color: colors.accent, fontWeight: '600', fontSize: 15 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    paddingHorizontal: PAD, paddingTop: space(4), paddingBottom: space(2),
  },
  headerName: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  headerMeta: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  inviteIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.accent + '40',
  },

  // Segmented control
  seg: {
    flexDirection: 'row', marginHorizontal: PAD, marginVertical: space(2),
    backgroundColor: colors.card, borderRadius: radius.lg, padding: 3, ...shadow.sm,
  },
  segTab: { flex: 1, paddingVertical: space(2), alignItems: 'center', borderRadius: radius.md },
  segTabOn: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  segText: { color: colors.textDim, fontWeight: '600', fontSize: 13 },
  segTextOn: { color: colors.text },

  // Crown card
  crownCard: {
    backgroundColor: '#1d1a10', borderRadius: radius.xl,
    borderWidth: 1, borderColor: 'rgba(232,179,75,0.35)',
    padding: space(4), marginTop: space(2), marginBottom: space(3), ...shadow.sm,
  },
  crownTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space(3) },
  crownLabel: { color: colors.gold, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  crownEmoji: { fontSize: 16 },
  crownRow: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  crownName: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  crownSub: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  crownPts: { color: colors.gold, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },

  // Standings
  standCard: {
    backgroundColor: colors.card, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden', ...shadow.sm,
  },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    paddingHorizontal: space(4), paddingVertical: space(3),
  },
  memberRowMe: { backgroundColor: colors.accentLight },
  memberRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  memberRank: { fontSize: 13, fontWeight: '800', width: 20, textAlign: 'center' },
  memberName: { color: colors.text, fontWeight: '700', fontSize: 14 },
  memberBarBg: { height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden', marginTop: 5, marginBottom: 3 },
  memberBarFill: { height: 3, borderRadius: 2 },
  memberSub: { color: colors.textLight, fontSize: 10 },
  memberPts: { fontSize: 15, fontWeight: '900', letterSpacing: -0.3 },

  // Squad quota
  quotaCard: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    backgroundColor: colors.card, borderRadius: radius.xl,
    borderWidth: 1, borderColor: colors.border,
    padding: space(4), marginTop: space(3), ...shadow.sm,
  },
  quotaLabel: { color: colors.textDim, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  quotaText: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  quotaBarBg: { flex: 1, height: 5, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' },
  quotaBarFill: { height: 5, backgroundColor: colors.accent, borderRadius: 3 },
  quotaPct: { color: colors.accentText, fontSize: 12, fontWeight: '800', minWidth: 34, textAlign: 'right' },

  // Invite code strip
  codeStrip: {
    flexDirection: 'row', alignItems: 'center', gap: space(3),
    backgroundColor: colors.card, borderRadius: radius.xl,
    paddingHorizontal: space(4), paddingVertical: space(3),
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.accent + '50',
    marginTop: space(3),
  },
  codeLabel: { color: colors.textDim, fontSize: 9, fontWeight: '700', letterSpacing: 1.5 },
  codeValue: { color: colors.accentText, fontSize: 20, fontWeight: '900', letterSpacing: 5, marginTop: 2 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', gap: space(1),
    backgroundColor: colors.accentLight, borderRadius: radius.md,
    paddingHorizontal: space(3), paddingVertical: space(2),
    borderWidth: 1, borderColor: colors.accent + '40',
  },
  shareBtnText: { color: colors.accent, fontSize: 12, fontWeight: '700' },

  leaveBtn: { alignItems: 'center', paddingVertical: space(5) },
  leaveBtnText: { color: colors.hard, fontSize: 13, fontWeight: '700' },

  // Chat
  chatContent: { paddingHorizontal: PAD, paddingVertical: space(3), gap: space(1) },
  emptyChat: { alignItems: 'center', paddingTop: space(20), gap: space(2) },
  emptyChatTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  emptyChatSub: { color: colors.textDim, fontSize: 13 },

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
  bubbleTime: { color: colors.textLight, fontSize: 10, marginTop: 4 },
  bubbleTimeMe: { textAlign: 'right' },

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
});
