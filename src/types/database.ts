export type Difficulty = 'easy' | 'medium' | 'hard';
export type SolveSource = 'manual' | 'leetcode_sync';

export interface NotificationPrefs {
  squad_solves: boolean;
  hard_only: boolean;
  streak_warnings: boolean;
  rank_changes: boolean;
}

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  leetcode_username: string | null;
  leetcode_last_synced_at: string | null;
  ai_hints: string[] | null;
  ai_hints_refreshed_at: string | null;
  timezone: string;
  created_at: string;
  weekly_goal: number;
  serious_mode: boolean;
  notification_prefs: NotificationPrefs;
}

export interface Group {
  id: string;
  name: string;
  invite_code: string;
  weekly_quota: number;
  created_by: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
}

export interface Problem {
  slug: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  is_premium: boolean;
}

export interface Solve {
  id: string;
  user_id: string;
  problem_slug: string;
  solved_at: string;
  solved_date: string;
  source: SolveSource;
  language: string | null;
  note: string | null;
  points: number;
  created_at: string;
}

export interface Streak {
  user_id: string;
  current_weeks: number;
  longest_weeks: number;
  last_qualifying_week: string | null;
  freezes_available: number;
  current_days: number;
  longest_days: number;
  last_active_day: string | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      groups: { Row: Group; Insert: Partial<Group>; Update: Partial<Group> };
      group_members: { Row: GroupMember; Insert: Partial<GroupMember>; Update: Partial<GroupMember> };
      problems: { Row: Problem; Insert: Partial<Problem>; Update: Partial<Problem> };
      solves: { Row: Solve; Insert: Partial<Solve>; Update: Partial<Solve> };
      streaks: { Row: Streak; Insert: Partial<Streak>; Update: Partial<Streak> };
    };
  };
}
