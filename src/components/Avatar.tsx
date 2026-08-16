/**
 * Avatar — neutral glass circle (§1 controls) with the initial in white 600.
 *
 * The old implementation hashed the name into a 6-colour saturated palette
 * (#2563EB / #DC2626 / …). Those are GitHub-dark brand colours: on the true
 * black OLED ground they read as glowing stickers and they collide with the
 * ring palette (#FA114F / #A2F73D / #00D3F2), which in Crew sits *directly*
 * around the avatar. The redesign has exactly one neutral surface for
 * identity-less chrome — rgba(120,120,128,.30) + a .5px hairline — so the
 * default avatar is that, and colour is left to the ring.
 */

import React from 'react';
import { Image, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors } from '@/theme';

export interface AvatarProps {
  /** Display name or username; the first letter becomes the initial. */
  name: string;
  /** Pixel diameter. Default 40. */
  size?: number;
  /** Remote image; falls back to the initial if it fails to load. */
  url?: string | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** First letter of the first word that has one. Uppercased, never empty. */
function initialOf(name: string) {
  const safe = (name ?? '').trim();
  if (!safe) return '?';
  for (const word of safe.split(/\s+/)) {
    const ch = word[0];
    if (ch && /\p{L}|\p{N}/u.test(ch)) return ch.toUpperCase();
  }
  return safe[0]?.toUpperCase() ?? '?';
}

export function Avatar({ name, size = 40, url, style, testID }: AvatarProps) {
  const [imgErr, setImgErr] = React.useState(false);
  const r = size / 2;

  // Reset the error latch if the caller swaps in a different image.
  React.useEffect(() => setImgErr(false), [url]);

  const frame: ViewStyle = {
    width: size,
    height: size,
    borderRadius: r,
    borderWidth: StyleSheet.hairlineWidth < 0.5 ? StyleSheet.hairlineWidth : 0.5,
    borderColor: colors.borderOutline,
  };

  if (url && !imgErr) {
    return (
      <View style={[s.circle, frame, s.clip, style]} testID={testID}>
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setImgErr(true)}
        />
      </View>
    );
  }

  return (
    <View
      style={[s.circle, frame, { backgroundColor: colors.controlAlt30 }, style]}
      testID={testID}>
      <Text
        style={[s.initial, { fontSize: Math.round(size * 0.42) }]}
        numberOfLines={1}
        allowFontScaling={false}>
        {initialOf(name)}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  clip: { backgroundColor: colors.controlAlt16 },
  initial: {
    color: colors.text,
    fontWeight: '600',
    letterSpacing: -0.2,
    includeFontPadding: false,
    textAlign: 'center',
  },
});

export default Avatar;
