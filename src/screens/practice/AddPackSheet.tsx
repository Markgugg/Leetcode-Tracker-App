/**
 * "Add pack" — the three ways a user gets a list into the app.
 *
 *   LeetCode  paste a study-plan or problem-list URL (or its slug); we hit the
 *             same public GraphQL endpoint onboarding already uses. If LeetCode
 *             refuses — private list, changed schema, no signal — the failure
 *             message hands the user straight to the Paste tab rather than
 *             dead-ending.
 *   NeetCode  NeetCode publishes no API, so the 150/250 slug lists ship inside
 *             the app. The sheet says exactly that; it does not pretend to sync.
 *   Paste     any blob of problem URLs or slugs, parsed into a pack. Works with
 *             no network at all, which is why it is also the fallback for the
 *             other two.
 *
 * Whatever the route, the result is one `CustomPack` of slugs. Completion is
 * never imported — it is derived from `solves` by `resolveTrack`, exactly like
 * the built-in tracks, so an imported pack lights up with the user's real
 * history the moment it is added.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { PillButton } from '@/components/PillButton';
import { colors, pressed, radius, tabular, type } from '@/theme';
import { BUNDLED_PACKS } from './bundled';
import {
  MAX_PACK_SIZE,
  importFromLeetCode,
  parseManualInput,
  type ImportedPack,
  type ImportedProblem,
} from './leetcodeImport';
import { trackLength, trackSlugs, type TrackSection } from './tracks';
import type { CustomPack, NewPackInput } from './packs';

type Mode = 'leetcode' | 'neetcode' | 'manual';

/** A LeetCode list that has been fetched but not yet turned into a pack. */
interface LeetCodePreview {
  pack: ImportedPack;
  trackable: number;
}

export interface AddPackSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Ids already taken by a built-in track or an existing pack's `sourceRef`. */
  existingRefs: ReadonlySet<string>;
  addPack: (input: NewPackInput) => Promise<CustomPack>;
  /** Called after a pack lands. The parent makes it active and toasts. */
  onCreated: (pack: CustomPack) => void;
  /** How many of a slug list the seeded catalog can actually track. */
  countTrackable: (slugs: readonly string[]) => number;
}

export function AddPackSheet({
  visible,
  onClose,
  existingRefs,
  addPack,
  onCreated,
  countTrackable,
}: AddPackSheetProps) {
  const [mode, setMode] = useState<Mode>('leetcode');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualName, setManualName] = useState('');
  const [manualBody, setManualBody] = useState('');
  /**
   * A fetched-but-not-yet-created LeetCode import. The sheet's promise is that
   * every route tells you how much of a list the catalog can actually track
   * *before* you commit to it, so the import is a two-step: fetch, show the
   * count, then create.
   */
  const [preview, setPreview] = useState<LeetCodePreview | null>(null);

  const reset = useCallback(() => {
    setUrl('');
    setManualName('');
    setManualBody('');
    setError(null);
    setBusy(false);
    setPreview(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const finish = useCallback(
    async (input: NewPackInput) => {
      const pack = await addPack(input);
      reset();
      onCreated(pack);
    },
    [addPack, onCreated, reset],
  );

  /* ---- LeetCode import ---- */

  /** Step 1 — fetch the list and show what the catalog can track. */
  const onFetch = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const pack = await importFromLeetCode(url);
      setPreview({ pack, trackable: countTrackable(pack.problems.map((p) => p.slug)) });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Couldn't reach LeetCode. Paste the problems instead.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, url, countTrackable]);

  /** Step 2 — the user has seen the numbers; create it. */
  const onCreateImported = useCallback(async () => {
    if (busy || !preview) return;
    setBusy(true);
    const { pack, trackable } = preview;
    try {
      await finish({
        name: pack.name,
        blurb: `${pack.problems.length} problems from LeetCode · ${trackable} tracked`,
        source: pack.source,
        sourceRef: pack.sourceRef,
        sections: pack.sections,
        problems: pack.problems,
      });
    } finally {
      setBusy(false);
    }
  }, [busy, preview, finish]);

  /* ---- Bundled NeetCode ---- */

  /** Same promise as the other two routes: the trackable count, before commit. */
  const bundledTrackable = useMemo(
    () => BUNDLED_PACKS.map((b) => countTrackable(trackSlugs(b.def))),
    [countTrackable],
  );

  const onAddBundled = useCallback(
    async (index: number) => {
      if (busy) return;
      setBusy(true);
      const b = BUNDLED_PACKS[index];
      const slugs = trackSlugs(b.def);
      try {
        await finish({
          name: b.def.name,
          blurb: `${slugs.length} problems · ${countTrackable(slugs)} tracked`,
          source: 'neetcode',
          sourceRef: b.def.id,
          sections: b.def.sections.map((s) => ({ name: s.name, slugs: [...s.slugs] })),
          problems: slugs.map((slug): ImportedProblem => ({ slug })),
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, countTrackable, finish],
  );

  /* ---- Manual paste ---- */

  const parsed = useMemo(() => parseManualInput(manualBody), [manualBody]);
  const parsedTrackable = useMemo(
    () => countTrackable(parsed.map((p) => p.slug)),
    [parsed, countTrackable],
  );

  const onCreateManual = useCallback(async () => {
    if (busy || !parsed.length) return;
    setBusy(true);
    try {
      const sections: TrackSection[] = [{ name: 'Problems', slugs: parsed.map((p) => p.slug) }];
      await finish({
        name: manualName.trim() || 'My pack',
        blurb: `${parsed.length} problems · ${parsedTrackable} tracked`,
        source: 'manual',
        sections,
        problems: parsed,
      });
    } finally {
      setBusy(false);
    }
  }, [busy, parsed, parsedTrackable, manualName, finish]);

  /* ---- render ---- */

  return (
    <Sheet visible={visible} onClose={close} title="Add a pack" subtitle="Import or paste">
      <View style={s.body}>
        <Segmented<Mode>
          options={[
            { label: 'LeetCode', value: 'leetcode' },
            { label: 'NeetCode', value: 'neetcode' },
            { label: 'Paste', value: 'manual' },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
        />

        {mode === 'leetcode' ? (
          <View style={s.pane}>
            <Text style={s.paneText}>
              Paste a study-plan or list link. We read it from LeetCode&apos;s public API — the
              same one that verified your username. Private lists need a login we don&apos;t
              have, so those come back empty; use Paste for those.
            </Text>

            <TextInput
              value={url}
              onChangeText={(t) => {
                setUrl(t);
                setError(null);
                setPreview(null);
              }}
              placeholder="leetcode.com/studyplan/leetcode-75/"
              placeholderTextColor={colors.textPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={() => void onFetch()}
              style={s.input}
            />

            {error ? (
              <View style={s.errorBox}>
                <Text style={s.errorText}>{error}</Text>
                <Pressable
                  onPress={() => {
                    setMode('manual');
                    setError(null);
                  }}
                  style={({ pressed: p }) => [p && pressed]}>
                  <Text style={s.errorLink}>Paste the problems instead</Text>
                </Pressable>
              </View>
            ) : null}

            {preview ? (
              <>
                <Text style={s.previewName} numberOfLines={2}>
                  {preview.pack.name}
                </Text>
                <Text style={s.count}>
                  {`${preview.pack.problems.length} problem${
                    preview.pack.problems.length === 1 ? '' : 's'
                  } · ${preview.trackable} in the catalog and trackable`}
                </Text>
              </>
            ) : null}

            <PrimaryButton
              label={preview ? 'Create pack' : 'Find list'}
              busy={busy}
              disabled={!url.trim()}
              onPress={() => void (preview ? onCreateImported() : onFetch())}
            />
          </View>
        ) : null}

        {mode === 'neetcode' ? (
          <View style={s.pane}>
            {BUNDLED_PACKS.map((b, i) => {
              const total = trackLength(b.def);
              const trackable = bundledTrackable[i];
              const already = existingRefs.has(b.def.id);
              return (
                <Pressable
                  key={b.def.id}
                  disabled={already || busy}
                  onPress={() => void onAddBundled(i)}
                  style={({ pressed: p }) => [
                    s.bundleRow,
                    already && s.bundleRowDone,
                    p && pressed,
                  ]}>
                  <View style={s.bundleHead}>
                    <Text style={s.bundleName}>{b.def.name}</Text>
                    {already ? (
                      <Ionicons name="checkmark-circle" size={19} color={colors.accentText} />
                    ) : (
                      <Text style={[s.bundleCount, tabular]}>{total}</Text>
                    )}
                  </View>
                  <Text style={s.bundleBlurb}>{b.def.blurb}</Text>
                  <Text style={s.count}>
                    {`${total} problems · ${trackable} in the catalog and trackable`}
                  </Text>
                  <Text style={s.disclosure}>{b.disclosure}</Text>
                </Pressable>
              );
            })}
            <Text style={s.paneFootnote}>
              NeetCode 150 is already one of the three built-in tracks — switch to it from the
              picker rather than adding a copy.
            </Text>
          </View>
        ) : null}

        {mode === 'manual' ? (
          <View style={s.pane}>
            <Text style={s.paneText}>
              Paste problem links or slugs — one per line, or separated by commas. Anything
              that isn&apos;t a problem is ignored.
            </Text>

            <TextInput
              value={manualName}
              onChangeText={setManualName}
              placeholder="Pack name"
              placeholderTextColor={colors.textPlaceholder}
              autoCapitalize="words"
              style={s.input}
            />

            <TextInput
              value={manualBody}
              onChangeText={setManualBody}
              placeholder={'https://leetcode.com/problems/two-sum/\nvalid-anagram\ncoin-change'}
              placeholderTextColor={colors.textPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              textAlignVertical="top"
              style={[s.input, s.inputMultiline]}
            />

            <Text style={s.count}>
              {parsed.length === 0
                ? 'No problems found yet'
                : `${parsed.length} problem${parsed.length === 1 ? '' : 's'} · ${parsedTrackable} in the catalog and trackable`}
              {parsed.length >= MAX_PACK_SIZE ? ` · capped at ${MAX_PACK_SIZE}` : ''}
            </Text>

            <PrimaryButton
              label="Create pack"
              busy={busy}
              disabled={parsed.length === 0}
              onPress={() => void onCreateManual()}
            />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

function PrimaryButton({
  label,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const off = disabled || busy;
  return (
    <View>
      <PillButton
        label={busy ? '' : label}
        variant="accent"
        disabled={off}
        onPress={onPress}
      />
      {busy ? (
        <View style={s.primaryBusy} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  body: { paddingBottom: 4 },
  pane: { marginTop: 18, gap: 12 },
  paneText: { ...type.bodySecondary, color: colors.textSecondary },
  paneFootnote: { ...type.caption, color: colors.textQuaternary, lineHeight: 18, marginTop: 2 },

  input: {
    minHeight: 48,
    borderRadius: radius.input,
    backgroundColor: colors.controlAlt,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  inputMultiline: { minHeight: 132, lineHeight: 22 },

  count: { ...type.caption, color: colors.textTertiary },
  previewName: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.text,
    marginBottom: -6,
  },

  errorBox: {
    borderRadius: radius.smallCard,
    borderWidth: 0.5,
    borderColor: colors.hardBorder,
    backgroundColor: colors.hardBg,
    padding: 14,
    gap: 8,
  },
  errorText: { ...type.bodySecondary, color: colors.text },
  errorLink: { fontSize: 14, fontWeight: '600', color: colors.accentText },

  bundleRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: radius.smallCard,
    borderWidth: 0.5,
    borderColor: colors.hairline,
    backgroundColor: colors.controlAlt16,
    gap: 5,
  },
  bundleRowDone: { opacity: 0.5 },
  bundleHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bundleName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: colors.text,
  },
  bundleCount: { fontSize: 13.5, fontWeight: '600', color: colors.textTertiary },
  bundleBlurb: { ...type.caption, color: colors.textSecondary },
  disclosure: { ...type.caption, color: colors.textQuaternary, lineHeight: 18 },

  primaryBusy: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default AddPackSheet;
