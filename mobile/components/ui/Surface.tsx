import type { ReactNode } from 'react';
import { StyleSheet, View, useColorScheme, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { BorderRadius, Colors, Shadows, Spacing } from '../../constants/theme';
import { PressableScale } from './PressableScale';
import { useAccessibilityPreferences } from './useAccessibilityPreferences';

interface SurfaceProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  tone?: 'default' | 'material' | 'strong';
}

export function Surface({ children, style, onPress, accessibilityLabel, tone = 'default' }: SurfaceProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const { reduceTransparency } = useAccessibilityPreferences();
  const content = tone === 'material' && !reduceTransparency ? (
    <BlurView
      intensity={35}
      tint={scheme}
      style={[styles.base, { backgroundColor: colors.material, borderColor: colors.border }, style]}
    >
      {children}
    </BlurView>
  ) : (
    <View
      style={[
        styles.base,
        tone === 'strong' ? Shadows.md : Shadows.sm,
        { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) return content;
  return (
    <PressableScale accessibilityLabel={accessibilityLabel} onPress={onPress}>
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
});
