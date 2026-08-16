/**
 * Custom packs — the user's own lists, alongside the three built-in tracks.
 *
 * Storage is deliberately two-tier:
 *
 *   AsyncStorage is the **source of truth for rendering**. Practice must open
 *   instantly and work on a plane, and a pack is a few kilobytes of slugs.
 *   Supabase (`user_packs` + `user_pack_problems`, migration 0028) is the
 *   **durable mirror** so a pack survives a reinstall or a second device.
 *
 * Every remote call is best-effort and swallowed: 0028 may not be applied yet,
 * and a pack that only exists on the device is still a working pack. Nothing in
 * this module can fail in a way the user sees as an error.
 *
 * Progress is *never* stored — a pack is a list of slugs, and completion is the
 * intersection with `solves`, computed by the same `resolveTrack` the built-in
 * tracks go through. That is the whole reason a pack is shaped like a
 * `TrackDef`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';
import type { Difficulty } from '@/types/database';
import type { ImportedProblem, PackSourceKind } from './leetcodeImport';
import type { TrackDef, TrackSection } from './tracks';

export interface CustomPack {
  /** Client-generated, stable, and the primary key on both tiers. */
  id: string;
  name: string;
  blurb: string;
  source: PackSourceKind;
  /** Study-plan / list slug, or the bundled pack's id. */
  sourceRef?: string;
  createdAt: string;
  sections: TrackSection[];
  /** Titles/difficulties as imported. The catalog wins wherever it has a row. */
  problems: ImportedProblem[];
}

/** A pack is a track, as far as every consumer is concerned. */
export const packToTrackDef = (p: CustomPack): TrackDef => ({
  id: p.id,
  name: p.name,
  blurb: p.blurb,
  sections: p.sections,
});

export const isCustomPackId = (id: string) => id.startsWith('pack_');

/** No uuid dependency in this app; a pack id only has to be unique per user. */
export function newPackId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `pack_${Date.now().toString(36)}_${rand}`;
}

export const packKey = (uid?: string) => `custom-packs:${uid ?? 'anon'}`;
/**
 * Which local writes the mirror has not confirmed yet. Without this the merge
 * below cannot tell "the server genuinely has an older/absent pack" from "my
 * write never landed", and remote-wins silently reverts local edits.
 */
export const pendingKey = (uid?: string) => `custom-packs-pending:${uid ?? 'anon'}`;

export const SOURCE_LABEL: Record<PackSourceKind, string> = {
  'leetcode-studyplan': 'LeetCode study plan',
  'leetcode-list': 'LeetCode list',
  neetcode: 'Bundled NeetCode list',
  manual: 'Pasted by you',
};

/* ------------------------------------------------------------------ */
/* Local tier                                                          */
/* ------------------------------------------------------------------ */

function sanitize(raw: unknown): CustomPack[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomPack[] = [];
  for (const item of raw) {
    const p = item as Partial<CustomPack>;
    if (!p || typeof p.id !== 'string' || typeof p.name !== 'string') continue;
    if (!Array.isArray(p.sections)) continue;
    out.push({
      id: p.id,
      name: p.name,
      blurb: typeof p.blurb === 'string' ? p.blurb : '',
      source: (p.source ?? 'manual') as PackSourceKind,
      sourceRef: typeof p.sourceRef === 'string' ? p.sourceRef : undefined,
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString(),
      sections: p.sections
        .filter((s): s is TrackSection => !!s && Array.isArray((s as TrackSection).slugs))
        .map((s) => ({ name: String(s.name ?? 'Problems'), slugs: s.slugs.map(String) })),
      problems: Array.isArray(p.problems) ? (p.problems as ImportedProblem[]) : [],
    });
  }
  return out;
}

async function readLocal(uid?: string): Promise<CustomPack[]> {
  try {
    const raw = await AsyncStorage.getItem(packKey(uid));
    return raw ? sanitize(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

async function writeLocal(uid: string | undefined, packs: CustomPack[]): Promise<void> {
  try {
    await AsyncStorage.setItem(packKey(uid), JSON.stringify(packs));
  } catch {
    /* a full disk is not worth an error state here */
  }
}

/** Total slugs in a pack — the only measure of "does this pack still work". */
const slugCount = (p: CustomPack) => p.sections.reduce((n, s) => n + s.slugs.length, 0);

/* ------------------------------------------------------------------ */
/* Pending-write journal                                               */
/* ------------------------------------------------------------------ */

interface Pending {
  /** Packs whose current local shape the server has not acknowledged. */
  dirty: string[];
  /** Packs deleted locally whose remote delete has not been acknowledged. */
  deleted: string[];
}

const EMPTY_PENDING: Pending = { dirty: [], deleted: [] };

/** All journal writes are read-modify-write; serialise them on one chain. */
let pendingChain: Promise<unknown> = Promise.resolve();

async function readPending(uid?: string): Promise<Pending> {
  try {
    const raw = await AsyncStorage.getItem(pendingKey(uid));
    if (!raw) return EMPTY_PENDING;
    const parsed = JSON.parse(raw) as Partial<Pending>;
    return {
      dirty: Array.isArray(parsed.dirty) ? parsed.dirty.map(String) : [],
      deleted: Array.isArray(parsed.deleted) ? parsed.deleted.map(String) : [],
    };
  } catch {
    return EMPTY_PENDING;
  }
}

function editPending(uid: string | undefined, fn: (p: Pending) => Pending): Promise<void> {
  const next = pendingChain.then(async () => {
    try {
      const cur = await readPending(uid);
      const out = fn(cur);
      await AsyncStorage.setItem(pendingKey(uid), JSON.stringify(out));
    } catch {
      /* the journal is an optimisation; losing it only costs a re-push */
    }
  });
  pendingChain = next;
  return next;
}

const addTo = (list: string[], id: string) => (list.includes(id) ? list : [...list, id]);
const without = (list: string[], id: string) => list.filter((x) => x !== id);

const markDirty = (uid: string | undefined, id: string) =>
  editPending(uid, (p) => ({ dirty: addTo(p.dirty, id), deleted: without(p.deleted, id) }));

const clearDirty = (uid: string | undefined, id: string) =>
  editPending(uid, (p) => ({ ...p, dirty: without(p.dirty, id) }));

const markDeleted = (uid: string | undefined, id: string) =>
  editPending(uid, (p) => ({ dirty: without(p.dirty, id), deleted: addTo(p.deleted, id) }));

const clearDeleted = (uid: string | undefined, id: string) =>
  editPending(uid, (p) => ({ ...p, deleted: without(p.deleted, id) }));

/* ------------------------------------------------------------------ */
/* Remote mirror (migration 0028) — every call best-effort              */
/* ------------------------------------------------------------------ */

interface RemotePackRow {
  id: string;
  name: string;
  blurb: string | null;
  source: string | null;
  source_ref: string | null;
  created_at: string;
}

interface RemoteProblemRow {
  pack_id: string;
  problem_slug: string;
  section: string | null;
  position: number;
  title: string | null;
  difficulty: string | null;
}

async function pullRemote(uid: string): Promise<CustomPack[] | null> {
  try {
    const { data: packs, error } = await supabase
      .from('user_packs')
      .select('id, name, blurb, source, source_ref, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: true });
    if (error || !packs) return null;
    if (!packs.length) return [];

    const ids = (packs as RemotePackRow[]).map((p) => p.id);
    const { data: rows, error: rowsError } = await supabase
      .from('user_pack_problems')
      .select('pack_id, problem_slug, section, position, title, difficulty')
      .in('pack_id', ids)
      .order('position', { ascending: true });
    if (rowsError) return null;

    const byPack = new Map<string, RemoteProblemRow[]>();
    for (const r of (rows ?? []) as RemoteProblemRow[]) {
      const list = byPack.get(r.pack_id);
      if (list) list.push(r);
      else byPack.set(r.pack_id, [r]);
    }

    return (packs as RemotePackRow[]).map((p) => {
      const rs = byPack.get(p.id) ?? [];
      const sections: TrackSection[] = [];
      const problems: ImportedProblem[] = [];
      let current: { name: string; slugs: string[] } | null = null;
      for (const r of rs) {
        const section = r.section?.trim() || 'Problems';
        if (!current || current.name !== section) {
          current = { name: section, slugs: [] };
          sections.push(current);
        }
        current.slugs.push(r.problem_slug);
        problems.push({
          slug: r.problem_slug,
          title: r.title ?? undefined,
          difficulty: (r.difficulty as Difficulty | null) ?? undefined,
        });
      }
      return {
        id: p.id,
        name: p.name,
        blurb: p.blurb ?? '',
        source: (p.source ?? 'manual') as PackSourceKind,
        sourceRef: p.source_ref ?? undefined,
        createdAt: p.created_at,
        sections,
        problems,
      };
    });
  } catch {
    return null;
  }
}

/**
 * Mirror one pack. Returns true only when *every* statement came back clean —
 * supabase-js resolves with an `error` rather than throwing, so an unchecked
 * result is an unnoticed failure. A half-written pack (parent row, no children)
 * must never be reported as synced: the merge relies on that answer to decide
 * whether an empty remote pack is real or the wreckage of this function.
 */
async function pushRemote(uid: string, pack: CustomPack): Promise<boolean> {
  try {
    const { error } = await supabase.from('user_packs').upsert({
      id: pack.id,
      user_id: uid,
      name: pack.name,
      blurb: pack.blurb,
      source: pack.source,
      source_ref: pack.sourceRef ?? null,
    });
    if (error) return false;

    const meta = new Map(pack.problems.map((p) => [p.slug, p] as const));
    const rows: RemoteProblemRow[] = [];
    let position = 0;
    for (const section of pack.sections) {
      for (const slug of section.slugs) {
        const m = meta.get(slug);
        rows.push({
          pack_id: pack.id,
          problem_slug: slug,
          section: section.name,
          position: position++,
          title: m?.title ?? null,
          difficulty: m?.difficulty ?? null,
        });
      }
    }
    const { error: clearError } = await supabase
      .from('user_pack_problems')
      .delete()
      .eq('pack_id', pack.id);
    if (clearError) return false;

    if (rows.length) {
      const { error: insertError } = await supabase.from('user_pack_problems').insert(rows);
      if (insertError) return false;
    }
    return true;
  } catch {
    /* offline / 0028 not applied — the local tier already has it */
    return false;
  }
}

async function renameRemote(id: string, name: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('user_packs').update({ name }).eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

async function deleteRemote(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('user_packs').delete().eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export interface NewPackInput {
  name: string;
  blurb?: string;
  source: PackSourceKind;
  sourceRef?: string;
  sections: TrackSection[];
  problems?: ImportedProblem[];
}

export interface CustomPacksApi {
  packs: CustomPack[];
  /** True until the local tier has been read once. */
  loading: boolean;
  /**
   * True once the pack list is final for this launch: the local read finished
   * *and* the remote mirror has been consulted (or there is no signed-in user
   * to consult it for). Anything that reacts to a pack being absent — dropping
   * the active selection, say — must wait for this, not for `loading`.
   */
  settled: boolean;
  addPack: (input: NewPackInput) => Promise<CustomPack>;
  renamePack: (id: string, name: string) => void;
  deletePack: (id: string) => void;
}

export function useCustomPacks(uid?: string): CustomPacksApi {
  const [packs, setPacks] = useState<CustomPack[]>([]);
  const [loading, setLoading] = useState(true);
  const [settled, setSettled] = useState(false);
  const uidRef = useRef(uid);
  uidRef.current = uid;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setSettled(false);

    void (async () => {
      const local = await readLocal(uid);
      if (!alive) return;
      setPacks(local);
      setLoading(false);

      if (!uid) {
        setSettled(true);
        return;
      }

      const [remote, pending] = await Promise.all([pullRemote(uid), readPending(uid)]);
      if (!alive) return;
      if (!remote) {
        // The mirror is unreachable. Local is all there is, and it is final.
        setSettled(true);
        return;
      }

      const localById = new Map(local.map((p) => [p.id, p] as const));
      const deleted = new Set(pending.deleted);
      const dirty = new Set(pending.dirty);

      /*
       * Union with remote winning on id collisions — *except* where remote is
       * demonstrably the loser:
       *
       *   · the id is journalled dirty — a local add/rename the server never
       *     acknowledged, so the remote row is stale by construction;
       *   · the remote pack has no problems at all while the local one does —
       *     the signature of a `user_pack_problems` delete+insert that failed
       *     or was interrupted between the two statements. Letting that win
       *     would persist an empty pack over the complete local copy and the
       *     pack would render as "nothing trackable" for ever after.
       *
       * Ids journalled as deleted are dropped outright: the delete simply never
       * reached the server, and it is retried below.
       */
      const merged: CustomPack[] = [];
      const remoteIds = new Set<string>();
      const stale: CustomPack[] = [];

      for (const r of remote) {
        remoteIds.add(r.id);
        if (deleted.has(r.id)) continue;
        const l = localById.get(r.id);
        const keepLocal = !!l && (dirty.has(r.id) || (slugCount(r) === 0 && slugCount(l) > 0));
        if (keepLocal && l) {
          merged.push(l);
          stale.push(l);
        } else {
          merged.push(r);
        }
      }

      const unpushed: CustomPack[] = [];
      for (const p of local) {
        if (remoteIds.has(p.id) || deleted.has(p.id)) continue;
        merged.push(p);
        unpushed.push(p);
      }

      merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setPacks(merged);
      void writeLocal(uid, merged);

      // Retry every write the server never confirmed, and only clear the
      // journal entry once it says yes.
      for (const p of [...stale, ...unpushed]) {
        void pushRemote(uid, p).then((ok) => {
          if (ok) void clearDirty(uid, p.id);
          else void markDirty(uid, p.id);
        });
      }
      for (const id of pending.deleted) {
        void deleteRemote(id).then((ok) => {
          if (ok) void clearDeleted(uid, id);
        });
      }

      setSettled(true);
    })();

    return () => {
      alive = false;
    };
  }, [uid]);

  const commit = useCallback((next: CustomPack[]) => {
    setPacks(next);
    void writeLocal(uidRef.current, next);
  }, []);

  const addPack = useCallback(
    async (input: NewPackInput): Promise<CustomPack> => {
      const count = input.sections.reduce((n, s) => n + s.slugs.length, 0);
      const pack: CustomPack = {
        id: newPackId(),
        name: input.name.trim() || 'Untitled pack',
        blurb: input.blurb?.trim() || `${count} problem${count === 1 ? '' : 's'}`,
        source: input.source,
        sourceRef: input.sourceRef,
        createdAt: new Date().toISOString(),
        sections: input.sections,
        problems: input.problems ?? [],
      };
      const next = [...packs, pack];
      commit(next);
      const uid = uidRef.current;
      if (uid) {
        void markDirty(uid, pack.id).then(() =>
          pushRemote(uid, pack).then((ok) => {
            if (ok) void clearDirty(uid, pack.id);
          }),
        );
      }
      return pack;
    },
    [packs, commit],
  );

  const renamePack = useCallback(
    (id: string, name: string) => {
      const clean = name.trim();
      if (!clean) return;
      commit(packs.map((p) => (p.id === id ? { ...p, name: clean } : p)));
      const uid = uidRef.current;
      if (!uid) return;
      // Journal first: an unacknowledged rename must survive a kill mid-flight,
      // or the next pull hands back the old name and the edit looks undone.
      void markDirty(uid, id).then(() =>
        renameRemote(id, clean).then((ok) => {
          if (ok) void clearDirty(uid, id);
        }),
      );
    },
    [packs, commit],
  );

  const deletePack = useCallback(
    (id: string) => {
      commit(packs.filter((p) => p.id !== id));
      const uid = uidRef.current;
      if (!uid) return;
      void markDeleted(uid, id).then(() =>
        deleteRemote(id).then((ok) => {
          if (ok) void clearDeleted(uid, id);
        }),
      );
    },
    [packs, commit],
  );

  return { packs, loading, settled, addPack, renamePack, deletePack };
}
