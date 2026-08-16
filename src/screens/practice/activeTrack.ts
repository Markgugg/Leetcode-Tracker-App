/**
 * The active source — which track or pack the user is following.
 *
 * Lifted out of `app/(tabs)/practice.tsx` so it is not Practice-private:
 * Summary's Next Up card needs the same answer if it is ever to recommend
 * *from the list the user chose* rather than from the whole catalog, and
 * duplicating an AsyncStorage key across two screens is how they drift.
 *
 * Device-local. 0027 ships `user_tracks` so this can move server-side without
 * a UI change; `useCustomPacks` already mirrors packs to Supabase.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_TRACK_ID } from './tracks';

export const trackKey = (uid?: string) => `active-track:${uid ?? 'anon'}`;

/**
 * The stored id. Validation deliberately does *not* happen here: packs load
 * asynchronously, so a stored pack id would fail a `TRACKS.some(...)` check on
 * the first frame and be silently reset to Blind 75. The caller validates once
 * its pack list has loaded and writes the fallback back through `setTrackId`.
 */
export function useActiveTrackId(uid?: string) {
  const [trackId, setTrack] = useState<string>(DEFAULT_TRACK_ID);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(trackKey(uid))
      .then((raw) => {
        if (!alive || !raw) return;
        setTrack(raw);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [uid]);

  const setTrackId = useCallback(
    (id: string) => {
      setTrack(id);
      AsyncStorage.setItem(trackKey(uid), id).catch(() => {});
    },
    [uid],
  );

  return { trackId, setTrackId };
}

/*
 * A `useActiveSource(uid)` hook used to live here — one call answering "what
 * list is this user on, and what is in it" for screens outside Practice, with
 * `src/screens/summary/useSummaryData.ts` named as the intended consumer.
 *
 * Nothing ever imported it. It has been removed rather than left as dead code
 * that reads like a wired-up seam: it mounted a second `useCustomPacks`, which
 * now means a second Supabase pull and a second pending-write reconciliation
 * per mount. When Summary is ready to recommend from the active list, it should
 * take the pack list from a shared provider rather than a duplicate hook.
 */
