import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/stores/auth';
import { registerForPushNotifications } from '@/lib/push';
import { Sheet } from '@/components/Sheet';
import { PillButton } from '@/components/PillButton';
import {
  colors,
  deriveGoals,
  pressed,
  radius,
  tabular,
  type,
} from '@/theme';

/* The new columns / RPCs (migrations 0020+) are not in src/types/database.ts,
   which is a shared file this screen does not own. Route those calls through an
   untyped handle rather than editing the shared type. */
const sb = supabase as any;

type Panel = 'goal' | 'handle' | 'email' | 'password' | null;

export interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  email: string;
  /** `profiles.leetcode_username` */
  leetcodeHandle: string | null;
  /** `profiles.volume_goal`, 3–21. */
  volumeGoal: number;
  notifications: boolean;
  onNotificationsChange: (v: boolean) => void;
  /** Called after a write lands so the screen can invalidate its queries. */
  onSaved?: (message: string) => void;
}

/**
 * §3.11 Settings sheet — one glass list: Weekly goal, LeetCode handle,
 * Notifications, Email, Password, Reset, Sign out (#FA114F).
 * Rows 15px v-padding, hairline between, value right-aligned in tertiary.
 *
 * Every account row from the old profile.tsx lives here; none of them are in
 * the You scroll. No `Alert.alert` — feedback is inline status text (the sheet
 * is a Modal, so a screen-level toast would render behind it).
 */
export function SettingsSheet({
  visible,
  onClose,
  email,
  leetcodeHandle,
  volumeGoal,
  notifications,
  onNotificationsChange,
  onSaved,
}: SettingsSheetProps) {
  const { session, signOut } = useAuth();
  const uid = session?.user.id;

  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; bad?: boolean } | null>(null);

  /* goal is a single source of truth in local state while the panel is open —
     §3.3's gotcha: a prop default shadowing the state makes the stepper inert. */
  const [goal, setGoal] = useState(volumeGoal);
  const [handle, setHandle] = useState(leetcodeHandle ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');

  /* Seed from props only when the sheet opens. Re-seeding on every prop change
     would let a background profile refetch stomp what the user is typing —
     the same shadowing bug §3.3 warns about for the goal stepper. */
  useEffect(() => {
    if (!visible) return;
    setPanel(null);
    setStatus(null);
    setGoal(volumeGoal);
    setHandle(leetcodeHandle ?? '');
    setNewEmail('');
    setPw1('');
    setPw2('');

  }, [visible]);

  const derived = deriveGoals(goal);

  const openPanel = (p: Panel) => {
    setStatus(null);
    setPanel((cur) => (cur === p ? null : p));
  };

  const saveGoal = async () => {
    setBusy(true);
    const { error } = await sb.rpc('set_volume_goal', { p_volume: goal });
    if (error) {
      // migration 0020 may not be applied yet — fall back to a direct update
      const { error: e2 } = await sb
        .from('profiles')
        .update({
          volume_goal: goal,
          difficulty_goal: derived.difficulty,
          days_goal: derived.streak,
        })
        .eq('id', uid);
      setBusy(false);
      if (e2) return setStatus({ text: 'Could not save your goal.', bad: true });
    } else {
      setBusy(false);
    }
    setPanel(null);
    setStatus({ text: `Weekly goal set to ${goal}.` });
    onSaved?.(`Weekly goal set to ${goal}`);
  };

  const saveHandle = async () => {
    const val = handle.trim();
    if (val && !/^[a-zA-Z0-9_-]{1,40}$/.test(val)) {
      return setStatus({ text: 'Letters, numbers, _ and - only.', bad: true });
    }
    setBusy(true);
    const { error } = await sb
      .from('profiles')
      .update({ leetcode_username: val || null })
      .eq('id', uid);
    setBusy(false);
    if (error) return setStatus({ text: 'Could not save the handle.', bad: true });
    setPanel(null);
    setStatus({ text: 'LeetCode handle saved.' });
    onSaved?.('LeetCode handle saved');
  };

  const saveEmail = async () => {
    const val = newEmail.trim();
    if (!val.includes('@')) return setStatus({ text: 'Enter a valid email.', bad: true });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ email: val });
    setBusy(false);
    if (error) return setStatus({ text: error.message, bad: true });
    setPanel(null);
    setStatus({ text: `Confirmation sent to ${val}. Check both inboxes.` });
  };

  const savePassword = async () => {
    if (pw1.length < 6) return setStatus({ text: 'At least 6 characters.', bad: true });
    if (pw1 !== pw2) return setStatus({ text: 'Passwords do not match.', bad: true });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setBusy(false);
    if (error) return setStatus({ text: error.message, bad: true });
    setPanel(null);
    setPw1('');
    setPw2('');
    setStatus({ text: 'Password updated.' });
  };

  const sendReset = async () => {
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setBusy(false);
    setStatus(
      error
        ? { text: error.message, bad: true }
        : { text: `Reset link sent to ${email}.` },
    );
  };

  const toggleNotifications = async (next: boolean) => {
    onNotificationsChange(next);
    if (!next || !uid) return;
    const token = await registerForPushNotifications(uid);
    if (!token) {
      onNotificationsChange(false);
      setStatus({ text: 'Notifications are off in system settings.', bad: true });
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Settings">
      <View style={s.list}>
        <Row
          label="Weekly goal"
          value={`${goal}/week`}
          onPress={() => openPanel('goal')}
          open={panel === 'goal'}
          first
        />
        {panel === 'goal' ? (
          <View style={s.panel}>
            <View style={s.stepper}>
              <StepBtn sign="minus" onPress={() => setGoal((g) => Math.max(3, g - 1))} />
              <View style={s.stepperMid}>
                <Text style={s.goalNumeral}>{goal}</Text>
                <Text style={s.goalLabel}>PROBLEMS/WEEK</Text>
              </View>
              <StepBtn sign="plus" onPress={() => setGoal((g) => Math.min(21, g + 1))} />
            </View>
            <View style={s.derived}>
              <DerivedRow
                color={colors.difficulty}
                text={`At least ${derived.difficulty} mediums`}
                right="Difficulty ring"
              />
              <View style={s.hairline} />
              <DerivedRow
                color={colors.streak}
                text={`Solve on ${derived.streak}+ days`}
                right="Streak ring"
              />
            </View>
            <Text style={s.footnote}>Rings reset Monday. Adjust any time.</Text>
            <PanelButton label="Set Weekly Goal" onPress={saveGoal} busy={busy} />
          </View>
        ) : null}

        <Row
          label="LeetCode handle"
          value={leetcodeHandle ?? 'Not set'}
          onPress={() => openPanel('handle')}
          open={panel === 'handle'}
        />
        {panel === 'handle' ? (
          <View style={s.panel}>
            <View style={s.inputRow}>
              <Text style={s.inputPrefix}>leetcode.com/u/</Text>
              <TextInput
                style={s.input}
                value={handle}
                onChangeText={setHandle}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="yourhandle"
                placeholderTextColor={colors.textPlaceholder}
              />
            </View>
            <PanelButton label="Save handle" onPress={saveHandle} busy={busy} />
          </View>
        ) : null}

        <View style={s.hairline} />
        <View style={s.row}>
          <Text style={s.rowLabel}>Notifications</Text>
          <Switch
            value={notifications}
            onValueChange={toggleNotifications}
            trackColor={{ false: colors.control, true: colors.accent }}
            thumbColor="#FFFFFF"
          />
        </View>

        <Row
          label="Email"
          value={email}
          onPress={() => openPanel('email')}
          open={panel === 'email'}
        />
        {panel === 'email' ? (
          <View style={s.panel}>
            <TextInput
              style={[s.input, s.inputBox]}
              value={newEmail}
              onChangeText={setNewEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="new@email.com"
              placeholderTextColor={colors.textPlaceholder}
            />
            <PanelButton label="Send confirmation" onPress={saveEmail} busy={busy} />
          </View>
        ) : null}

        <Row
          label="Password"
          value="••••••••"
          onPress={() => openPanel('password')}
          open={panel === 'password'}
        />
        {panel === 'password' ? (
          <View style={s.panel}>
            <TextInput
              style={[s.input, s.inputBox]}
              value={pw1}
              onChangeText={setPw1}
              secureTextEntry
              placeholder="New password"
              placeholderTextColor={colors.textPlaceholder}
            />
            <TextInput
              style={[s.input, s.inputBox]}
              value={pw2}
              onChangeText={setPw2}
              secureTextEntry
              placeholder="Repeat password"
              placeholderTextColor={colors.textPlaceholder}
            />
            <PanelButton label="Update password" onPress={savePassword} busy={busy} />
          </View>
        ) : null}

        <Row label="Send password reset" value="" onPress={sendReset} />

        <View style={s.hairline} />
        <Pressable
          onPress={signOut}
          style={({ pressed: p }) => [s.row, p && pressed]}>
          <Text style={[s.rowLabel, { color: colors.hard }]}>Sign out</Text>
        </Pressable>
      </View>

      {status ? (
        <Text style={[s.status, status.bad && { color: colors.hard }]}>{status.text}</Text>
      ) : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */

function Row({
  label,
  value,
  onPress,
  open,
  first,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  open?: boolean;
  first?: boolean;
}) {
  return (
    <>
      {first ? null : <View style={s.hairline} />}
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        style={({ pressed: p }) => [s.row, p && pressed]}>
        <Text style={s.rowLabel}>{label}</Text>
        <View style={s.rowRight}>
          {value ? (
            <Text style={s.rowValue} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path
              d={open ? 'M6 15l6-6 6 6' : 'M9 5l7 7-7 7'}
              stroke={colors.textQuaternary}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        </View>
      </Pressable>
    </>
  );
}

function StepBtn({ sign, onPress }: { sign: 'plus' | 'minus'; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed: p }) => [s.stepBtn, p && pressed]}>
      <Svg width={22} height={22} viewBox="0 0 24 24">
        <Path
          d={sign === 'plus' ? 'M12 5v14M5 12h14' : 'M5 12h14'}
          stroke="#FFFFFF"
          strokeWidth={3.2}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}

function DerivedRow({ color, text, right }: { color: string; text: string; right: string }) {
  return (
    <View style={s.derivedRow}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={s.derivedText}>{text}</Text>
      <Text style={s.derivedRight}>{right}</Text>
    </View>
  );
}

function PanelButton({
  label,
  onPress,
  busy,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <View>
      <PillButton
        label={busy ? '' : label}
        variant="accent"
        disabled={!!busy}
        onPress={onPress}
      />
      {busy ? (
        <View style={s.panelBtnBusy} pointerEvents="none">
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  list: {
    backgroundColor: colors.cardSmall,
    borderWidth: 0.5,
    borderColor: colors.borderSmall,
    borderRadius: radius.card,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    gap: 12,
  },
  rowLabel: { ...type.bodyRow, color: colors.text },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  rowValue: { fontSize: 15, fontWeight: '400', color: colors.textTertiary, flexShrink: 1 },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },

  panel: { paddingBottom: 18, gap: 16 },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepperMid: { alignItems: 'center' },
  stepBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.volume,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalNumeral: {
    fontSize: 56,
    fontWeight: '600',
    letterSpacing: -3,
    color: colors.text,
    ...tabular,
  },
  goalLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: -2 },

  derived: {
    backgroundColor: colors.controlAlt16,
    borderRadius: 24,
    paddingVertical: 4,
    paddingHorizontal: 18,
  },
  derivedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  derivedText: { ...type.bodyRow, color: colors.text, flex: 1 },
  derivedRight: { fontSize: 13, fontWeight: '400', color: colors.textTertiary },

  footnote: {
    ...type.bodySecondary,
    color: colors.textQuaternary,
    textAlign: 'center',
  },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.controlAlt,
    borderRadius: radius.input,
    paddingLeft: 18,
    paddingRight: 5,
    minHeight: 56,
  },
  inputPrefix: { fontSize: 16, fontWeight: '400', color: colors.textPlaceholder },
  input: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text, paddingVertical: 14 },
  inputBox: {
    backgroundColor: colors.controlAlt,
    borderRadius: radius.input,
    paddingHorizontal: 18,
    fontWeight: '500',
  },

  panelBtnBusy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },

  status: {
    ...type.bodySecondary,
    color: colors.accentText,
    textAlign: 'center',
    marginTop: 14,
  },
});

export default SettingsSheet;
