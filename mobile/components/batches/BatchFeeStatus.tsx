import { ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Check, Circle, Clock } from 'lucide-react-native';
import { BorderRadius, Colors, FontWeight, Spacing, TypeScale } from '../../constants/theme';
import type { RosterFeeStatus } from '../../utils/batchFees';

interface Props {
  fee?: RosterFeeStatus;
  mode: 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';
  loading?: boolean;
  paused?: boolean;
}

const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** The web roster's per-installment receipt states, adapted to a narrow phone row. */
export function BatchFeeStatus({ fee, mode, loading, paused }: Props) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  if (!fee) return (
    <View style={styles.copy} accessibilityLiveRegion="polite">
      <Text style={[styles.label, { color: colors.textSecondary }]}>{loading ? 'Loading fee status…' : paused ? 'Waiting for connection' : 'Fee status unavailable'}</Text>
      <Text style={[styles.detail, { color: colors.textMuted }]}>{loading ? 'Checking this student’s receipts.' : paused ? 'Reconnect to load fee details.' : 'Use Retry fee status to try again.'}</Text>
    </View>
  );

  if (mode === 'MONTH_COVERAGE' && fee.expected > 0) {
    const percentage = Math.min(100, Math.round(fee.received / fee.expected * 100));
    return (
      <View style={[styles.monthPanel, { backgroundColor: colors.surfaceSecondary }]}>
        <Text style={[styles.label, { color: colors.text }]}>{fee.received} / {fee.expected} months received</Text>
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Fee months received" accessibilityValue={{ min: 0, max: 100, now: percentage }} style={[styles.track, { backgroundColor: colors.border }]}>
          <View style={[styles.fill, { width: `${percentage}%`, backgroundColor: colors.positive }]} />
        </View>
        <Text style={[styles.detail, { color: fee.status === 'pending' ? colors.attention : colors.textSecondary }]}>{fee.title} · {fee.outstanding} {fee.outstanding === 1 ? 'month' : 'months'} pending</Text>
        {fee.detail.includes('overdue') ? <Text style={[styles.detail, { color: colors.attention }]}>{fee.detail.split(' · ').slice(1).join(' · ')}</Text> : null}
      </View>
    );
  }

  if (mode === 'CURRENT_DUE_BASED' && fee.items?.length) return (
    <View style={styles.copy}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {fee.items.map(item => {
          const color = item.status === 'paid' ? colors.positive : item.status === 'partial' ? colors.attention : colors.textSecondary;
          const Icon = item.status === 'paid' ? Check : item.status === 'partial' ? Clock : Circle;
          const status = item.status === 'paid' ? 'Received' : item.status === 'partial' ? 'Part paid' : 'Pending';
          return (
            <View key={item.id} accessible accessibilityLabel={`${item.label}. ${status}. ${money(item.received)} received, ${money(item.remaining)} pending.`} style={[styles.chip, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <View style={styles.chipTitle}>
                <Icon size={16} color={color} />
                <Text style={[styles.label, { color: colors.text }]}>{item.label}</Text>
              </View>
              <Text style={[styles.detail, { color }]}>{status}{item.status === 'paid' ? ` · ${money(item.received)}` : ` · ${money(item.remaining)} due`}</Text>
            </View>
          );
        })}
      </ScrollView>
      <Text style={[styles.detail, { color: colors.textSecondary }]}>{money(fee.received)} received · {money(fee.outstanding)} pending</Text>
    </View>
  );

  return (
    <View style={styles.copy}>
      <Text style={[styles.label, { color: colors.text }]}>{fee.title}</Text>
      <Text style={[styles.detail, { color: colors.textSecondary }]}>{fee.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  copy: { gap: 6 },
  label: { ...TypeScale.label, fontWeight: FontWeight.semibold, flexShrink: 1 },
  detail: { ...TypeScale.caption },
  chips: { gap: Spacing.sm, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md, gap: 5, maxWidth: 260 },
  chipTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthPanel: { borderRadius: BorderRadius.md, padding: Spacing.md, gap: 8 },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
