import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

const PALETTE = ['#2563EB', '#7C3AED', '#DC2626', '#059669', '#D97706', '#DB2777'];

function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return PALETTE[Math.abs(h) % PALETTE.length];
}

interface Props {
  name: string;
  size?: number;
  url?: string | null;
}

export function Avatar({ name, size = 40, url }: Props) {
  const r = size / 2;
  const [imgErr, setImgErr] = React.useState(false);
  if (url && !imgErr) {
    return (
      <View style={{ width: size, height: size, borderRadius: r, overflow: 'hidden' }}>
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          onError={() => setImgErr(true)}
        />
      </View>
    );
  }
  const safe = name?.trim() || '?';
  const initials =
    safe === '?'
      ? '?'
      : safe.split(' ').map(w => w[0]?.toUpperCase() ?? '').filter(Boolean).slice(0, 2).join('') ||
        safe[0]?.toUpperCase() ||
        '?';
  const bg = colorFor(safe);
  return (
    <View style={[s.circle, { width: size, height: size, borderRadius: r, backgroundColor: bg }]}>
      <Text style={[s.text, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontWeight: '700' },
});
