import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, X } from 'lucide-react-native';
import { BorderRadius, Colors, Spacing, TypeScale } from '../../constants/theme';
import { PressableScale } from './PressableScale';
import { Surface } from './Surface';
import { useAccessibilityPreferences } from './useAccessibilityPreferences';

interface TeacherSearchSheetProps {
  visible: boolean;
  title: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  onClose: () => void;
  children: ReactNode;
}

export function TeacherSearchSheet({
  visible,
  title,
  placeholder,
  value,
  onChangeText,
  onClose,
  children,
}: TeacherSearchSheetProps) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { reduceMotion } = useAccessibilityPreferences();

  return (
    <Modal
      visible={visible}
      animationType={reduceMotion ? 'none' : 'slide'}
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
          <PressableScale
            accessibilityLabel={`Close ${title.toLocaleLowerCase()}`}
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: colors.surfaceSecondary }]}
          >
            <X size={20} color={colors.text} />
          </PressableScale>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Surface tone="material" style={styles.searchSurface}>
              <Search size={20} color={colors.textMuted} />
              <TextInput
                accessibilityLabel={title}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                returnKeyType="search"
                style={[styles.input, { color: colors.text }]}
                value={value}
              />
              {value ? (
                <PressableScale
                  accessibilityLabel="Clear search"
                  onPress={() => onChangeText('')}
                  style={[styles.clearButton, { backgroundColor: colors.surfaceSecondary }]}
                >
                  <X size={17} color={colors.textSecondary} />
                </PressableScale>
              ) : null}
            </Surface>
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    minHeight: 64,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  title: TypeScale.sectionTitle,
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: Spacing['4xl'], gap: Spacing.lg },
  searchSurface: {
    minHeight: 56,
    paddingVertical: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  input: { flex: 1, minHeight: 50, ...TypeScale.body },
  clearButton: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
