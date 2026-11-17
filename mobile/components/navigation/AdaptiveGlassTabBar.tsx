import type { ComponentProps, ComponentType } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
  type KeyboardEventName,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { FileText, House, Receipt, Users } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, FontSize, FontWeight, TouchTarget } from '../../constants/theme';
import { useAccessibilityPreferences } from '../ui/useAccessibilityPreferences';

type TabsProps = ComponentProps<typeof Tabs>;
type TabBarRenderer = NonNullable<TabsProps['tabBar']>;
type TabBarProps = Parameters<TabBarRenderer>[0];
type TabIcon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const TAB_ITEMS: ReadonlyArray<{ route: string; label: string; Icon: TabIcon }> = [
  { route: 'index', label: 'Home', Icon: House },
  { route: 'batches', label: 'Batches', Icon: Users },
  { route: 'tests', label: 'Tests', Icon: FileText },
  { route: 'fees', label: 'Fees', Icon: Receipt },
];

const ICON_SIZE = 22;
const LABEL_GAP = 7;
const INACTIVE_TAB_WIDTH = TouchTarget.minimum;
const MIN_ACTIVE_TAB_WIDTH = 88;
const ACTIVE_HORIZONTAL_INSET = 12;
const TRANSITION_DURATION = 220;
const TRANSITION_EASING = Easing.bezier(0.22, 1, 0.36, 1);

function supportsNativeGlass(reduceTransparency: boolean) {
  if (Platform.OS !== 'ios' || reduceTransparency) return false;

  try {
    return isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

function DockMaterial({
  nativeGlass,
  reduceTransparency,
  scheme,
}: {
  nativeGlass: boolean;
  reduceTransparency: boolean;
  scheme: 'light' | 'dark';
}) {
  const colors = Colors[scheme];
  const materialStyle = [
    StyleSheet.absoluteFill,
    styles.material,
    { borderColor: colors.tabBarBorder },
  ];

  if (reduceTransparency) {
    return (
      <View
        pointerEvents="none"
        style={[materialStyle, { backgroundColor: colors.surfaceElevated }]}
      />
    );
  }

  if (nativeGlass) {
    return (
      <GlassView
        pointerEvents="none"
        colorScheme={scheme}
        glassEffectStyle="regular"
        tintColor={colors.material}
        style={materialStyle}
      />
    );
  }

  return (
    <BlurView
      pointerEvents="none"
      intensity={scheme === 'dark' ? 42 : 58}
      tint={scheme}
      style={[materialStyle, { backgroundColor: colors.material }]}
    />
  );
}

function ActiveLens({
  nativeGlass,
  reduceTransparency,
  scheme,
}: {
  nativeGlass: boolean;
  reduceTransparency: boolean;
  scheme: 'light' | 'dark';
}) {
  const colors = Colors[scheme];
  const lensStyle = [
    StyleSheet.absoluteFill,
    styles.lens,
    {
      borderColor: scheme === 'dark' ? colors.tabBarBorder : colors.border,
      backgroundColor: reduceTransparency ? colors.surfaceSecondary : colors.materialStrong,
    },
  ];

  if (nativeGlass && !reduceTransparency) {
    return (
      <GlassView
        pointerEvents="none"
        colorScheme={scheme}
        glassEffectStyle="clear"
        isInteractive
        tintColor={colors.materialStrong}
        style={lensStyle}
      />
    );
  }

  return <View pointerEvents="none" style={lensStyle} />;
}

function GlassTab({
  accessibilityLabel,
  fontScale,
  focused,
  Icon,
  label,
  nativeGlass,
  onLongPress,
  onPress,
  reduceMotion,
  reduceTransparency,
  scheme,
}: {
  accessibilityLabel: string;
  fontScale: number;
  focused: boolean;
  Icon: TabIcon;
  label: string;
  nativeGlass: boolean;
  onLongPress: () => void;
  onPress: () => void;
  reduceMotion: boolean;
  reduceTransparency: boolean;
  scheme: 'light' | 'dark';
}) {
  const colors = Colors[scheme];
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    cancelAnimation(progress);

    if (reduceMotion) {
      progress.value = focused ? 1 : 0;
      return;
    }

    progress.value = withTiming(focused ? 1 : 0, {
      duration: TRANSITION_DURATION,
      easing: TRANSITION_EASING,
    });

    return () => cancelAnimation(progress);
  }, [focused, progress, reduceMotion]);

  const estimatedLabelWidth = Math.ceil(label.length * FontSize.sm * 0.72 * fontScale);
  const expandedLabelWidth = estimatedLabelWidth + LABEL_GAP;
  const activeTabWidth = Math.max(
    MIN_ACTIVE_TAB_WIDTH,
    ICON_SIZE + expandedLabelWidth + ACTIVE_HORIZONTAL_INSET,
  );
  const slotAnimatedStyle = useAnimatedStyle(() => ({
    width: interpolate(
      progress.value,
      [0, 1],
      [INACTIVE_TAB_WIDTH, activeTabWidth],
      Extrapolation.CLAMP,
    ),
  }));
  const lensAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.24, 1], [0, 0.72, 1], Extrapolation.CLAMP),
    transform: [
      {
        scaleX: interpolate(progress.value, [0, 1], [0.76, 1], Extrapolation.CLAMP),
      },
      {
        scaleY: interpolate(progress.value, [0, 1], [0.92, 1], Extrapolation.CLAMP),
      },
    ],
  }));
  const labelAnimatedStyle = useAnimatedStyle(() => ({
    width: interpolate(
      progress.value,
      [0, 0.2, 1],
      [0, 0, expandedLabelWidth],
      Extrapolation.CLAMP,
    ),
    opacity: interpolate(progress.value, [0, 0.42, 1], [0, 0, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateX: interpolate(progress.value, [0, 1], [-5, 0], Extrapolation.CLAMP),
      },
    ],
  }));

  return (
    <Animated.View style={[styles.tabSlot, slotAnimatedStyle]}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        onLongPress={onLongPress}
        onPress={onPress}
        style={({ pressed }) => [
          styles.tabPressable,
          pressed && { backgroundColor: colors.borderLight },
        ]}
      >
        <Animated.View pointerEvents="none" style={[styles.lensMotion, lensAnimatedStyle]}>
          <ActiveLens
            nativeGlass={nativeGlass}
            reduceTransparency={reduceTransparency}
            scheme={scheme}
          />
        </Animated.View>
        <View style={styles.tabContent}>
          <Icon
            size={ICON_SIZE}
            color={focused ? colors.text : colors.textSecondary}
            strokeWidth={focused ? 2.25 : 2}
          />
          <Animated.View style={[styles.labelClip, labelAnimatedStyle]}>
            <Text
              numberOfLines={1}
              style={[styles.label, { color: colors.text, width: estimatedLabelWidth }]}
            >
              {label}
            </Text>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function AdaptiveGlassTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
}: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const { reduceMotion, reduceTransparency } = useAccessibilityPreferences();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const nativeGlass = useMemo(
    () => supportsNativeGlass(reduceTransparency),
    [reduceTransparency],
  );

  useEffect(() => {
    const showEvent: KeyboardEventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent: KeyboardEventName = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  if (keyboardVisible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.positioner, { bottom: Math.max(insets.bottom, 10) }]}
    >
      <View style={[styles.shadow, { shadowColor: colors.shadow }]}>
        <View style={styles.dock}>
          <DockMaterial
            nativeGlass={nativeGlass}
            reduceTransparency={reduceTransparency}
            scheme={scheme}
          />
          <View style={styles.items}>
            {TAB_ITEMS.map(({ route: routeName, label, Icon }) => {
              const routeIndex = state.routes.findIndex((route) => route.name === routeName);
              if (routeIndex < 0) return null;

              const route = state.routes[routeIndex];
              const options = descriptors[route.key]?.options;
              const focused = state.index === routeIndex;
              const accessibilityLabel = options?.tabBarAccessibilityLabel ?? label;

              const onPress = () => {
                const event = emitter.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!focused && !event.defaultPrevented) {
                  void Haptics.selectionAsync().catch(() => undefined);
                  navigateToTab(route.key);
                }
              };

              const onLongPress = () => {
                emitter.emit({ type: 'tabLongPress', target: route.key });
              };

              return (
                <GlassTab
                  key={route.key}
                  accessibilityLabel={accessibilityLabel}
                  fontScale={fontScale}
                  focused={focused}
                  Icon={Icon}
                  label={label}
                  nativeGlass={nativeGlass}
                  onLongPress={onLongPress}
                  onPress={onPress}
                  reduceMotion={reduceMotion}
                  reduceTransparency={reduceTransparency}
                  scheme={scheme}
                />
              );
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  positioner: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shadow: {
    alignSelf: 'center',
    height: 68,
    borderRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 12,
  },
  dock: {
    alignSelf: 'center',
    height: 68,
    borderRadius: 24,
    overflow: 'hidden',
  },
  material: {
    borderRadius: 24,
    borderWidth: 1,
  },
  items: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  tabSlot: {
    height: 54,
  },
  tabPressable: {
    minWidth: TouchTarget.minimum,
    minHeight: TouchTarget.minimum,
    width: '100%',
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    overflow: 'hidden',
  },
  lensMotion: {
    position: 'absolute',
    inset: 0,
  },
  lens: {
    borderRadius: 18,
    borderWidth: 1,
  },
  tabContent: {
    minWidth: TouchTarget.minimum,
    minHeight: TouchTarget.minimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelClip: {
    overflow: 'hidden',
  },
  label: {
    marginLeft: 7,
    fontSize: FontSize.sm,
    lineHeight: 18,
    fontWeight: FontWeight.semibold,
  },
});
