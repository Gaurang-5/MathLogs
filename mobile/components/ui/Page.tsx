import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, TypeScale } from '../../constants/theme';

export const TEACHER_TAB_CONTENT_INSET = 112;

interface TeacherPageProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  scrollProps?: ScrollViewProps;
}

export function TeacherPage({
  title,
  subtitle,
  actions,
  children,
  scroll = true,
  scrollProps,
}: TeacherPageProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const content = (
    <>
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
      {children}
    </>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          {...scrollProps}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={styles.staticContent}>{content}</View>
      )}
    </SafeAreaView>
  );
}

interface TeacherSectionProps {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function TeacherSection({ title, action, children }: TeacherSectionProps) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  return (
    <View style={styles.section}>
      {title || action ? (
        <View style={styles.sectionHeader}>
          {title ? <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text> : <View />}
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { padding: Spacing.xl, paddingBottom: TEACHER_TAB_CONTENT_INSET, gap: Spacing.xl },
  staticContent: { flex: 1, padding: Spacing.xl, paddingBottom: TEACHER_TAB_CONTENT_INSET },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: Spacing.md },
  headingCopy: { flex: 1, minWidth: 0 },
  title: TypeScale.pageTitle,
  subtitle: { ...TypeScale.body, marginTop: Spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  section: { gap: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  sectionTitle: TypeScale.sectionTitle,
});
