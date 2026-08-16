/**
 * Pack management — rename, set active, delete.
 *
 * Only custom packs reach this sheet; the three built-in tracks are catalog
 * data and have nothing to manage. Delete is two-tap (the row arms itself
 * first) because a pack can represent a pasted list the user cannot easily
 * reconstruct, and there is no undo.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Sheet } from '@/components/Sheet';
import { PillButton } from '@/components/PillButton';
import { colors, radius, tabular, type } from '@/theme';
import { SOURCE_LABEL, type CustomPack } from './packs';

export interface ManagePackSheetProps {
  pack: CustomPack | null;
  /** Problems in this pack the catalog can actually track. */
  trackable: number;
  active: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
  onSetActive: () => void;
  onDelete: () => void;
}

export function ManagePackSheet({
  pack,
  trackable,
  active,
  onClose,
  onRename,
  onSetActive,
  onDelete,
}: ManagePackSheetProps) {
  const [name, setName] = useState('');
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    setName(pack?.name ?? '');
    setArmed(false);
  }, [pack?.id, pack?.name]);

  const total = pack ? pack.sections.reduce((n, s) => n + s.slugs.length, 0) : 0;
  const dirty = !!pack && name.trim().length > 0 && name.trim() !== pack.name;

  return (
    <Sheet
      visible={!!pack}
      onClose={onClose}
      title="Manage pack"
      subtitle={pack ? SOURCE_LABEL[pack.source] : undefined}>
      {pack ? (
        <View style={s.body}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Pack name"
            placeholderTextColor={colors.textPlaceholder}
            autoCapitalize="words"
            style={s.input}
          />

          <Text style={s.meta}>
            <Text style={tabular}>{total}</Text> problems ·{' '}
            <Text style={tabular}>{trackable}</Text> in the catalog and tracked
            {trackable < total
              ? `. The other ${total - trackable} aren't seeded yet, so they can't be counted.`
              : '.'}
          </Text>

          <PillButton
            label="Save name"
            variant="accent"
            disabled={!dirty}
            onPress={() => onRename(name)}
          />

          <PillButton
            label={active ? 'This is your active pack' : 'Make active'}
            icon={active ? 'checkmark-circle' : 'play-circle-outline'}
            disabled={active}
            onPress={onSetActive}
          />

          <PillButton
            label={armed ? 'Tap again to delete' : 'Delete pack'}
            icon="trash-outline"
            variant="tint"
            tintColor={colors.hard}
            onPress={() => (armed ? onDelete() : setArmed(true))}
          />

          <Text style={s.footnote}>
            Deleting a pack removes the list only. Your solves are untouched — re-add the pack
            and it comes back with the same progress.
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  body: { gap: 12, paddingBottom: 4 },
  input: {
    height: 48,
    borderRadius: radius.input,
    backgroundColor: colors.controlAlt,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
  },
  meta: { ...type.bodySecondary, color: colors.textSecondary },

  footnote: { ...type.caption, color: colors.textQuaternary, lineHeight: 18, marginTop: 2 },
});

export default ManagePackSheet;
