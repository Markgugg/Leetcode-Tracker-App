import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '@/stores/auth';
import { colors } from '@/theme';

// Show a blank loading screen — _layout.tsx handles all auth-based redirects
// once session/loading state is ready. Avoids the /feed flash before auth resolves.
export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}
