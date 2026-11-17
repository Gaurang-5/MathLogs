import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View, useColorScheme, useWindowDimensions, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Spacing, TypeScale } from '../../constants/theme';

export const TEACHER_TAB_CONTENT_INSET = 112;

interface TeacherPageProps {
  title: string;
  eyebrow?: string;
  headerLayout?: 'inline' | 'stacked' | 'compact';
  compactTitle?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  scrollProps?: ScrollViewProps;
}

export function TeacherPage({
  title,
  eyebrow,
  headerLayout = 'inline',
  compactTitle,
  subtitle,
  actions,
  children,
  scroll = true,
  scrollProps,
}: TeacherPageProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const { width, fontScale } = useWindowDimensions();
  const compact = headerLayout === 'compact';
  const visibleTitle = compact && compactTitle && width / fontScale < 360 ? compactTitle : title;
  const content = (
    <>
      {compact ? (
        <View style={styles.compactHeader}>
          <View style={styles.headingCopy}>
            {eyebrow ? <Text style={[styles.compactEyebrow, { color: colors.textSecondary }]}>{eyebrow}</Text> : null}
            <Text accessibilityRole="header" accessibilityLabel={title} style={[styles.compactTitle, { color: colors.text }]}>{visibleTitle}</Text>
            {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
          </View>
          {actions ? <View style={styles.actions}>{actions}</View> : null}
        </View>
      ) : headerLayout === 'stacked' ? (
        <View style={styles.stackedHeader}>
          <View style={styles.headerToolbar}>
            {eyebrow ? <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>{eyebrow}</Text> : <View style={styles.headingCopy} />}
            {actions ? <View style={styles.actions}>{actions}</View> : null}
          </View>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
        </View>
      ) : <View style={styles.header}>
        <View style={styles.headingCopy}>
          {eyebrow ? <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>{eyebrow}</Text> : null}
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
        </View>
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>}
      {children}
    </>
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      {scroll ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          contentContainerStyle={[styles.content, headerLayout !== 'inline' && styles.compactTop]}
          {...scrollProps}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.staticContent, headerLayout !== 'inline' && styles.compactTop]}>{content}</View>
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
  staticContent: { flex: 1, padding: Spacing.xl, paddingBottom: 0 },
  compactTop: { paddingTop: Spacing.xs },
  compactHeader: { flexDirection: 'row', minHeight: 44, alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  compactTitle: TypeScale.sectionTitle,
  compactEyebrow: { ...TypeScale.caption, fontWeight: '400', marginBottom: 2 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: Spacing.md },
  stackedHeader: { gap: Spacing.xs },
  headerToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  eyebrow: { ...TypeScale.label, fontWeight: '400', flex: 1 },
  headingCopy: { flex: 1, minWidth: 0 },
  title: TypeScale.pageTitle,
  subtitle: { ...TypeScale.body, marginTop: Spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  section: { gap: Spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  sectionTitle: TypeScale.sectionTitle,
});
