/** Shared types for the Crew screen (§3.8). */

export const EMOJIS = ['🔥', '💀', '👏'] as const;
export type Emoji = (typeof EMOJIS)[number];

export type Member = {
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
  /** 0..1, mean of the three clamped ring fractions. Rank key. */
  completion: number;
};

export type Crew = {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
};

export type CrewData = {
  crews: Crew[];
  active: Crew;
  members: Member[];
};

export type RawMessage = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

export type RawSolve = {
  id: string;
  user_id: string;
  solved_at: string;
  points: number;
  problems: { title: string; difficulty: string } | null;
  profiles: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

export type ReactionRow = {
  solve_id: string;
  emoji: string;
  count: number;
  reacted_by_me: boolean;
};

/** One message inside a group. */
export type ChatLine = {
  /** Stable key: server id, or `tmp-…` while optimistic. */
  id: string;
  content: string;
  ts: string;
  /** Optimistic lifecycle. `undefined` = confirmed server row. */
  status?: 'sending' | 'failed';
};

/**
 * Consecutive messages from one sender inside GROUP_WINDOW_MS, collapsed into
 * a single row. `lines` are oldest → newest (reading order inside the bubble
 * stack); the feed array itself is newest → oldest because the list is
 * `inverted`.
 */
export type MsgGroupItem = {
  kind: 'msgGroup';
  id: string;
  userId: string;
  name: string;
  avatar: string | null;
  isMe: boolean;
  /** Timestamp of the newest line — the group's sort key. */
  ts: string;
  lines: ChatLine[];
};

export type MilestoneItem = {
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

/** A day separator injected between groups. */
export type DayDividerItem = {
  kind: 'day';
  id: string;
  ts: string;
  label: string;
};

export type FeedItem = MsgGroupItem | MilestoneItem | DayDividerItem;

/** Pending optimistic send, owned by `useCrewChat`. */
export type PendingMessage = {
  tempId: string;
  content: string;
  ts: string;
  status: 'sending' | 'failed';
  /** Set once the insert returns; used to retire the item on refetch. */
  serverId?: string;
};
