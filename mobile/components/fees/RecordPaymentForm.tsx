import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, IndianRupee, RefreshCw, WalletCards } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import api from '../../services/api';
import { executeOrQueueMutation, offlineQuery, updateCachedData } from '../../services/offlineSync';
import type { FeeDashboardStudent } from '../../utils/feeDashboard';
import {
  buildPaymentAllocations,
  createPaymentReference,
  paymentInputValue,
  selectedInstallmentTotal,
  type PaymentOption,
} from '../../utils/feePayment';
import { BorderRadius, Colors, FontWeight, Spacing, TypeScale } from '../../constants/theme';
import { Feedback, PressableScale, Surface } from '../ui';

export interface PaymentStudent {
  id: string;
  name: string;
  batchName: string;
  balance: number;
  humanId?: string | null;
}

interface RecordPaymentFormProps {
  student: PaymentStudent;
  onCancel?: () => void;
  onSuccess: (result: { amount: number; studentName: string; queued?: boolean }) => void;
}

function errorMessage(reason: unknown): string {
  if (typeof reason === 'object' && reason && 'response' in reason) {
    const response = (reason as { response?: { data?: { error?: string } } }).response;
    if (response?.data?.error) return response.data.error;
  }
  return 'The payment could not be saved. Your reference is preserved, so it is safe to retry.';
}

const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function RecordPaymentForm({ student, onCancel, onSuccess }: RecordPaymentFormProps) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const queryClient = useQueryClient();
  const reference = useRef(createPaymentReference(student.id));
  const [amount, setAmount] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery<{ studentId: string; installments: PaymentOption[] }>({
    queryKey: ['payment-options', student.id],
    queryFn: () => offlineQuery(`payment-options:${student.id}`, async () => (
      await api.get(`/fees/students/${student.id}/payment-options`)
    ).data),
    staleTime: 0,
  });

  const options = useMemo(
    () => (data?.installments ?? []).filter(option => option.remaining > 0),
    [data],
  );

  useEffect(() => {
    if (options.length === 0 || selectedIds.length > 0) return;
    setSelectedIds([options[0].id]);
    setAmount(String(options[0].remaining));
  }, [options, selectedIds.length]);

  const allocation = useMemo(
    () => buildPaymentAllocations(amount, selectedIds, options),
    [amount, options, selectedIds],
  );

  const toggleOption = (option: PaymentOption) => {
    if (submitting || submitError) return;
    setSelectedIds(previous => {
      const next = previous.includes(option.id)
        ? previous.filter(id => id !== option.id)
        : [...previous, option.id];
      const selectedTotal = selectedInstallmentTotal(next, options);
      setAmount(selectedTotal > 0 ? paymentInputValue(selectedTotal) : '');
      return next;
    });
  };

  const submit = async () => {
    if (!allocation.ok || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        studentId: student.id,
        amount,
        allocations: allocation.allocations,
        idempotencyKey: reference.current,
      };
      const result = await executeOrQueueMutation({
        method: 'POST',
        url: '/fees/pay',
        data: payload,
        idempotencyKey: reference.current,
      });
      if (result.status === 'synced') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['fees'] }),
          queryClient.invalidateQueries({ queryKey: ['quick-search-fees'] }),
          queryClient.invalidateQueries({ queryKey: ['recent-transactions'] }),
          queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
          queryClient.invalidateQueries({ queryKey: ['payment-options', student.id] }),
        ]);
      } else {
        const paymentDate = new Date().toISOString();
        const [updatedFees, updatedOptions] = await Promise.all([
          updateCachedData<FeeDashboardStudent[]>('fees-current-due', previous => (previous ?? []).map(item => (
            item.id === student.id ? {
              ...item,
              totalPaid: item.totalPaid + allocation.amount,
              balance: Math.max(0, item.balance - allocation.amount),
              lastPaymentDate: paymentDate,
            } : item
          ))),
          updateCachedData<{ studentId: string; installments: PaymentOption[] }>(`payment-options:${student.id}`, previous => ({
            studentId: student.id,
            installments: (previous?.installments ?? options).map(option => {
              const applied = allocation.allocations.find(item => item.installmentId === option.id)?.amount ?? 0;
              return applied > 0 ? {
                ...option,
                paid: option.paid + applied,
                remaining: Math.max(0, option.remaining - applied),
              } : option;
            }),
          })),
        ]);
        queryClient.setQueryData(['fees'], updatedFees);
        queryClient.setQueryData(['quick-search-fees'], updatedFees);
        queryClient.setQueryData(['payment-options', student.id], updatedOptions);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess({ amount: allocation.amount, studentName: student.name, queued: result.status === 'queued' });
    } catch (reason) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setSubmitError(errorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) {
    return <Feedback kind="loading" title="Loading applicable installments" description="Checking the student’s current fee plan." />;
  }

  if (isError) {
    return (
      <Feedback
        kind="error"
        title="Installments could not be loaded"
        description="Refresh before recording a payment so it is assigned correctly."
        action={(
          <PressableScale
            accessibilityLabel="Retry loading payment installments"
            haptic="selection"
            onPress={() => void refetch()}
            style={[styles.secondaryButton, { borderColor: colors.border }]}
          >
            <RefreshCw size={17} color={colors.text} />
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Try again</Text>
          </PressableScale>
        )}
      />
    );
  }

  if (options.length === 0) {
    return (
      <Feedback
        kind="warning"
        title="No payable installments"
        description="Set up this student’s fee plan before recording a payment."
        action={onCancel ? (
          <PressableScale accessibilityLabel="Choose another student" onPress={onCancel} style={styles.textAction}>
            <Text style={[styles.textActionLabel, { color: colors.text }]}>Choose another student</Text>
          </PressableScale>
        ) : undefined}
      />
    );
  }

  return (
    <View style={styles.container}>
      <Surface tone="strong" style={styles.studentCard}>
        <View style={[styles.studentIcon, { backgroundColor: colors.surfaceSecondary }]}>
          <WalletCards size={21} color={colors.text} />
        </View>
        <View style={styles.studentCopy}>
          <Text style={[styles.studentName, { color: colors.text }]} numberOfLines={1}>{student.name}</Text>
          <Text style={[styles.studentMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {[student.humanId, student.batchName].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={styles.balanceCopy}>
          <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>Due</Text>
          <Text style={[styles.balanceValue, { color: colors.attention }]}>{money(student.balance)}</Text>
        </View>
      </Surface>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Amount received</Text>
        <View style={[styles.amountField, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IndianRupee size={23} color={colors.textSecondary} />
          <TextInput
            accessibilityLabel="Payment amount in rupees"
            editable={!submitting && !submitError}
            keyboardType="decimal-pad"
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.focus}
            style={[styles.amountInput, { color: colors.text }]}
            value={amount}
          />
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <View style={styles.fieldHeading}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Apply payment to</Text>
          <Text style={[styles.helperCompact, { color: colors.textMuted }]}>Select in payment order</Text>
        </View>
        <View style={styles.optionStack}>
          {options.map(option => {
            const selected = selectedIds.includes(option.id);
            return (
              <PressableScale
                key={option.id}
                accessibilityLabel={`${selected ? 'Remove' : 'Select'} ${option.name}, ${money(option.remaining)} remaining`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected, disabled: submitting || Boolean(submitError) }}
                disabled={submitting || Boolean(submitError)}
                haptic="selection"
                onPress={() => toggleOption(option)}
                style={[
                  styles.option,
                  {
                    backgroundColor: selected ? colors.surfaceSecondary : colors.surface,
                    borderColor: selected ? colors.focus : colors.border,
                  },
                ]}
              >
                <View style={[styles.checkbox, { borderColor: selected ? colors.focus : colors.textMuted, backgroundColor: selected ? colors.focus : 'transparent' }]}>
                  {selected ? <Check size={15} color={colors.background} strokeWidth={3} /> : null}
                </View>
                <View style={styles.optionCopy}>
                  <Text style={[styles.optionName, { color: colors.text }]}>{option.name}</Text>
                  <Text style={[styles.optionMeta, { color: colors.textSecondary }]}>
                    {option.batchName} · {money(option.paid)} paid
                  </Text>
                </View>
                <Text style={[styles.optionRemaining, { color: colors.text }]}>{money(option.remaining)}</Text>
              </PressableScale>
            );
          })}
        </View>
      </View>

      <Surface style={styles.reviewCard}>
        <Text style={[styles.reviewTitle, { color: colors.text }]}>Payment review</Text>
        {allocation.ok ? allocation.allocations.map(row => {
          const option = options.find(item => item.id === row.installmentId);
          return (
            <View key={row.installmentId} style={styles.reviewRow}>
              <Text style={[styles.reviewName, { color: colors.textSecondary }]} numberOfLines={1}>{option?.name}</Text>
              <Text style={[styles.reviewAmount, { color: colors.text }]}>{money(row.amount)}</Text>
            </View>
          );
        }) : (
          <Text accessibilityRole="alert" style={[styles.validationText, { color: colors.attention }]}>{allocation.message}</Text>
        )}
      </Surface>

      {submitError ? (
        <Feedback
          kind="error"
          title="Payment not confirmed"
          description={submitError}
        />
      ) : null}

      <View style={styles.actions}>
        {onCancel && !submitError ? (
          <PressableScale
            accessibilityLabel="Cancel payment"
            disabled={submitting}
            onPress={onCancel}
            style={[styles.cancelButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
          </PressableScale>
        ) : null}
        <PressableScale
          accessibilityLabel={submitError ? 'Retry recording payment' : 'Confirm payment'}
          accessibilityState={{ disabled: !allocation.ok || submitting }}
          disabled={!allocation.ok || submitting}
          haptic="commit"
          onPress={() => void submit()}
          style={[
            styles.submitButton,
            { backgroundColor: colors.text, opacity: !allocation.ok || submitting ? 0.45 : 1 },
          ]}
        >
          {submitting ? <ActivityIndicator color={colors.background} /> : null}
          <Text style={[styles.submitText, { color: colors.background }]}>{submitting ? 'Saving…' : submitError ? 'Retry safely' : 'Confirm payment'}</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.xl },
  studentCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  studentIcon: { width: 44, height: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  studentCopy: { flex: 1, minWidth: 0 },
  studentName: { ...TypeScale.body, fontWeight: FontWeight.bold },
  studentMeta: { ...TypeScale.caption, marginTop: 2 },
  balanceCopy: { alignItems: 'flex-end' },
  balanceLabel: TypeScale.caption,
  balanceValue: { ...TypeScale.label, marginTop: 2 },
  fieldGroup: { gap: Spacing.sm },
  fieldHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  label: TypeScale.label,
  helperCompact: TypeScale.caption,
  amountField: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg },
  amountInput: { flex: 1, minHeight: 48, fontSize: 28, lineHeight: 34, fontWeight: FontWeight.bold },
  optionStack: { gap: Spacing.sm },
  option: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderWidth: 1, borderRadius: BorderRadius.lg },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1, minWidth: 0 },
  optionName: { ...TypeScale.label, fontWeight: FontWeight.bold },
  optionMeta: { ...TypeScale.caption, marginTop: 2 },
  optionRemaining: TypeScale.label,
  reviewCard: { gap: Spacing.sm },
  reviewTitle: { ...TypeScale.label, fontWeight: FontWeight.bold },
  reviewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  reviewName: { ...TypeScale.body, flex: 1 },
  reviewAmount: { ...TypeScale.label, fontWeight: FontWeight.bold },
  validationText: TypeScale.body,
  actions: { flexDirection: 'row', gap: Spacing.md },
  cancelButton: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: BorderRadius.lg },
  cancelText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  submitButton: { flex: 1.45, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderRadius: BorderRadius.lg },
  submitText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  secondaryButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, borderWidth: 1, borderRadius: BorderRadius.md },
  secondaryButtonText: TypeScale.label,
  textAction: { minHeight: 44, justifyContent: 'center' },
  textActionLabel: { ...TypeScale.label, textDecorationLine: 'underline' },
});
