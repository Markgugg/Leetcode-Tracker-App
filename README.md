# Leetcode-Tracker-App (Appname: LeetAI)

Social accountability for LeetCode grinders. Small friend groups, weekly quotas, hybrid streaks.
A LeetCode tracker for friends — compete on amount done, see what areas teammates are working on, get auto-synced from LeetCode profiles, stay on track together.

## Quick start

```bash
npm install
cp .env.example .env   # fill in EXPO_PUBLIC_SUPABASE_URL + ANON_KEY
npx expo start
```

## Backend setup (Supabase)

1. Create a project at supabase.com
2. SQL editor → run migrations in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_streaks.sql`
   - `supabase/migrations/0003_cron_and_webhooks.sql` *(set the `app.functions_url` and `app.service_role_key` DB settings first — see file)*
3. Seed the problem catalog:
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-problems.ts
   ```
4. Deploy edge functions:
   ```bash
   supabase functions deploy leetcode-sync
   supabase functions deploy notify-friend-solved
   supabase functions deploy delete-account   # required for Settings → Delete account
   ```
5. Copy URL + anon key into `.env`

## What's built

**Mobile app (Expo Router)** — tabs: Today · Stats · Squad · You
- [app/_layout.tsx](app/_layout.tsx) — auth gating, silent push token refresh, onboarding redirect
- [app/(auth)/welcome.tsx](app/%28auth%29/welcome.tsx) — value-prop carousel
- [app/(auth)/sign-in.tsx](app/%28auth%29/sign-in.tsx) — Sign in with Apple + email/password
- [app/(auth)/onboarding.tsx](app/%28auth%29/onboarding.tsx) → link-leetcode → goal → notifications — 4-step onboarding (LC import preview, weekly goal, notification priming)
- [app/(tabs)/today.tsx](app/%28tabs%29/today.tsx) — goal ring, Up Next recommendation, mock interview entry, squad position, realtime activity feed
- [app/(tabs)/log.tsx](app/%28tabs%29/log.tsx) — Stats: power level, skill radar + AI coach, heatmap
- [app/(tabs)/group.tsx](app/%28tabs%29/group.tsx) — squad chat + standings
- [app/(tabs)/profile.tsx](app/%28tabs%29/profile.tsx) — You: rank, streaks, LeetCode connection
- [app/settings/index.tsx](app/settings/index.tsx) — account, notifications, connected accounts, delete account
- [app/rank.tsx](app/rank.tsx) — full gem ladder
- [app/group/create.tsx](app/group/create.tsx) — create + share invite code
- [app/group/join.tsx](app/group/join.tsx) — join via code

**Client lib**
- [src/lib/supabase.ts](src/lib/supabase.ts), [src/lib/push.ts](src/lib/push.ts)
- [src/stores/auth.ts](src/stores/auth.ts) (Zustand)
- [src/components/QuotaRing.tsx](src/components/QuotaRing.tsx)
- [src/theme.ts](src/theme.ts)

**Backend**
- [supabase/migrations/0001_init.sql](supabase/migrations/0001_init.sql) — schema + RLS + `join_group_by_code` RPC
- [supabase/migrations/0002_streaks.sql](supabase/migrations/0002_streaks.sql) — solve trigger maintains weekly_stats + daily streak; pg_cron for weekly recompute and daily decay
- [supabase/migrations/0003_cron_and_webhooks.sql](supabase/migrations/0003_cron_and_webhooks.sql) — `call_edge()` helper + notify trigger + LC sync schedule
- [supabase/functions/leetcode-sync/](supabase/functions/leetcode-sync/) — polls LeetCode GraphQL, inserts new solves
- [supabase/functions/notify-friend-solved/](supabase/functions/notify-friend-solved/) — pushes Expo notification to group peers
- [scripts/seed-problems.ts](scripts/seed-problems.ts) — one-shot problem catalog seeder

## Next up

- Friend's solve push deep-links into the feed
- Sunday-night streak-warning push (only fire if user hasn't hit quota)
- Weekly recap image generation (shareable PNG)
- Reactions on solves (V1.1)
- TestFlight build
