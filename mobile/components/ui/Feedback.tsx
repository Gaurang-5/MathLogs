import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from 'lucide-react-native';
import { BorderRadius, Colors, FontWeight, Spacing, TypeScale } from '../../constants/theme';

type FeedbackKind = 'loading' | 'empty' | 'success' | 'warning' | 'error';

interface FeedbackProps {
  kind: FeedbackKind;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function Feedback({ kind, title, description, action }: FeedbackProps) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const statusColor = kind === 'error' ? Colors.error : kind === 'warning' ? Colors.warning : kind === 'success' ? Colors.success : colors.textSecondary;
  const Icon = kind === 'error' ? AlertCircle : kind === 'warning' ? TriangleAlert : kind === 'success' ? CheckCircle2 : Info;

  return (
    <View
      accessibilityRole={kind === 'error' || kind === 'warning' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.container, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
    >
      {kind === 'loading' ? <ActivityIndicator color={colors.text} /> : <Icon size={20} color={statusColor} />}
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {description ? <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text> : null}
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, borderRadius: BorderRadius.xl, borderWidth: 1, padding: Spacing.lg },
  copy: { flex: 1 },
  title: { ...TypeScale.label, fontWeight: FontWeight.semibold },
  description: { ...TypeScale.body, marginTop: Spacing.xs },
  action: { marginTop: Spacing.md, alignSelf: 'flex-start' },
});
