import { View, Text, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, space } from '@/theme';

interface Props {
  step: number;               // 1-based
  total?: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onBack?: () => void;        // defaults to router.back()
}

/** Shared chrome for onboarding steps: back button, progress bar, title block. */
export function OnboardingStep({ step, total = 4, title, subtitle, children, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={[s.root, { paddingTop: insets.top + space(2), paddingBottom: insets.bottom + space(4) }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable onPress={onBack ?? (() => router.back())} style={s.back} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.textDim} />
        </Pressable>
        <Text style={s.step}>Step {step} of {total}</Text>
        <View style={s.track}>
          <View style={[s.fill, { width: `${(step / total) * 100}%` }]} />
        </View>
        <Text style={s.h1}>{title}</Text>
        <Text style={s.sub}>{subtitle}</Text>
        <View style={s.content}>{children}</View>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space(6) },
  back: { alignSelf: 'flex-start', paddingVertical: space(2), marginBottom: space(2) },
  step: { color: colors.textDim, fontSize: 12, fontWeight: '600', marginBottom: space(2) },
  track: { height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden', marginBottom: space(6) },
  fill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },
  h1: { color: colors.text, fontSize: 27, fontWeight: '800', letterSpacing: -0.6 },
  sub: { color: colors.textDim, fontSize: 14, marginTop: space(1), marginBottom: space(5), lineHeight: 20 },
  content: { flex: 1 },
});
