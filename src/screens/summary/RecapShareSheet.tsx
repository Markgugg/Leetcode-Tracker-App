/**
 * Recap preview + share (§3.6.7).
 *
 * `react-native-view-shot` snapshots a *mounted, laid-out* view — there is no
 * off-screen render path — so the card the user is looking at is literally the
 * view that gets captured. That is the whole reason the preview lives in a
 * sheet: the card is on screen at its real size, `captureRef` re-rasterises it
 * at `PIXEL_RATIO`, and what shipped is exactly what was previewed.
 *
 * The card is sized to the space the sheet actually has (9:16, capped by both
 * the panel's width and its height) rather than a fixed number, so it never
 * overflows on a small phone or floats in the middle of a large one.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { PillButton } from '@/components/PillButton';
import { Segmented } from '@/components/Segmented';
import { Sheet } from '@/components/Sheet';
import { colors } from '@/theme';
import { RecapCard } from './RecapCard';
import type { WeekRecap } from './useRecapData';

/** Grab handle + title row + the panel's own top padding. */
const SHEET_CHROME = 108;

/**
 * Export size, in *points*. view-shot has no `pixelRatio` — it draws the view
 * hierarchy into a context of `width × height` points at the device's own
 * scale, so the PNG comes out at `width × deviceScale` pixels. 540 × 960 is
 * therefore 1080 × 1920 on a @2x screen and 1620 × 2880 on a @3x one: at or
 * above the 1080-wide story size everywhere, from one constant. The card is
 * natively 9:16, so asking for a 9:16 context resizes it without distorting it.
 */
const EXPORT_W = 540;
const EXPORT_H = (EXPORT_W * 16) / 9;

export interface RecapShareSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Current week first, then last week when there is one. */
  weeks: WeekRecap[];
  isLoading?: boolean;
  displayName?: string;
  /** Toast hook from the screen — used for the two failure paths. */
  onNotify?: (message: string) => void;
}

export function RecapShareSheet({
  visible,
  onClose,
  weeks,
  isLoading = false,
  displayName,
  onNotify,
}: RecapShareSheetProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const shotRef = useRef<View>(null);

  /* Every open starts on the live week; a stale selection from the previous
     open must not survive a week rollover. */
  useEffect(() => {
    if (visible) setIndex(0);
  }, [visible]);

  const recap = weeks[Math.min(index, Math.max(0, weeks.length - 1))] ?? null;
  const hasPrevious = weeks.length > 1;

  /* Room the panel actually has, after its chrome, the segmented control, the
     button and the home indicator. The card takes the smaller of the two
     constraints so 9:16 always fits. */
  const bottomPad = insets.bottom + 16;
  const availH =
    height * 0.9 - SHEET_CHROME - (hasPrevious ? 58 : 0) - 50 - 32 - bottomPad;
  const cardWidth = Math.max(180, Math.min(width - 44, (availH * 9) / 16));

  const share = async () => {
    if (!recap || busy) return;
    setBusy(true);
    try {
      if (!(await Sharing.isAvailableAsync())) {
        onNotify?.('Sharing is not available on this device');
        return;
      }
      const path = await captureRef(shotRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: EXPORT_W,
        height: EXPORT_H,
      });
      /* iOS hands back a bare filesystem path (`/var/…/RN/x.png`) while Android
         returns a `file://` URL. `shareAsync` wants a URL on both. */
      const uri = path.startsWith('file://') ? path : `file://${path}`;
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
        dialogTitle: `LeetAI · ${recap.range}`,
      });
    } catch {
      onNotify?.('Could not create the recap image');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Weekly recap"
      subtitle={recap ? `Week ${recap.weekNumber}` : undefined}
      scroll={false}
      contentStyle={{ paddingBottom: bottomPad }}
      testID="recap-share-sheet">
      {hasPrevious ? (
        <Segmented
          options={[
            { label: 'This week', value: 'current' },
            { label: 'Last week', value: 'previous' },
          ]}
          value={index === 0 ? 'current' : 'previous'}
          onChange={(v) => setIndex(v === 'current' ? 0 : 1)}
          style={s.segmented}
        />
      ) : null}

      <View style={s.preview}>
        {recap ? (
          /* The captured node. Nothing but the card lives under this ref —
             padding, the segmented control and the button must stay outside it
             or they end up in the PNG. */
          <View ref={shotRef} collapsable={false} style={s.shot}>
            <RecapCard recap={recap} width={cardWidth} displayName={displayName} />
          </View>
        ) : (
          <View style={[s.placeholder, { width: cardWidth, height: (cardWidth * 16) / 9 }]}>
            {isLoading ? (
              <ActivityIndicator color={colors.accentText} />
            ) : (
              <Text style={s.empty}>Nothing to recap yet</Text>
            )}
          </View>
        )}
      </View>

      <PillButton
        label={busy ? 'Preparing…' : 'Share recap'}
        icon="share-outline"
        variant="accent"
        disabled={!recap || busy}
        onPress={share}
      />
    </Sheet>
  );
}

const s = StyleSheet.create({
  segmented: { marginBottom: 16 },
  preview: { alignItems: 'center', marginBottom: 16 },
  /* `collapsable={false}` alone keeps the node alive on Android; the black
     ground makes the rounded corners of the capture read as the card's own. */
  shot: { backgroundColor: colors.bg, borderRadius: 28, overflow: 'hidden' },
  placeholder: {
    borderRadius: 28,
    backgroundColor: colors.cardSmall,
    borderWidth: 0.5,
    borderColor: colors.borderSmall,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { fontSize: 14, fontWeight: '500', color: colors.textTertiary },
});

export default RecapShareSheet;
