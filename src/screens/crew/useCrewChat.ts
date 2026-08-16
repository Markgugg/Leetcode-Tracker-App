/**
 * Crew chat state: keyset pagination, optimistic sends with a hard cap, and
 * the merge/collapse pass that turns raw rows into the rows the list renders.
 *
 * The list that consumes this is `inverted`, so everything here is ordered
 * NEWEST → OLDEST. Inside a group, `lines` run oldest → newest because an
 * inverted list flips each row's contents back the right way up.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { PAGE_SIZE, dayKey, dayLabel, fetchMessagePage, nameOf } from './api';
import type {
  ChatLine,
  FeedItem,
  Member,
  MsgGroupItem,
  PendingMessage,
  RawMessage,
  RawSolve,
} from './types';

/** Consecutive messages from one sender inside this window collapse. */
const GROUP_WINDOW_MS = 60_000;
/** …but never more than this many in one bubble stack, so a flood still breathes. */
const MAX_GROUP_LINES = 12;
/** Unsent messages allowed in flight at once. Beyond this the composer locks. */
export const MAX_PENDING = 5;
/** Hard ceiling on a single message, mirrored by the composer's maxLength. */
export const MAX_MESSAGE_LENGTH = 500;

type Entry = {
  id: string;
  userId: string;
  name: string;
  avatar: string | null;
  content: string;
  ts: string;
  isMe: boolean;
  status?: 'sending' | 'failed';
};

const msAsc = (a: string, b: string) => new Date(a).getTime() - new Date(b).getTime();

export interface UseCrewChatArgs {
  groupId?: string;
  userId: string;
  members: Member[];
  milestones: RawSolve[] | undefined;
  /** Ring completion by user id, for the "RINGS CLOSED" milestone label. */
  completionOf: (userId: string) => number;
  onError: (message: string) => void;
}

export function useCrewChat({
  groupId,
  userId,
  members,
  milestones,
  completionOf,
  onError,
}: UseCrewChatArgs) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [sending, setSending] = useState(false);
  const seq = useRef(0);

  const key = useMemo(() => ['crew-messages', groupId] as const, [groupId]);

  const query = useInfiniteQuery({
    queryKey: key,
    enabled: !!groupId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchMessagePage(groupId!, pageParam),
    getNextPageParam: (last: RawMessage[]) =>
      last.length < PAGE_SIZE ? undefined : (last[last.length - 1]?.created_at ?? undefined),
    staleTime: 0,
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = query;

  /** Every loaded row, newest → oldest. */
  const rows = useMemo<RawMessage[]>(() => data?.pages.flat() ?? [], [data]);

  const loadedIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  /* — retire optimistic rows the server has confirmed back to us — */
  useEffect(() => {
    setPending((prev) => {
      const next = prev.filter((p) => !(p.serverId && loadedIds.has(p.serverId)));
      return next.length === prev.length ? prev : next;
    });
  }, [loadedIds]);

  /* — clear everything in flight when the active crew changes — */
  useEffect(() => {
    setPending([]);
    setSending(false);
  }, [groupId]);

  const me = useMemo(() => members.find((m) => m.user_id === userId), [members, userId]);

  // `members` is a fresh array on every crew refetch. Reading it through a ref
  // keeps `pushRealtimeMessage` referentially stable, so the screen's realtime
  // effect doesn't tear the channel down and resubscribe on each refetch.
  const membersRef = useRef(members);
  membersRef.current = members;

  /* ---------------------------------------------------------------- */
  /* Feed                                                              */
  /* ---------------------------------------------------------------- */

  const feed = useMemo<FeedItem[]>(() => {
    /* 1 — server messages, newest first. */
    const entries: Entry[] = rows.map((m) => ({
      id: m.id,
      userId: m.user_id,
      name: nameOf(m.profiles),
      avatar: m.profiles?.avatar_url ?? null,
      content: m.content,
      ts: m.created_at,
      isMe: m.user_id === userId,
    }));

    /* 2 — optimistic rows sit on top, newest first. */
    const live = pending.filter((p) => !(p.serverId && loadedIds.has(p.serverId)));
    const optimistic: Entry[] = [...live]
      .sort((a, b) => msAsc(b.ts, a.ts))
      .map((p) => ({
        id: p.tempId,
        userId,
        name: me ? (me.display_name ?? me.username) : 'You',
        avatar: me?.avatar_url ?? null,
        content: p.content,
        ts: p.ts,
        isMe: true,
        status: p.status,
      }));

    const chat = [...optimistic, ...entries];

    /* 3 — milestones, clipped to the loaded window so nothing lands above the
           oldest message we actually have. */
    const oldestLoaded = entries.length ? entries[entries.length - 1].ts : undefined;
    const stones = (milestones ?? [])
      .filter((sv) => !hasNextPage || !oldestLoaded || msAsc(oldestLoaded, sv.solved_at) <= 0)
      .map((sv) => ({
        kind: 'milestone' as const,
        id: `m-${sv.id}`,
        solveId: sv.id,
        userId: sv.user_id,
        name: nameOf(sv.profiles),
        title: sv.problems?.title ?? 'a hard problem',
        ts: sv.solved_at,
        isMe: sv.user_id === userId,
        ringsClosed: completionOf(sv.user_id) >= 1,
      }));

    /* 4 — collapse consecutive same-sender chat into groups, merging the
           milestones in by timestamp as we go. */
    type Merged = { ts: string; entry?: Entry; stone?: (typeof stones)[number] };
    const merged: Merged[] = [
      ...chat.map((e) => ({ ts: e.ts, entry: e })),
      ...stones.map((sv) => ({ ts: sv.ts, stone: sv })),
    ].sort((a, b) => msAsc(b.ts, a.ts));

    const out: FeedItem[] = [];
    for (let i = 0; i < merged.length; ) {
      const head = merged[i];
      if (head.stone) {
        out.push(head.stone);
        i += 1;
        continue;
      }
      const first = head.entry!;
      const run: Entry[] = [first];
      let j = i + 1;
      while (j < merged.length && run.length < MAX_GROUP_LINES) {
        const nxt = merged[j].entry;
        if (!nxt || nxt.userId !== first.userId) break;
        const gap = new Date(run[run.length - 1].ts).getTime() - new Date(nxt.ts).getTime();
        if (!Number.isFinite(gap) || gap > GROUP_WINDOW_MS) break;
        run.push(nxt);
        j += 1;
      }
      const lines: ChatLine[] = [...run]
        .reverse()
        .map((e) => ({ id: e.id, content: e.content, ts: e.ts, status: e.status }));
      const group: MsgGroupItem = {
        kind: 'msgGroup',
        // Keyed on the OLDEST line: later messages joining the group keep the
        // key stable, so the row updates instead of remounting.
        id: `g-${run[run.length - 1].id}`,
        userId: first.userId,
        name: first.name,
        avatar: first.avatar,
        isMe: first.isMe,
        ts: first.ts,
        lines,
      };
      out.push(group);
      i = j;
    }

    /* 5 — day dividers. In a descending list the divider for a day belongs
           *after* that day's last item. */
    const withDays: FeedItem[] = [];
    for (let i = 0; i < out.length; i++) {
      withDays.push(out[i]);
      const cur = dayKey(out[i].ts);
      const nxt = out[i + 1] ? dayKey(out[i + 1].ts) : null;
      const isOldest = i === out.length - 1;
      if (nxt === null ? isOldest && !hasNextPage : nxt !== cur) {
        withDays.push({
          kind: 'day',
          id: `d-${cur}-${out[i].id}`,
          ts: out[i].ts,
          label: dayLabel(out[i].ts),
        });
      }
    }
    return withDays;
  }, [rows, pending, loadedIds, milestones, userId, me, hasNextPage, completionOf]);

  /* ---------------------------------------------------------------- */
  /* Sending                                                           */
  /* ---------------------------------------------------------------- */

  const pendingCount = pending.length;
  const failedCount = pending.filter((p) => p.status === 'failed').length;
  const atPendingCap = pendingCount >= MAX_PENDING;
  /**
   * Why the composer is locked, so the copy can be honest: a queue full of
   * *failed* sends is a connectivity problem the user must clear by retrying
   * or discarding, not something that will drain on its own.
   */
  const capReason: 'none' | 'inflight' | 'failed' = !atPendingCap
    ? 'none'
    : failedCount >= pendingCount
      ? 'failed'
      : 'inflight';

  const insert = useCallback(
    async (tempId: string, text: string) => {
      const { data: row, error } = await supabase
        .from('group_messages')
        .insert({ group_id: groupId, user_id: userId, content: text })
        .select('id, created_at')
        .single();

      if (error || !row) {
        setPending((p) =>
          p.map((x) => (x.tempId === tempId ? { ...x, status: 'failed' as const } : x)),
        );
        onError("Message didn't send — tap it to retry");
        return false;
      }

      setPending((p) =>
        p.map((x) =>
          x.tempId === tempId
            ? { ...x, serverId: (row as any).id, ts: (row as any).created_at ?? x.ts }
            : x,
        ),
      );
      return true;
    },
    [groupId, userId, onError],
  );

  /**
   * `queued` means the message now owns an optimistic bubble — the composer
   * must NOT put the text back in the draft, even if the insert then fails,
   * because the failed bubble is the retry affordance. `rejected` means
   * nothing was queued and the draft is the only copy left.
   */
  const send = useCallback(
    async (raw: string): Promise<'queued' | 'rejected'> => {
      const text = raw.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!text || !groupId || sending) return 'rejected';
      if (pending.length >= MAX_PENDING) {
        onError('Too many messages still in flight — give it a second');
        return 'rejected';
      }
      seq.current += 1;
      const tempId = `tmp-${Date.now()}-${seq.current}`;
      setPending((p) => [...p, { tempId, content: text, ts: new Date().toISOString(), status: 'sending' }]);
      setSending(true);
      try {
        await insert(tempId, text);
      } finally {
        setSending(false);
      }
      return 'queued';
    },
    [groupId, sending, pending.length, insert, onError],
  );

  const retry = useCallback(
    async (tempId: string) => {
      const item = pending.find((p) => p.tempId === tempId);
      if (!item || item.status !== 'failed' || sending) return;
      setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, status: 'sending' } : x)));
      setSending(true);
      try {
        await insert(tempId, item.content);
      } finally {
        setSending(false);
      }
    },
    [pending, sending, insert],
  );

  const discard = useCallback((tempId: string) => {
    setPending((p) => p.filter((x) => x.tempId !== tempId));
  }, []);

  /* ---------------------------------------------------------------- */
  /* Realtime                                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Splice a realtime INSERT straight into page 0 instead of refetching — a
   * refetch would re-request every loaded page, which on a long scrollback is
   * both slow and enough to lose the reader's position.
   */
  const pushRealtimeMessage = useCallback(
    (row: { id: string; user_id: string; content: string; created_at: string }) => {
      const author = membersRef.current.find((m) => m.user_id === row.user_id);
      if (!author) {
        // A member we don't know yet — fall back to a refetch of the head page.
        qc.invalidateQueries({ queryKey: key, refetchType: 'active' });
        return;
      }
      qc.setQueryData<{ pages: RawMessage[][]; pageParams: unknown[] }>(key, (old) => {
        if (!old?.pages?.length) return old;
        if (old.pages.some((pg) => pg.some((m) => m.id === row.id))) return old;
        const next: RawMessage = {
          id: row.id,
          user_id: row.user_id,
          content: row.content,
          created_at: row.created_at,
          profiles: {
            username: author.username,
            display_name: author.display_name,
            avatar_url: author.avatar_url,
          },
        };
        const pages = [...old.pages];
        pages[0] = [next, ...pages[0]];
        return { ...old, pages };
      });
    },
    [qc, key],
  );

  const loadOlder = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return {
    feed,
    isLoading,
    hasOlder: !!hasNextPage,
    loadingOlder: isFetchingNextPage,
    loadOlder,
    refetch,
    pushRealtimeMessage,
    send,
    retry,
    discard,
    sending,
    pendingCount,
    failedCount,
    atPendingCap,
    capReason,
    /** True once the whole history is loaded and there is nothing in it. */
    isEmpty: !isLoading && feed.length === 0,
  };
}
