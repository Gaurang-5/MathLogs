import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import {
  type ThemePreference,
  useThemePreference,
} from '../../contexts/ThemePreferenceContext';
import { BorderRadius, Colors, Spacing, TypeScale } from '../../constants/theme';
import { PressableScale } from './PressableScale';

const OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  label: string;
  Icon: LucideIcon;
}> = [
  { value: 'system', label: 'System', Icon: Monitor },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

export function ThemeModeSelector() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const { preference, setPreference } = useThemePreference();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="App appearance"
      style={[styles.container, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = preference === value;
        return (
          <PressableScale
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={`${label} appearance`}
            accessibilityState={{ checked: selected }}
            haptic="selection"
            onPress={() => void setPreference(value)}
            style={[
              styles.option,
              selected && {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.focus,
              },
            ]}
          >
            <Icon size={18} color={selected ? colors.text : colors.textSecondary} />
            <Text style={[styles.label, { color: selected ? colors.text : colors.textSecondary }]}>
              {label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 52,
    padding: Spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  option: {
    minWidth: 0,
    minHeight: 44,
    flex: 1,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  label: TypeScale.label,
});
