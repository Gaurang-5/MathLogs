import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, IndianRupee } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import api from '../../services/api';
import { executeOrQueueMutation, offlineQuery, updateCachedData } from '../../services/offlineSync';
import { BorderRadius, Colors, FontWeight, Spacing, TypeScale } from '../../constants/theme';
import { Feedback, PressableScale, Surface } from '../ui';
import { createPaymentReference, paymentAmountInPaise } from '../../utils/feePayment';

export type MonthCoverageDuration = 'MONTHLY' | 'QUARTERLY' | 'HALF_YEARLY' | 'YEARLY';

export interface MonthCoverageStudent {
  studentId: string;
  name: string;
  humanId?: string | null;
  batchName: string;
  pendingMonths: number;
  overdueMonths: number;
  receivedMonths?: number;
  oldestOverdueMonth?: string | null;
  setupRequired: boolean;
}

interface MonthCoveragePreview {
  coverageMonths: string[];
  remainingMonthsAfterPayment: number;
  gapWarning: { skippedMonths: string[] } | null;
}

interface Props {
  student: MonthCoverageStudent;
  onCancel?: () => void;
  onSuccess: (result: { amount: number; studentName: string; queued?: boolean }) => void;
}

const durationOptions: Array<{ value: MonthCoverageDuration; label: string }> = [
  { value: 'MONTHLY', label: '1 month' },
  { value: 'QUARTERLY', label: '3 months' },
  { value: 'HALF_YEARLY', label: '6 months' },
  { value: 'YEARLY', label: '12 months' },
];

function displayMonth(value: string): string {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function coverageRange(months: string[]): string {
  if (months.length === 0) return 'No months selected';
  if (months.length === 1) return displayMonth(months[0]);
  return `${displayMonth(months[0])} – ${displayMonth(months[months.length - 1])}`;
}

function apiError(reason: unknown, fallback: string): string {
  if (typeof reason === 'object' && reason && 'response' in reason) {
    const code = (reason as { response?: { data?: { error?: string } } }).response?.data?.error;
    if (code === 'INSUFFICIENT_REMAINING_MONTHS') return 'That duration is longer than the remaining fee period.';
    if (code) return code.replace(/_/g, ' ').toLowerCase().replace(/^./, character => character.toUpperCase());
  }
  return fallback;
}

export function MonthCoveragePaymentForm({ student, onCancel, onSuccess }: Props) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const queryClient = useQueryClient();
  const reference = useRef(createPaymentReference(student.studentId));
  const [amount, setAmount] = useState('');
  const [duration, setDuration] = useState<MonthCoverageDuration>('MONTHLY');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const previewQuery = useQuery<MonthCoveragePreview>({
    queryKey: ['month-coverage-preview', student.studentId, duration],
    queryFn: () => offlineQuery(`month-payment-preview:${student.studentId}:${duration}`, async () => {
      const response = await api.post('/month-coverage/payments/preview', {
        studentId: student.studentId,
        duration,
        requestedStartMonth: null,
        allowGap: false,
      });
      return response.data;
    }),
    retry: false,
  });

  useEffect(() => {
    setSubmitError('');
  }, [duration]);

  const numericAmount = paymentAmountInPaise(amount);
  const ready = Boolean(previewQuery.data && numericAmount && !submitError);

  const submit = async () => {
    if (!previewQuery.data || numericAmount === null || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const date = new Date().toISOString().slice(0, 10);
      const payload = {
        studentId: student.studentId,
        amount: numericAmount / 100,
        paymentDate: `${date}T12:00:00.000Z`,
        paymentMethod: 'CASH',
        duration,
        requestedStartMonth: null,
        allowGap: false,
      };
      const result = await executeOrQueueMutation({
        method: 'POST',
        url: '/month-coverage/payments',
        data: payload,
        idempotencyKey: reference.current,
      });
      if (result.status === 'synced') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['month-coverage-summary'] }),
          queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
        ]);
      } else {
        type CachedSummary = {
          feeMode: 'MONTH_COVERAGE';
          totals: {
            collectedRupees: number; receivedMonths: number; pendingMonths: number;
            overdueMonths: number; applicableMonths: number; progressPercent: number;
          };
          students: MonthCoverageStudent[];
          recentPayments: unknown[];
        };
        const coveredCount = previewQuery.data.coverageMonths.length;
        const updatedSummary = await updateCachedData<CachedSummary>('fees-month-coverage', previous => {
          if (!previous) return {
            feeMode: 'MONTH_COVERAGE',
            totals: { collectedRupees: numericAmount / 100, receivedMonths: coveredCount, pendingMonths: 0, overdueMonths: 0, applicableMonths: coveredCount, progressPercent: 100 },
            students: [],
            recentPayments: [],
          };
          const totals = {
            ...previous.totals,
            collectedRupees: previous.totals.collectedRupees + numericAmount / 100,
            receivedMonths: previous.totals.receivedMonths + coveredCount,
            pendingMonths: Math.max(0, previous.totals.pendingMonths - coveredCount),
            overdueMonths: Math.max(0, previous.totals.overdueMonths - Math.min(student.overdueMonths, coveredCount)),
          };
          totals.progressPercent = totals.applicableMonths > 0
            ? Math.min(100, Math.round((totals.receivedMonths / totals.applicableMonths) * 100))
            : 0;
          return {
            ...previous,
            totals,
            students: previous.students.map(item => item.studentId === student.studentId ? {
              ...item,
              receivedMonths: (item.receivedMonths ?? 0) + coveredCount,
              pendingMonths: Math.max(0, item.pendingMonths - coveredCount),
              overdueMonths: Math.max(0, item.overdueMonths - Math.min(item.overdueMonths, coveredCount)),
            } : item),
          };
        });
        queryClient.setQueryData(['month-coverage-summary'], updatedSummary);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess({ amount: numericAmount / 100, studentName: student.name, queued: result.status === 'queued' });
    } catch (reason) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSubmitError(apiError(reason, 'The payment was not confirmed. The same reference will be used if you retry.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Surface tone="strong" style={styles.studentCard}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceSecondary }]}>
          <CalendarDays size={21} color={colors.text} />
        </View>
        <View style={styles.studentCopy}>
          <Text style={[styles.studentName, { color: colors.text }]}>{student.name}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>{student.batchName}</Text>
        </View>
        <View style={styles.pendingCopy}>
          <Text style={[styles.pendingValue, { color: colors.attention }]}>{student.pendingMonths}</Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>months pending</Text>
        </View>
      </Surface>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Amount received</Text>
        <View style={[styles.amountField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IndianRupee size={22} color={colors.textSecondary} />
          <TextInput
            accessibilityLabel="Payment amount in rupees"
            editable={!submitting && !submitError}
            keyboardType="decimal-pad"
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            style={[styles.amountInput, { color: colors.text }]}
            value={amount}
          />
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Months covered</Text>
        <View style={styles.durationGrid}>
          {durationOptions.map(option => {
            const selected = duration === option.value;
            return (
              <PressableScale
                key={option.value}
                accessibilityLabel={option.label}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: submitting || Boolean(submitError) }}
                disabled={submitting || Boolean(submitError)}
                haptic="selection"
                onPress={() => setDuration(option.value)}
                style={[
                  styles.durationButton,
                  { backgroundColor: selected ? colors.text : colors.surface, borderColor: selected ? colors.text : colors.border },
                ]}
              >
                {selected ? <Check size={15} color={colors.background} /> : null}
                <Text style={[styles.durationText, { color: selected ? colors.background : colors.text }]}>{option.label}</Text>
              </PressableScale>
            );
          })}
        </View>
      </View>

      {previewQuery.isLoading ? (
        <Feedback kind="loading" title="Checking oldest pending month" />
      ) : previewQuery.isError ? (
        <Feedback
          kind="error"
          title="This coverage cannot be previewed"
          description={apiError(previewQuery.error, 'Try another duration or refresh the fee setup.')}
        />
      ) : previewQuery.data ? (
        <Surface style={styles.previewCard}>
          <Text style={[styles.previewEyebrow, { color: colors.positive }]}>THIS PAYMENT COVERS</Text>
          <Text style={[styles.previewRange, { color: colors.text }]}>{coverageRange(previewQuery.data.coverageMonths)}</Text>
          <Text style={[styles.previewMeta, { color: colors.textSecondary }]}>
            {previewQuery.data.remainingMonthsAfterPayment} month{previewQuery.data.remainingMonthsAfterPayment === 1 ? '' : 's'} will remain pending.
          </Text>
        </Surface>
      ) : null}

      {submitError ? <Feedback kind="error" title="Payment not confirmed" description={submitError} /> : null}

      <View style={styles.actions}>
        {onCancel && !submitError ? (
          <PressableScale disabled={submitting} onPress={onCancel} style={[styles.cancelButton, { borderColor: colors.border }]}>
            <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
          </PressableScale>
        ) : null}
        <PressableScale
          accessibilityLabel={submitError ? 'Retry recording month coverage payment' : 'Save month coverage payment'}
          accessibilityState={{ disabled: !ready || submitting }}
          disabled={!ready || submitting}
          haptic="commit"
          onPress={() => void submit()}
          style={[styles.submitButton, { backgroundColor: colors.text, opacity: !ready || submitting ? 0.45 : 1 }]}
        >
          {submitting ? <ActivityIndicator color={colors.background} /> : null}
          <Text style={[styles.submitText, { color: colors.background }]}>{submitting ? 'Saving…' : submitError ? 'Retry safely' : 'Save payment'}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.xl },
  studentCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  icon: { width: 44, height: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  studentCopy: { flex: 1, minWidth: 0 },
  studentName: { ...TypeScale.body, fontWeight: FontWeight.bold },
  meta: TypeScale.caption,
  pendingCopy: { alignItems: 'flex-end' },
  pendingValue: { ...TypeScale.sectionTitle, fontWeight: FontWeight.bold },
  fieldGroup: { gap: Spacing.sm },
  label: TypeScale.label,
  amountField: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg },
  amountInput: { flex: 1, minHeight: 48, fontSize: 28, lineHeight: 34, fontWeight: FontWeight.bold },
  durationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  durationButton: { minHeight: 46, flexGrow: 1, flexBasis: '44%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, borderWidth: 1, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md },
  durationText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  previewCard: { gap: Spacing.xs },
  previewEyebrow: { ...TypeScale.caption, fontWeight: FontWeight.bold },
  previewRange: { ...TypeScale.sectionTitle, fontWeight: FontWeight.bold },
  previewMeta: TypeScale.body,
  actions: { flexDirection: 'row', gap: Spacing.md },
  cancelButton: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: BorderRadius.lg },
  cancelText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  submitButton: { flex: 1.45, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderRadius: BorderRadius.lg },
  submitText: { ...TypeScale.label, fontWeight: FontWeight.bold },
});
