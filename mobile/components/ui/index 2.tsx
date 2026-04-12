/**
 * Reusable UI Components — MathLogs Brand Design System
 * Haptic feedback, Reanimated animations, glassmorphism, and proper touch targets.
 */
import React, { useCallback } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  ViewStyle,
  TextStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, FontSize, FontWeight, Shadows, Animation } from '../../constants/theme';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

// ─── Branded Button ────────────────────────────────────────

interface BrandButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function BrandButton({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
}: BrandButtonProps) {
  const scale = useSharedValue(1);
  const colorScheme = useColorScheme();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.96, Animation.spring);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, Animation.spring);
  }, []);

  const heightMap = { sm: 40, md: 48, lg: 56 };
  const fontMap = { sm: FontSize.sm, md: FontSize.base, lg: FontSize.md };

  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const isGhost = variant === 'ghost';

  return (
    <AnimatedTouchable
      activeOpacity={0.85}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || loading}
      style={[animatedStyle, style]}
    >
      <LinearGradient
        colors={
          isPrimary
            ? [Colors.primary, Colors.primaryDark]
            : isDanger
            ? [Colors.error, '#DC2626']
            : ['transparent', 'transparent']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.button,
          {
            height: heightMap[size],
            borderRadius: BorderRadius.lg,
            opacity: disabled ? 0.5 : 1,
            borderWidth: isGhost || variant === 'secondary' ? 1.5 : 0,
            borderColor: isGhost
              ? 'transparent'
              : variant === 'secondary'
              ? Colors.primary
              : 'transparent',
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <View style={styles.buttonContent}>
            {icon && <View style={{ marginRight: Spacing.sm }}>{icon}</View>}
            <Text
              style={[
                styles.buttonText,
                {
                  fontSize: fontMap[size],
                  color:
                    isPrimary || isDanger
                      ? '#FFFFFF'
                      : variant === 'secondary'
                      ? Colors.primary
                      : colorScheme === 'dark'
                      ? Colors.dark.text
                      : Colors.light.text,
                },
              ]}
            >
              {title}
            </Text>
          </View>
        )}
      </LinearGradient>
    </AnimatedTouchable>
  );
}

// ─── Glass Card ────────────────────────────────────────────

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  intensity?: number;
}

export function GlassCard({ children, style, onPress, intensity = 30 }: GlassCardProps) {
  const colorScheme = useColorScheme();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (onPress) {
      scale.value = withSpring(0.98, Animation.spring);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [onPress]);

  const handlePressOut = useCallback(() => {
    if (onPress) {
      scale.value = withSpring(1, Animation.spring);
    }
  }, [onPress]);

  const Wrapper = onPress ? AnimatedTouchable : Animated.View;

  return (
    <Wrapper
      {...(onPress ? {
        onPress,
        onPressIn: handlePressIn,
        onPressOut: handlePressOut,
        activeOpacity: 0.95,
      } : {})}
      style={[animatedStyle]}
    >
      <BlurView
        intensity={intensity}
        tint={colorScheme === 'dark' ? 'dark' : 'light'}
        style={[
          styles.glassCard,
          {
            borderColor: colorScheme === 'dark' ? Colors.dark.border : Colors.light.border,
            backgroundColor:
              colorScheme === 'dark'
                ? 'rgba(30, 30, 46, 0.6)'
                : 'rgba(255, 255, 255, 0.7)',
          },
          style,
        ]}
      >
        {children}
      </BlurView>
    </Wrapper>
  );
}

// ─── Stat Card ─────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  color?: string;
  onPress?: () => void;
}

export function StatCard({ title, value, subtitle, icon, color = Colors.primary, onPress }: StatCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <GlassCard onPress={onPress} style={styles.statCard}>
      <View style={[styles.statIconContainer, { backgroundColor: `${color}18` }]}>
        {icon}
      </View>
      <Text style={[styles.statValue, { color: isDark ? Colors.dark.text : Colors.light.text }]}>
        {value}
      </Text>
      <Text style={[styles.statTitle, { color: isDark ? Colors.dark.textSecondary : Colors.light.textSecondary }]}>
        {title}
      </Text>
      {subtitle && (
        <Text style={[styles.statSubtitle, { color }]}>
          {subtitle}
        </Text>
      )}
    </GlassCard>
  );
}

// ─── Offline Banner ────────────────────────────────────────

interface OfflineBannerProps {
  visible: boolean;
  pendingActions?: number;
}

export function OfflineBanner({ visible, pendingActions = 0 }: OfflineBannerProps) {
  if (!visible) return null;

  return (
    <View style={styles.offlineBanner}>
      <Text style={styles.offlineBannerText}>
        📡 You're offline{pendingActions > 0 ? ` • ${pendingActions} pending` : ''}
      </Text>
    </View>
  );
}

// ─── Skeleton Loader ───────────────────────────────────────

export function SkeletonLoader({ width, height, borderRadius = BorderRadius.md }: {
  width: number;
  height: number;
  borderRadius?: number;
}) {
  const colorScheme = useColorScheme();
  const opacity = useSharedValue(0.3);

  React.useEffect(() => {
    const pulse = () => {
      opacity.value = withTiming(0.8, { duration: 800 }, () => {
        opacity.value = withTiming(0.3, { duration: 800 });
      });
    };
    pulse();
    const id = setInterval(pulse, 1600);
    return () => clearInterval(id);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        animatedStyle,
        {
          width,
          height,
          borderRadius,
          backgroundColor: colorScheme === 'dark' ? Colors.dark.surfaceElevated : Colors.light.surfaceElevated,
        },
      ]}
    />
  );
}

// ─── Styles ────────────────────────────────────────────────

const styles = StyleSheet.create({
  button: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontWeight: FontWeight.semibold,
    letterSpacing: 0.3,
  },
  glassCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  statCard: {
    minWidth: 140,
    alignItems: 'flex-start',
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  statValue: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    marginBottom: 2,
  },
  statTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  statSubtitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    marginTop: 2,
  },
  offlineBanner: {
    backgroundColor: Colors.warningBg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.warning,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  offlineBannerText: {
    color: Colors.warning,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
