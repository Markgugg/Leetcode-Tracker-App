# Handoff: LeetAI — full UI replacement (Activity-ring direction, v2)

## Overview

This package replaces the entire front-end of the **Leetcode-Tracker-App** (Expo Router + Supabase, app name "Grind"/"LeetAI") with a new design system and information architecture.

The core product change: **the app no longer opens on a social feed. It opens on you, today, as three rings.** Everything else is a drill-down. The redesign also collapses three parallel rank systems into one, surfaces two screens that were shipped but unreachable, and adds the reactions loop the old feed was missing.

Target platform is the existing **React Native (Expo Router) app** — recreate the designs there using its established patterns.

## About the design files

The files in `prototypes/` are **design references authored in HTML**. They are prototypes that show intended look, motion and behavior. **They are not production code to copy.** Do not port the HTML, the CSS, or the `.dc.html` runtime into the app.

Your job is to **recreate these designs inside the existing Expo/React Native codebase**, using its already-installed libraries:

| Need | Use |
| --- | --- |
| Rings, radar, arcs | `react-native-svg` (already a dependency — see `src/components/QuotaRing.tsx`, `RadarChart.tsx`) |
| Glass / blur surfaces | `expo-blur` `<BlurView>` — **`backdrop-filter` does not exist in RN**; every glass card in the prototype becomes a `BlurView` with a translucent overlay |
| Animation | `react-native-reanimated` (ring fills, sheet entry, bar growth, radar scale-in) |
| Data | existing `@tanstack/react-query` + `src/lib/supabase.ts` |
| Icons | the prototype's inline SVG paths are given below; render them with `react-native-svg` `<Path>` or map to the existing `@expo/vector-icons` Ionicons equivalents |

Open `prototypes/LeetAI Prototype v2.dc.html` in a browser to click through the real thing (`support.js` must sit beside it). Two supporting files are included for context:

- `prototypes/LeetAI Audit.dc.html` — every current screen recreated from your source, each annotated with what's wrong. **Read this first** — it explains *why* each change exists.
- `prototypes/LeetAI Redesign.dc.html` — the three rejected/alternate visual directions (WHOOP, editorial, and two hybrids that keep the GitHub-dark palette). Useful if a decision needs revisiting.

## Fidelity

**High-fidelity.** Every color, radius, font size, weight, letter-spacing, stroke width, animation duration and easing curve below is the exact value used in the prototype. Recreate pixel-perfectly. Where a value is expressed as a percentage or a ring dash, the formula is given.

---

## 1. Design tokens

### Color

```
BACKGROUND
bg                  #000000            true black (OLED — rings glow against it)
ambient glow        three radial gradients, pointer-events none, fixed behind all content:
                    radial-gradient(420px 300px at 78% 4%,  rgba(250,17,79,.13), transparent 70%)
                    radial-gradient(400px 340px at 8% 34%,  rgba(0,211,242,.09), transparent 70%)
                    radial-gradient(460px 320px at 60% 92%, rgba(162,247,61,.07), transparent 70%)
                    → in RN: three absolutely-positioned expo-linear-gradient / SVG radial gradients,
                      or a single pre-rendered PNG at 2x. They are what makes the blur read as glass.

SURFACES (all blurred — see "Glass recipe")
card                rgba(28,28,30,.62)   blur 34  saturate 180%  border .5px rgba(255,255,255,.10)
card (small/stat)   rgba(28,28,30,.60)   blur 30                 border .5px rgba(255,255,255,.09)
sheet               rgba(30,30,34,.90)   blur 50  saturate 180%  border-top .5px rgba(255,255,255,.14)
tab bar             rgba(28,28,30,.74)   blur 40  saturate 180%  border .5px rgba(255,255,255,.12)
toast               rgba(44,44,48,.92)   blur 30  saturate 180%  border .5px rgba(255,255,255,.16)
control fill        rgba(120,120,128,.24)     segmented track, secondary buttons
control selected    rgba(120,120,128,.34)     selected segment, active tab pill
control fill alt    rgba(120,120,128,.28) / .30 / .32   inputs, avatars, chips
code block          rgba(0,0,0,.42)      border .5px rgba(255,255,255,.09)
hairline            rgba(255,255,255,.08)     row dividers
grid line           rgba(255,255,255,.07)     chart gridlines

TEXT
primary             #FFFFFF
secondary           rgba(235,235,245,.60)
tertiary            rgba(235,235,245,.45)
quaternary          rgba(235,235,245,.35)
disabled            rgba(235,235,245,.30)
chart label         rgba(235,235,245,.55)   (10px — do not go below this opacity at this size)

ACCENT — ours, not Apple's
accent fill         #7B61FF   primary buttons, active tab icon+label, chat bubble (mine),
                              send button, progress bars, invite code border
accent text         #A594FF   links, "Copy invite", tab label, streak callout, code text
accent selected     rgba(123,97,255,.26) fill / rgba(123,97,255,.60) border   (reaction chip on)
  NOTE: this is the app's existing indigo #6366F1 pushed brighter for OLED.
  Apple Fitness lime (#B8FF3C) was deliberately removed everywhere — do not reintroduce it.

RINGS (data colors — one hue per metric, never decorative)
volume              #FA114F     track rgba(250,17,79,.22)
difficulty          #A2F73D     track rgba(162,247,61,.22)
streak              #00D3F2     track rgba(0,211,242,.22)

DIFFICULTY (problem chips + coverage state)
easy                #A2F73D     chip bg rgba(162,247,61,.12)  border rgba(162,247,61,.40)
medium              #FFD426     chip bg rgba(255,212,38,.12)  border rgba(255,212,38,.40)
hard                #FA114F     chip bg rgba(250,17,79,.12)   border rgba(250,17,79,.40)

MISC
streak orange       #FF9F0A     day-streak stat
gem sapphire        #3B82F6     + #CDE6FF / #7EAEFB / #2A56A8 facets — keep src/ranks/ranks-data.ts as-is
heatmap ramp        rgba(255,255,255,.055) → rgba(123,97,255,.32) → .58 → .82 → #A594FF
```

### Glass recipe (React Native)

`backdrop-filter` has no RN equivalent. Every surface above becomes:

```tsx
<BlurView intensity={40} tint="dark" style={{ borderRadius: 28, overflow: 'hidden' }}>
  <View style={{ backgroundColor: 'rgba(28,28,30,0.45)', borderWidth: 0.5,
                 borderColor: 'rgba(255,255,255,0.10)', borderRadius: 28, padding: 20 }}>
    {children}
  </View>
</BlurView>
```

Map `blur(Npx) saturate(180%)` → `intensity ≈ N` (34 → 40, 50 → 60, 40 → 45). Lower the solid `backgroundColor` alpha by ~0.15 vs. the web value, because `BlurView` already darkens. On Android `BlurView` is weaker — accept a slightly more opaque card there rather than shipping a hard fallback.

### Typography — SF Pro (system default, `-apple-system`)

| Role | Size / weight / tracking | Example |
| --- | --- | --- |
| Large title | 34 / 800 / -1.3 | "Summary", "Practice", "You" |
| Onboarding title | 33 / 800 / -1.3, line-height 1.08 | "Connect LeetCode" |
| Onboarding title (goal) | 30 / 800 / -1.1, line-height 1.1 | "Weekly Volume Goal" |
| Hero display | 44 / 800 / -2.0, line-height 1.02 | "Close your rings." |
| Sheet title | 27 / 700 / -0.9 | "Activity Rings", "Topic Coverage" |
| Screen subtitle | 30 / 800 / -1.1 | "Grind Squad" |
| Card title | 19–20 / 700 / -0.4 | "Activity Rings", "Trends", "Awards" |
| Problem title | 22 / 700 / -0.7, line-height 1.2 | "Longest Repeating…" |
| Body | 16 / 400, line-height 1.45 | onboarding copy |
| Body (list row) | 15.5–16 / 500–600 | topic names, trend labels |
| Secondary body | 13.5 / 400, line-height 1.5 | card explanations |
| Caption | 12–13 / 400 | "Thursday, Aug 15", metadata |
| Micro-label | 11.5 / 600 / +0.6, UPPERCASE | "NEXT UP · PICKED FOR YOU", "WEAKEST AREA" |
| Chart label | 10 / 600 / -0.1 | bar-chart axis labels |
| Ring legend value | 21 / 600 / -0.6 | "6/10" |
| Ring legend unit | 12 / 700 / +0.2, UPPERCASE | "SOLVED", "MED+", "DAYS" |
| Goal numeral | 74 / 600 / -3.5 | the stepper number |
| Stat numeral | 26–30 / 600–700 / -0.8 to -1.0 | streak, weeks, points |
| Tab label | 10 / 600 | "Summary" |
| Button label | 17 / 600 (primary), 16 / 600 (inline) | |

Use `fontVariant: ['tabular-nums']` on every changing numeral (ring legend, goal stepper, standings) so digits don't jitter.

### Radius, spacing, stroke

```
radius   9  chips / difficulty pills
        11  segmented control track (inner segments 9)
        16  small icon squares
        20  code block, small glass card, chat bubble
        22  input, small card, invite code box
     26–28  standard card  (28 for the big four on Summary)
     24–28  pill button (28 = full-round on a 56px button)
     31–32  floating tab bar (item pill 27)
        34  bottom sheet top corners
       999  avatars, circular buttons

spacing  screen h-padding 20 (onboarding 22)
         card padding 20 (sheet 22)
         card→card gap 12–14
         section gap 24
         row v-padding 10–13 with .5px hairline between
         content bottom padding 120 (clears the floating tab bar)

stroke   main rings 20 (viewBox 220)   day rings 5 (viewBox 60)
         crew/standing rings 4          pathway rings 5
         continue ring 6                hairlines 0.5–1
```

### Motion

| Name | Spec | Applies to |
| --- | --- | --- |
| `fadeUp` | 380ms `cubic-bezier(.22,1,.36,1)`, translateY 16→0, opacity 0→1 | every screen/tab enter |
| `sheetUp` | 380ms `cubic-bezier(.22,1,.36,1)`, translateY 100%→0 | bottom sheets |
| ring fill | 900ms `cubic-bezier(.32,.94,.28,1)` on `strokeDasharray` | all rings, on mount + on value change |
| `radarIn` | 850ms `cubic-bezier(.22,1,.36,1)`, scale .05→1 from center | radar polygon + dots |
| `growUp` | 700ms `cubic-bezier(.22,1,.36,1)`, scaleY 0→1, origin bottom | every bar chart |
| `tipIn` | 500ms `cubic-bezier(.22,1,.36,1)`, scale 0→1 | ring arrow button |
| `pop` | 420ms, scale .6→1.12→1 + opacity | LeetCode verified checkmark |
| `toastIn` | 2700ms total: in 12%, hold, out — translateY 20→0→-10 | toast |
| tap feedback | 140ms `cubic-bezier(.22,1,.36,1)`, opacity→.55, scale→.97 | every tappable |
| radar morph | 700ms `cubic-bezier(.22,1,.36,1)` on polygon `points` | when a solve grows an axis |
| progress bar | 800ms `cubic-bezier(.22,1,.36,1)` on width | gem progress, topic rows |

In RN: `Pressable` with `style={({pressed}) => [s.x, pressed && {opacity:.55, transform:[{scale:.97}]}]}` for tap feedback; Reanimated `withTiming(v, {duration, easing: Easing.bezier(.22,1,.36,1)})` for the rest. Ring fills animate `strokeDashoffset` on an `AnimatedPath`/`AnimatedCircle`.

---

## 2. The ring model (read this before building anything)

Three rings, one metric each, resetting every Monday. This replaces the old single `weekly_quota` bar.

| Ring | Metric | Default goal | Color |
| --- | --- | --- | --- |
| Outer | **Volume** — problems solved this week | user-set, 3–21, default 10 | `#FA114F` |
| Middle | **Difficulty** — medium-or-harder solved this week | `round(volumeGoal × 0.30)` | `#A2F73D` |
| Inner | **Streak** — distinct days solved this week | `min(7, max(2, round(volumeGoal × 0.45)))` | `#00D3F2` |

Geometry (canonical — use these exact numbers):

```
viewBox   0 0 220 220        center 110,110      group transform rotate(-90 110 110)
radii     outer 94   middle 70   inner 46
stroke    20, round caps
dash      strokeDasharray = `${C * clamp(p,0,1)} ${C}`   where C = 2πr
          C_outer = 590.6   C_middle = 439.8   C_inner = 289.0
sizes     Summary card 158px · sheet 196px · welcome 210px
```

**Arrow tip** — a 32px circle (36px in the sheet) in `#FA114F` with a black arrow glyph, positioned on the outer ring at the current progress point:

```
angle = (-90 + 360 × clamp(volumeProgress,0,1)) × π/180
left  = 50% + (94/220 × 100) × cos(angle)      // → percentage of the ring box
top   = 50% + (94/220 × 100) × sin(angle)
transform: translate(-50%,-50%)
shadow: 0 4px 14px rgba(250,17,79,.5)
```

Tapping it opens the recommended problem. It enters with `tipIn`.

**Day rings** (week strip, 38px, viewBox 60): three concentric arcs, radii 25 / 18.5 / 12, stroke 5 — same three metrics scoped to that day (day targets: 3 solves / 2 med+ / 1 day). Today's day letter sits in a 20px `#FA114F` filled pill; other days show the letter at `rgba(235,235,245,.45)` with no pill.

---

## 3. Screens

### 3.1 Welcome — replaces the hero half of `app/(auth)/sign-in.tsx`

- Full-bleed black, centered column, 34px h-padding.
- 210px tri-ring at 85% / 70% / 62% (decorative, static).
- Title "Close your rings." — 44/800/-2.0, two lines.
- Subtitle "Volume, difficulty, consistency. / Three rings, one habit, your crew watching." — 17/400, line-height 1.5, `rgba(235,235,245,.6)`, centered.
- Footer, 22px padding, 40px bottom inset: primary pill "Get Started" (56px, radius 28, `#7B61FF`, white 17/600) then a 54px text button "I already have an account" in `#A594FF` 16/400.
- **The password wall moves to after the LeetCode import.** "I already have an account" goes to sign-in; "Get Started" goes to step 1 of onboarding and only asks for credentials at the end.

### 3.2 Connect LeetCode (step 1 of 4) — rewrite of `app/(auth)/onboarding.tsx`

- Header row: 32px circular back button (`rgba(120,120,128,.28)`), a 4px progress track (`rgba(120,120,128,.30)`, fill `#7B61FF`, width 25%, animates 450ms), and "1 of 4" at 13/600 tertiary.
- Title 33/800/-1.3. Body: "We read your public solve history, so you never log a problem by hand." 16/400/1.45 secondary.
- Input row: glass card radius 22, min-height 60, `padding: 5px 5px 5px 18px`. Static prefix "leetcode.com/u/" 16/400 at `rgba(235,235,245,.32)`, then a borderless text input 16/600 white. On valid handle a 36px `#A2F73D` circle with a dark checkmark appears with `pop`.
- On success: a `fadeUp` block — a green dot + "Found — 312 problems solved" (13.5/500 `#A2F73D`), then a glass card containing a 14-bar sparkline (74px tall, 5px gap, bars `#A2F73D` at 3 opacity levels by value, `growUp`), a hairline, then three columns Easy/Medium/Hard with 27/700/-0.8 numerals in the difficulty colors.
- CTA is **two explicit states, not one interpolated style** (a mid-value style interpolation failed to update in the prototype): enabled = `#7B61FF` + white label; disabled = `rgba(120,120,128,.28)` + `rgba(235,235,245,.4)` label. Below it a "Skip for now" text button — **skipping must be allowed.** The old screen hard-gated on a verified handle; that gate is removed.
- Verification calls the existing LeetCode GraphQL `matchedUser` query already in `onboarding.tsx`, but **debounced (~600ms) on typing** — the manual "Verify" button is gone.

### 3.3 Weekly Volume Goal (step 2 of 4) — new screen

- Title 30/800/-1.1 "Weekly Volume Goal". Body: "Set a goal based on how much you solve now, or how much you'd like to."
- **Segmented control**: track `rgba(120,120,128,.24)` radius 11 padding 2; segments radius 9, 8px v-padding, 14/600 white; selected segment `rgba(120,120,128,.34)` + `0 1px 3px rgba(0,0,0,.35)`. Options: Lightly / Moderately / Highly.
- **Stepper**, 52px below: two 62px circles in `#FA114F` (− and +, 26px white glyphs, stroke-width 3.2) flanking the numeral 74/600/-3.5 with the label "PROBLEMS/WEEK" at 14/700 white beneath.
- Range 3–21. Derived rows in a glass card (radius 24, 4px/18px padding): an `#A2F73D` dot + "At least {N} mediums" with "Difficulty ring" on the right; a `#00D3F2` dot + "Solve on {N}+ days" with "Streak ring". Both derive live from the volume goal.
- Footer note: "Rings reset Monday. Adjust any time." 13.5/400 quaternary, centered.
- CTA "Set Weekly Goal" — secondary style: `rgba(120,120,128,.30)` fill, `#A594FF` label.
- **Gotcha, learned the hard way:** the goal must be a single source of truth in local state. If you also expose it as a prop/config with a default, the default will shadow the state and the stepper will silently do nothing.

### 3.4 Find your crew (step 3 of 4) — replaces `app/group/create.tsx` + `join.tsx` entry

- Title "Find your crew". Body: "People who grind alone quit in 11 days. People in a crew last 4 months."
- Two glass action rows (radius 24, 18px padding, 16px gap): 52px circular icon (`#A2F73D` with a dark plus / `#00D3F2` with a dark `#`), title 17/600, subtitle 13.5/400 secondary, 15px chevron at `rgba(235,235,245,.3)`.
- "OPEN CREWS NEAR YOUR LEVEL" micro-label, then a glass card of rows: 42px rounded-square avatar in a solid accent, name 15.5/600, "5 members · 210 avg pts" 12.5/400, and a "Join" chip (`rgba(120,120,128,.30)`, radius 16, `#A594FF` 13.5/600).
- Footer "Solo for now" text button — crew is optional.
- Backend: open-crew discovery is **new** (see §6).

### 3.5 Notifications (step 4 of 4) — new screen

Recreates the iOS permission moment *before* triggering the real one, which roughly doubles opt-in:

- A 266px-wide faux lock screen: `rgba(44,44,46,.55)` blur 20, radius 30, `34px 14px 92px` padding, a "9:41" at 58/200/-2 in `rgba(235,235,245,.22)`, and a notification stub — 34px black app-icon tile containing a mini two-ring mark, plus three grey text bars.
- Overlapping it, offset `left:-6 right:-6 bottom:-14`: the alert — `rgba(58,58,60,.82)` blur 34 saturate 180%, radius 26, shadow `0 20px 50px rgba(0,0,0,.6)`. Title 17/600 centered: `"LeetAI" Would Like to Send You Notifications`. Body 13/400 secondary: "Crew activity, your Sunday check-in, and a heads-up when your streak is at risk." Two buttons split by hairlines: "Don't Allow" 17/400 / "Allow" 17/600, both `#A594FF`.
- Caption below: "Notifications help you close your rings, cheer on your crew, and keep a streak alive."
- Outlined CTA "Continue" (`.5px rgba(255,255,255,.16)`, `#A594FF` label). Tapping Allow → call the real `expo-notifications` request via existing `src/lib/push.ts`.

### 3.6 Summary — **replaces `app/(tabs)/feed.tsx` as the home tab**

Scrolls; 20px h-padding; 120px bottom padding. Order:

1. **Header** — "Summary" 34/800/-1.3 with "Thursday, Aug 15" 15/400 secondary beneath; 38px avatar chip top-right (`rgba(120,120,128,.30)`, `.5px` border) → You tab.
2. **Week strip** — 7 columns, 5px gap: day pill (20px) above a 38px tri-ring. Tappable per day.
3. **Activity Rings card** — title row with a 26px circular chevron (`rgba(120,120,128,.34)`) → ring sheet. Body: 158px tri-ring + arrow tip on the left, 16px gap, then three legend blocks (13px gap): metric name 14/400 at `rgba(235,235,245,.85)`, then `{value}/{goal}` 21/600/-0.6 in the ring color with the unit at 12/700 uppercase.
4. **Topic Coverage card** (the radar — see §4).
5. **Next up card** — micro-label with a `#FFD426` dot; problem title 22/700/-0.7; three chips (difficulty tinted, then two `rgba(120,120,128,.26)` chips for tag and estimate); a one-line reason 13.5/400/1.5; then a row: full-width `#7B61FF` "Start" pill (48px, radius 24) + a 48px circular reroll button with a rotate-arrow glyph.
6. **Trends card** — title + "vs 90-day average" 13/400 tertiary. Rows (12px v-padding, hairline between): a 30px circular tinted badge holding an up/down arrow (`#A2F73D` up / `#FF9F0A` down, `rotate(180deg)` for down), label 15.5/500, current value 17/700 in the trend color, 90-day average 13/400 at `rgba(235,235,245,.35)` right-aligned in a 34px column. Rows: Solves/week 6.4 vs 4.1 ↑, Medium share 41% vs 32% ↑, Hard share 6% vs 11% ↓, Active days 4.2 vs 3.1 ↑.
7. **Sharing** — section title 20/700/-0.5 + crew name link. A row of 56px avatars, each ringed by that member's volume progress in `#FA114F`, name 11/500 beneath.

### 3.7 Practice — **replaces `app/(tabs)/pathways.tsx`** and makes it reachable

- "Practice" large title; segmented control Pathways / Blind 75 / Saved.
- **Continue card**: `#FFD426`-bordered glass, micro-label "CONTINUE", topic name 20/700/-0.5, "4 of 17 · 3 to unlock Intervals" 13.5/400, and a 54px ring with the percentage as centered SVG text 14/700.
- **Topic list** in one glass card: 40px ring (r 25, stroke 5), name 16/600/-0.2, "61 of 148" 12.5/400 tertiary, percentage 14/700 in the ring color. Locked rows render at `opacity .42` with the unlock condition as the subtitle and a grey ring — visible, not hidden.
- **Ring color = coverage state**, reusing the difficulty ramp: `≥40% → #A2F73D`, `≥25% → #FFD426`, else `#FA114F`.
- 🔴 **Fix the data bug while you're here.** `pathways.tsx` currently queries tag strings (`'Arrays'`, `'Trees'`, `'Hashing'`) that do not exist in the seeded catalog (`'Array / String'`, `'Binary Tree - DFS'`, `'Hash Map / Set'` — see `supabase/migrations/0011_reseed_problems_lc75.sql`). Every pathway reads 0/0 today. Use the seeded strings; the prototype's labels are the seeded ones verbatim.
- The 15 hardcoded emoji icons are **deleted** — rings replace them.

### 3.8 Crew — replaces `app/(tabs)/group.tsx`, absorbs `leaderboard.tsx`

- Header: crew name 30/800/-1.1 + "5 members · week 12"; 34px circular overflow button (invite / switch crew / leave).
- **Standings card** — the old standings modal, now always visible. Rows: rank numeral 15/700 (leader `#FFD426`, you white, rest tertiary), 40px avatar ringed by that member's volume progress, name 15/600 (you in `#A594FF`), status line 12/400, and **completion percentage** 17/700/-0.4 right-aligned.
  - ⚠️ **Rank on ring completion, not raw points.** A member on a 5/week goal can out-rank one on 15/week by being more disciplined. This replaces the current points sort and fixes the fairness problem where a high quota is strictly better.
- "ACTIVITY" hairline divider, then the merged chat + milestone feed (keep the existing merge of `group_messages` and hard solves — it's the best idea in the current app).
- **Milestone card**: `linear-gradient(150deg, rgba(250,17,79,.18), rgba(250,17,79,.04))`, `.5px rgba(250,17,79,.32)` border, radius 24. A 40px filled tri-ring as the icon, micro-label "RINGS CLOSED · HARD CLEARED" in `#FA114F`, then the sentence 15/600/1.35. Below: **reaction chips** — 🔥 💀 👏, radius 16, `rgba(120,120,128,.28)`; selected becomes `rgba(123,97,255,.26)` with a `rgba(123,97,255,.60)` border and the count increments. **This is new and it is the point** — the current feed is read-only, so there is no loop.
- Chat bubbles: theirs `rgba(120,120,128,.30)`, mine `#7B61FF` with white text, radius 20, `9px 15px` padding. Input `rgba(120,120,128,.26)` radius 22 + 38px `#7B61FF` send button.
- ⚠️ `fetchMyGroup` currently does `.limit(1).maybeSingle()` — one crew per user. Support multiple and put the switcher in the overflow menu.

### 3.9 You — replaces `app/(tabs)/profile.tsx`

The old screen is eight stacked sections plus settings. New order:

1. **Header** "You" + 34px circular gear → settings sheet. **All account rows move into that sheet** (email, password, reset, sign out). They must not live in the scroll.
2. **Gem card** — `linear-gradient(150deg, rgba(59,130,246,.20), rgba(59,130,246,.03))`, `.5px rgba(59,130,246,.30)` border, radius 28. 74px gem with `drop-shadow(0 6px 18px rgba(59,130,246,.55))`, rank name 24/700/-0.7, "{n} solved · {m} to Amethyst" 13.5/400, and a 5px progress bar in `#3B82F6`.
   - ⚠️ **One rank system only.** Keep `RANKS` from `src/ranks/ranks-data.ts` (9 gems). **Delete `TIERS` from `profile.tsx` and `POWER_RANKS` from `log.tsx`** — all three are driven by the same solve count, and `profile.tsx` already computes `tier`/`nextTier`/`tierProgress`/`toNext` and never renders them.
3. **Meme tier row** (optional, default on, toggled in settings): "🍟 Also known as **Cracked**" — the meme tiers survive as flavor, not as a system.
4. **Three stat tiles** — 12/500 label, 30/700/-1.0 numeral: day streak `#FF9F0A`, weeks closed `#A2F73D`, freezes white.
5. **Weakest area card** — micro-label with a `#FA114F` dot; topic 20/700/-0.5; a plain-language verdict 13.5/400/1.5 ("9 of 44. The only topic below your crew's median. Three problems would close the gap."); the coverage bar chart (§5); then a secondary "Build a Graphs plan" button. **Lead with the verdict, then the evidence** — the current Insights screen shows a radar, a heatmap, 24 tag bars and a power meter and never says what to do.
6. **Awards card** — "4 of 6" in the title row; a 3-column grid, 16px/10px gap. Each award is a 62px circle, `1.5px` border, `{color}26` fill, big value 20/700/-0.6, label 11/500/1.25 centered. Locked awards render at `opacity .34` with `rgba(120,120,128,.16)` fill.
7. **Solve History card** — the GitHub-style heatmap (§5).
8. **Weeks closed · last 12** — twelve 49px double-ring glyphs (r 25 volume + r 17 difficulty, stroke 5). A fully closed week is a solid double ring; a bad week is a stub. Same information as the heatmap in the app's own language — keep both; the heatmap answers "did I show up", the ring grid answers "did I close it".

### 3.10 Floating tab bar — replaces `app/(tabs)/_layout.tsx` tab bar

- Absolutely positioned: `left/right: 16, bottom: 22`, height 64, radius 32, 5px padding. Glass per token table.
- Four equal items, each a 54px radius-27 pill: 24px icon above a 10/600 label. Active item gets a `rgba(120,120,128,.34)` pill and `#A594FF` icon+label (250ms background transition); inactive `rgba(235,235,245,.45)`.
- Icons: **Summary** = a single ring arc (`stroke-dasharray 130 145` on r 23 in a 60 viewBox), **Practice** = code brackets `M9 6.5 4 12l5 5.5 M15 6.5 20 12l-5 5.5`, **Crew** = two filled person shapes, **You** = one filled person.
- Tabs: `Summary · Practice · Crew · You`. That's four, down from four visible + two unreachable. Implement with a custom `tabBar` prop on expo-router's `<Tabs>`; content needs 120px bottom padding.
- 🔴 **No `href: null` screens.** `leaderboard` and `pathways` are currently unreachable dead UI (~570 lines). Leaderboard becomes the top of Crew; Pathways becomes Practice.

### 3.11 Sheets

All share: overlay `rgba(0,0,0,.55)` + blur 4 (`fadeIn` 280ms), panel `rgba(30,30,34,.90)` blur 50 saturate 180%, top radius 34, `12px 22px 38px` padding, a 38×5 grab handle at `rgba(255,255,255,.22)`, `sheetUp` entry, `maxHeight 90%`.

- **Problem sheet** — difficulty/tag/time chips; title 27/700/-0.9; "THE APPROACH" micro-label; the idea in prose 15/400/1.6; a monospace code block (12/1.7, `rgba(0,0,0,.42)`, radius 20); primary "Mark as Solved"; text button "Open in LeetCode". Marking solved increments volume (+difficulty when med/hard), bumps the day count, **and grows that topic's radar axis**.
- **Ring detail sheet** — "Activity Rings" + "Week 12"; a 196px tri-ring with the arrow tip; three progress rows (label 15/400, `{a}/{b}` 20/600/-0.5 + unit 11.5/700, 6px bar); "SOLVES BY DAY" with a 96px bar chart (9px bars radius 5, three gridlines plus a **dotted `rgba(250,17,79,.55)` goal line** at the bottom, day letters beneath with today in `#FA114F`); "TOTAL 6 SOLVED" 12/700 uppercase in `#FA114F`; a three-up stat row (Points / Attempts / Avg time, 26/600/-0.8); primary "Add to Your Rings".
  - Bar heights are percentages of the chart box — the bar's wrapper needs an explicit full height and `align-items: flex-end`, or percentage heights resolve to zero.
- **Topic Coverage sheet** — title + "148 of 519 problems across 24 topics"; a This week / This month / All time segmented control; then all 8+ topics **sorted by coverage descending**: name 15.5/500, "61 of 148" 13/400 tertiary, percentage 16/700 in the state color, and a 6px bar that animates 800ms.
- **Invite sheet** — code in a dashed `rgba(123,97,255,.50)` box, radius 22, `GRND-4K2` at 32/700 monospace `#A594FF`, letter-spacing 4; primary "Copy Invite Link" → toast.
- **Settings sheet** — one glass list: Weekly goal, LeetCode handle, Notifications, Meme tier names, Email, Sign out (`#FA114F`). Rows 15px v-padding, hairline between, value right-aligned in tertiary.

### 3.12 Toast

`left/right: 20, bottom: 98`, radius 22, `14px 18px`; a 26px `#A2F73D` circle with a dark check + message 14.5/500. Auto-dismisses on the `toastIn` curve (~2.7s). Fires on solve, reroll, copy, and locked-row taps. **Every `Alert.alert` in the current code becomes either this toast or inline state** — the app currently uses `Alert.alert` for ~15 different messages including validation errors.

---

## 4. The Topic Coverage radar

Your `RadarChart.tsx` / `log.tsx` octagon, restyled. It is the one chart that carries real diagnostic value, so it moved from a buried Insights screen onto the home tab.

```
viewBox 0 0 290 250     center (145,122)     maxR 88     8 axes at -90° + i×45°
axis order  Arrays · Hash Map · Trees · Graphs · Dyn Prog · Bin Search · Stack · 2 Ptr
            (map to seeded tags: Array / String · Hash Map / Set · Binary Tree - DFS ·
             Graphs - DFS · DP - 1D · Binary Search · Stack · Two Pointers)

value       v = clamp(solved / total / 0.55, 0.04, 1)
            the 0.55 divisor means "55% coverage of a topic is a full axis" — it stops
            every real user from rendering as a tiny dot. It replaces the hardcoded
            RADAR_TARGET guesses in log.tsx.

glow        radial gradient circle r 94, #A2F73D .16 → transparent
grid        4 octagons at 25/50/75/100%, stroke rgba(255,255,255,.09) 1px
spokes      8 lines center→edge, stroke rgba(255,255,255,.07) 1px
fill        linearGradient (0,0)→(1,1): #A2F73D .50 → #00D3F2 .35
stroke      #A2F73D 2.4px, round joins
vertices    3.4px dots, colored by value: <.35 #FA114F · <.60 #FFD426 · else #A2F73D
labels      10.5/600, letter-spacing .2, at maxR+21, anchored start/middle/end by
            cos(angle) >.3 / between / <-.3.  Color rgba(235,235,245,.72), or #FA114F
            when that axis is below .35 — the weak axes name themselves.
crew median dashed polygon (stroke-dasharray 3 4) rgba(255,255,255,.32) 1.5px,
            fill rgba(255,255,255,.05), toggled by the "Compare crew" chip
entry       radarIn (scale from center), transform-origin = the center point
callout     below the legend, above a hairline: a #FA114F dot +
            "Thinnest axis — {topic} at {n}%"
```

⚠️ **The compare chip is nested inside a tappable card.** Its handler must `stopPropagation()`, or tapping it also opens the sheet and the toggle looks broken. In RN, `onStartShouldSetResponder`/`onPress` on the inner `Pressable` already captures — but verify, and don't wrap the card in a single `Pressable` that swallows children.

## 5. The two other charts

**Coverage-by-topic bars** (You → Weakest area). 12 bars, 5px gap, 92px box, radius `4 4 2 2`. The subject topic (`Gph`) is `#FA114F` at full strength with its label in `#FA114F`; every other bar is muted — `rgba(250,17,79,.45)` under 25%, `rgba(255,212,38,.60)` under 50%, `rgba(162,247,61,.55)` above. A **dashed `rgba(255,255,255,.28)` crew-median line at `bottom: 34%`** with the header row "COVERAGE BY TOPIC" / "Crew median 34%". Labels 10/600 at `rgba(235,235,245,.55)` — do not go dimmer or smaller; at 9px/.32 it fails contrast.

**Solve History heatmap** (You). GitHub's contribution grid in our accent ramp. 18 columns × 7 rows, 14px cells, radius 3, 3px gaps. Month labels beneath (Apr–Aug), then a hairline, then a `Less ▢▢▢▢▢ More` legend using the 5-step ramp, with "12-day streak" in `#A594FF` right-aligned. Data source: `solves.solved_date` grouped by day (the query already exists as `fetchHeatmapData` in `log.tsx`, and `lcCalendar` merges LeetCode's own calendar — keep that merge, LeetCode is the better source).

## 6. State & backend

### Client state (per screen)

| State | Type | Notes |
| --- | --- | --- |
| `step` | 0–5 | onboarding position; persist so a killed app resumes |
| `tab` | today \| practice \| crew \| you | |
| `lcName`, `lcValid` | string, bool | debounced GraphQL check |
| `goal` | int 3–21 | **local state is the source of truth**; med/day goals derive |
| `solved`, `meds`, `days` | int | current week; from `solves` |
| `sheet` | null \| problem \| ring \| topics \| invite \| settings | |
| `compare` | bool | radar crew overlay |
| `tRange` | week \| month \| all | topic sheet range |
| `draft`, `msgs` | string, list | chat |
| `reactions` | map | optimistic, then reconcile |
| `toast` | string \| null | ~2.7s auto-clear; clear the timer on unmount |

### Schema work

Existing and reusable: `profiles`, `solves` (`points`, `source`, `solved_at`, `solved_date`), `problems` (`slug`, `title`, `difficulty`, `tags[]`, `is_premium`), `groups` (`invite_code`, `weekly_quota`), `group_members`, `group_messages`, `streaks` (`current_days`, `longest_days`, `current_weeks`, `longest_weeks`, `freezes_available`), `weekly_stats`, RPCs `join_group_by_code` / `leave_group`, and the `leetcode-sync` / `notify-*` edge functions.

New migrations needed:

1. **Personal ring goals** — `profiles.volume_goal int default 10`, plus `difficulty_goal` and `days_goal` (store them, don't only derive, so a user can override).
2. **Per-week ring history** — extend `weekly_stats` with `volume`, `med_plus`, `active_days` and the goals in force that week, so the 12-week ring grid and "9 of 12 weeks closed" are a query, not a computation over all solves.
3. **Reactions** — `solve_reactions(solve_id, user_id, emoji)` with a unique constraint on the triple, plus RLS limiting inserts to crew peers.
4. **Multi-crew** — no schema change; remove the `.limit(1)` and add a `profiles.active_group_id` for which crew Crew opens on.
5. **Open-crew discovery** — `groups.is_open bool default false` + an average-points view, for the "Open crews near your level" list.
6. **Awards** — derive from `weekly_stats` + `streaks` in a view rather than a table; nothing here needs to be authored by hand.
7. **Trends** — a view over `solves` giving this-week vs trailing-90-day averages for solves/week, medium share, hard share, active days.

### Deletions

- `TIERS` (`app/(tabs)/profile.tsx`) and `POWER_RANKS` (`app/(tabs)/log.tsx`) — dead parallel rank systems.
- The `PATHWAYS` emoji icons array (`app/(tabs)/pathways.tsx`).
- The `href: null` entries in `app/(tabs)/_layout.tsx`.
- The manual "Verify" button flow in onboarding.
- Every `Alert.alert` used for validation or confirmation.
- `src/theme.ts` in its current form — it is replaced by the token table in §1. Keep the file, rewrite its contents.

## 7. Files in this bundle

```
screenshots/                    ← 780×1688 (2x) captures of every screen
  01-welcome.png                  onboarding: hero + tri-ring
  02-connect-leetcode.png         handle entered, import result shown
  03-weekly-goal.png              segmented control + stepper + derived rings
  04-find-crew.png                create / join / open-crew discovery
  05-notifications.png            faux lock screen + permission alert
  06-summary-top.png              header, week strip, Activity Rings, radar
  07-summary-radar.png            radar with crew-median overlay + legend
  08-summary-trends.png           Next up, Trends, Sharing
  09-sheet-ring-detail.png        big ring + progress rows + solves-by-day
  10-sheet-topic-coverage.png     ranked topic list + range segmented control
  11-practice.png                 Continue card + topic rings, locked rows
  12-crew.png                     standings on completion % + reactions + chat
  13-you-top.png                  gem, stats, weakest area + coverage bars
  14-you-awards-heatmap.png       Awards grid, Solve History heatmap, ring grid

prototypes/
  LeetAI Prototype v2.dc.html   ← the design to build. Clickable: onboarding → all four
                                   tabs → all five sheets. Needs support.js beside it.
  support.js                    ← runtime for the prototypes (not for your app)
  LeetAI Redesign.dc.html       ← 5 turns of alternate directions + per-screen rationale
  LeetAI Audit.dc.html          ← the current app recreated + annotated critique
```

Source files in the app that each screen replaces are named inline in §3.

## 8. Assets

No image or font assets. Everything is system type (SF Pro), vector, or CSS. Icons in the prototype are hand-authored inline SVG paths — the distinctive ones (tab bar, ring arrow, reroll, code brackets) have their `d` attributes given in §3; for the generic ones use the existing `@expo/vector-icons` Ionicons already in the app. The gem art comes from your `src/ranks/GemBadge.tsx` / `GemChip.tsx` and is unchanged — the prototype's four-facet diamond is a simplification of it, so use the real component.

## 9. Suggested build order

1. Rewrite `src/theme.ts` from §1; build a `<GlassCard>`, `<Ring>` (three-arc + arrow tip), `<Segmented>`, `<Sheet>`, `<Toast>` and the custom tab bar. Everything else composes from these six.
2. Ship **Summary** with the ring model + goal migration. This is the change that matters; the rest is downstream.
3. **You** (with settings extracted, one rank system, the heatmap).
4. **Practice** — and fix the tag mismatch, which un-breaks a screen nobody has ever seen working.
5. **Crew** — standings on top, reactions, multi-crew.
6. **Onboarding** — five steps, skippable, credentials last.
7. Sheets and Trends/Awards last.
