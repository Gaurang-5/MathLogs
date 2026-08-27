import type { ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Motion, TouchTarget } from '../../constants/theme';
import { useAccessibilityPreferences } from './useAccessibilityPreferences';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PressableScaleProps extends Omit<PressableProps, 'children' | 'style'> {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  haptic?: 'commit' | 'selection' | 'none';
}

export function PressableScale({
  children,
  style,
  haptic = 'none',
  disabled,
  hitSlop = 8,
  onPressIn,
  onPressOut,
  ...props
}: PressableScaleProps) {
  const scale = useSharedValue(1);
  const { reduceMotion } = useAccessibilityPreferences();
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole={props.accessibilityRole ?? 'button'}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={(event) => {
        scale.value = reduceMotion ? 1 : withSpring(0.97, Motion.press);
        if (haptic === 'commit') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (haptic === 'selection') void Haptics.selectionAsync();
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = reduceMotion ? 1 : withSpring(1, Motion.press);
        onPressOut?.(event);
      }}
      style={[
        { minWidth: TouchTarget.minimum, minHeight: TouchTarget.minimum },
        animatedStyle,
        style,
      ]}
      {...props}
    >
      {children}
    </AnimatedPressable>
  );
}
