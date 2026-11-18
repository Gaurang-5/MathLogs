import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { LensInfo } from 'expo-camera';
import { PressableScale } from './ui';
import { Colors } from '../constants/theme';

interface Props {
  lenses: LensInfo[];
  selectedLens?: string;
  onSelect: (lens?: string) => void;
  onRestart: () => void;
  disabled: boolean;
}

/** Display the actual lens names emitted by Expo, not assumed device-type identifiers. */
export function StickerCameraControls({ lenses, selectedLens, onSelect, onRestart, disabled }: Props) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];

  return <View style={styles.controls}>
    {lenses.length > 1 && <>
      <Text style={styles.hint}>Blurry up close? Move back or try another camera lens.</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {[undefined, ...lenses].map((lens) => {
          const deviceType = lens?.deviceType;
          const label = lens?.localizedName ?? 'Automatic';
          return (
            <PressableScale
              key={deviceType ?? 'automatic'}
              disabled={disabled}
              onPress={() => onSelect(deviceType)}
              accessibilityLabel={`Use ${label.toLocaleLowerCase()}`}
              accessibilityState={{ selected: deviceType === selectedLens, disabled }}
              style={[
                styles.button,
                { backgroundColor: colors.surface, borderColor: deviceType === selectedLens ? colors.focus : colors.border },
                disabled && styles.disabled,
              ]}
            >
              <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>
    </>}
    <PressableScale onPress={onRestart} disabled={disabled} accessibilityLabel="Restart camera"
      style={[styles.button, { backgroundColor: colors.surface, borderColor: colors.border }, disabled && styles.disabled]}>
      <Text style={[styles.label, { color: colors.text }]}>Restart camera</Text>
    </PressableScale>
  </View>;
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: 16, gap: 8, alignItems: 'flex-start' },
  row: { gap: 8 },
  hint: { color: Colors.dark.text, backgroundColor: Colors.dark.background, padding: 8, borderRadius: 8, fontSize: 13 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 2 },
  label: { fontSize: 13, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
