import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, Search, User, X } from 'lucide-react-native';
import api from '../services/api';
import { offlineQuery } from '../services/offlineSync';
import { BorderRadius, Colors, FontWeight, Spacing, TypeScale } from '../constants/theme';
import { Feedback, PressableScale, Surface } from '../components/ui';
import { RecordPaymentForm, type PaymentStudent } from '../components/fees/RecordPaymentForm';
import {
  MonthCoveragePaymentForm,
  type MonthCoverageStudent,
} from '../components/fees/MonthCoveragePaymentForm';

type FeeMode = 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';
type SuccessState = { amount: number; studentName: string; queued?: boolean } | null;

interface FeeStudent extends PaymentStudent {
  phone?: string | null;
}

interface MonthCoverageSummary {
  feeMode: 'MONTH_COVERAGE';
  students: MonthCoverageStudent[];
}

const money = (amount: number) => `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function QuickFeeScreen() {
  const router = useRouter();
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const [search, setSearch] = useState('');
  const [selectedCurrentDueStudent, setSelectedCurrentDueStudent] = useState<FeeStudent | null>(null);
  const [selectedMonthStudent, setSelectedMonthStudent] = useState<MonthCoverageStudent | null>(null);
  const [success, setSuccess] = useState<SuccessState>(null);

  const modeQuery = useQuery<FeeMode>({
    queryKey: ['dashboard-summary', 'fee-mode'],
    queryFn: () => offlineQuery('fee-mode', async () => (
      await api.get('/dashboard/summary')
    ).data.feeMode as FeeMode),
  });
  const feeMode = modeQuery.data;

  const currentDueQuery = useQuery<FeeStudent[]>({
    queryKey: ['quick-search-fees'],
    queryFn: () => offlineQuery('fees-current-due', async () => (await api.get('/fees')).data),
    enabled: feeMode === 'CURRENT_DUE_BASED',
  });

  const monthQuery = useQuery<MonthCoverageSummary>({
    queryKey: ['month-coverage-summary'],
    queryFn: () => offlineQuery('fees-month-coverage', async () => (
      await api.get('/month-coverage/summary')
    ).data),
    enabled: feeMode === 'MONTH_COVERAGE',
  });

  useEffect(() => {
    if (!studentId || selectedCurrentDueStudent || selectedMonthStudent || success) return;
    if (feeMode === 'CURRENT_DUE_BASED') {
      const match = currentDueQuery.data?.find(student => student.id === studentId && student.balance > 0);
      if (match) setSelectedCurrentDueStudent(match);
    }
    if (feeMode === 'MONTH_COVERAGE') {
      const match = monthQuery.data?.students.find(student => student.studentId === studentId && !student.setupRequired && student.pendingMonths > 0);
      if (match) setSelectedMonthStudent(match);
    }
  }, [currentDueQuery.data, feeMode, monthQuery.data?.students, selectedCurrentDueStudent, selectedMonthStudent, studentId, success]);

  const searchResults = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle || selectedCurrentDueStudent || selectedMonthStudent || success) return [];
    if (feeMode === 'MONTH_COVERAGE') {
      return (monthQuery.data?.students ?? [])
        .filter(student => !student.setupRequired && student.pendingMonths > 0)
        .filter(student => [student.name, student.humanId ?? '', student.batchName]
          .some(value => value.toLowerCase().includes(needle)))
        .slice(0, 8);
    }
    return (currentDueQuery.data ?? [])
      .filter(student => student.balance > 0)
      .filter(student => [student.name, student.humanId ?? '', student.phone ?? '', student.batchName]
        .some(value => value.toLowerCase().includes(needle)))
      .slice(0, 8);
  }, [currentDueQuery.data, feeMode, monthQuery.data?.students, search, selectedCurrentDueStudent, selectedMonthStudent, success]);

  const reset = () => {
    setSelectedCurrentDueStudent(null);
    setSelectedMonthStudent(null);
    setSearch('');
    setSuccess(null);
  };

  const loading = modeQuery.isLoading
    || (feeMode === 'CURRENT_DUE_BASED' && currentDueQuery.isLoading)
    || (feeMode === 'MONTH_COVERAGE' && monthQuery.isLoading);
  const loadError = modeQuery.isError
    || (feeMode === 'CURRENT_DUE_BASED' && currentDueQuery.isError)
    || (feeMode === 'MONTH_COVERAGE' && monthQuery.isError);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headingCopy}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>COLLECTION</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Record fee</Text>
          </View>
          <PressableScale accessibilityLabel="Close record fee" onPress={() => router.back()} style={[styles.closeButton, { backgroundColor: colors.surfaceSecondary }]}>
            <X size={21} color={colors.text} />
          </PressableScale>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <Feedback kind="loading" title="Loading students" description="Checking the institute’s active fee system." />
          ) : loadError ? (
            <Feedback
              kind="error"
              title="Fee records could not be loaded"
              description="Check the connection and try again."
              action={(
                <PressableScale
                  accessibilityLabel="Retry loading fee records"
                  onPress={() => {
                    void modeQuery.refetch();
                    if (feeMode === 'CURRENT_DUE_BASED') void currentDueQuery.refetch();
                    if (feeMode === 'MONTH_COVERAGE') void monthQuery.refetch();
                  }}
                  style={[styles.outlineAction, { borderColor: colors.border }]}
                >
                  <Text style={[styles.outlineActionText, { color: colors.text }]}>Try again</Text>
                </PressableScale>
              )}
            />
          ) : success ? (
            <Surface tone="strong" style={styles.successCard}>
              <View style={[styles.successIcon, { backgroundColor: Colors.successBg }]}>
                <CheckCircle2 size={34} color={Colors.success} />
              </View>
              <Text accessibilityRole="header" style={[styles.successTitle, { color: colors.text }]}>
                {success.queued ? 'Payment saved offline' : 'Payment recorded'}
              </Text>
              <Text style={[styles.successDescription, { color: colors.textSecondary }]}>
                {success.queued
                  ? `${money(success.amount)} for ${success.studentName} will sync when the connection returns.`
                  : `${money(success.amount)} received from ${success.studentName}.`}
              </Text>
              <View style={styles.successActions}>
                <PressableScale accessibilityLabel="Record another fee" onPress={reset} style={[styles.outlineAction, { borderColor: colors.border }]}>
                  <Text style={[styles.outlineActionText, { color: colors.text }]}>Record another</Text>
                </PressableScale>
                <PressableScale accessibilityLabel="Finish recording fee" onPress={() => router.back()} style={[styles.primaryAction, { backgroundColor: colors.text }]}>
                  <Text style={[styles.primaryActionText, { color: colors.background }]}>Done</Text>
                </PressableScale>
              </View>
            </Surface>
          ) : selectedCurrentDueStudent ? (
            <RecordPaymentForm student={selectedCurrentDueStudent} onCancel={reset} onSuccess={setSuccess} />
          ) : selectedMonthStudent ? (
            <MonthCoveragePaymentForm student={selectedMonthStudent} onCancel={reset} onSuccess={setSuccess} />
          ) : (
            <>
              <View style={styles.intro}>
                <Text style={[styles.introTitle, { color: colors.text }]}>Find a student</Text>
                <Text style={[styles.introDescription, { color: colors.textSecondary }]}>
                  {feeMode === 'MONTH_COVERAGE'
                    ? 'Select a student, preview the exact months covered, then confirm.'
                    : 'Select a student, choose the correct installment, then review the allocation.'}
                </Text>
              </View>

              <Surface tone="material" style={styles.searchSurface}>
                <Search size={20} color={colors.textMuted} />
                <TextInput
                  accessibilityLabel="Search students for fee payment"
                  autoFocus
                  autoCorrect={false}
                  onChangeText={setSearch}
                  placeholder="Name, student ID, phone, or batch"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="search"
                  style={[styles.searchInput, { color: colors.text }]}
                  value={search}
                />
              </Surface>

              {search.trim() ? (
                <View style={styles.results}>
                  {searchResults.length > 0 ? searchResults.map(result => {
                    const monthResult = 'studentId' in result;
                    const id = monthResult ? result.studentId : result.id;
                    const trailing = monthResult
                      ? `${result.pendingMonths} month${result.pendingMonths === 1 ? '' : 's'}`
                      : money(result.balance);
                    return (
                      <PressableScale
                        key={id}
                        accessibilityLabel={`Select ${result.name}, ${trailing} pending`}
                        haptic="selection"
                        onPress={() => {
                          if (monthResult) setSelectedMonthStudent(result);
                          else setSelectedCurrentDueStudent(result);
                          setSearch('');
                        }}
                      >
                        <Surface style={styles.resultCard}>
                          <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
                            <User size={19} color={colors.textSecondary} />
                          </View>
                          <View style={styles.resultCopy}>
                            <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>{result.name}</Text>
                            <Text style={[styles.resultMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                              {[result.humanId, result.batchName].filter(Boolean).join(' · ')}
                            </Text>
                          </View>
                          <View style={styles.resultTrailing}>
                            <Text style={[styles.resultAmount, { color: colors.attention }]}>{trailing}</Text>
                            <ChevronRight size={18} color={colors.textMuted} />
                          </View>
                        </Surface>
                      </PressableScale>
                    );
                  }) : (
                    <Feedback kind="empty" title="No matching payable students" description="Try a name, student ID, phone number, or batch." />
                  )}
                </View>
              ) : (
                <Feedback
                  kind="empty"
                  title="Search to begin"
                  description="Only students with an outstanding installment or pending fee month will appear."
                />
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  headingCopy: { flex: 1 },
  eyebrow: { ...TypeScale.caption, fontWeight: FontWeight.bold },
  title: { ...TypeScale.sectionTitle, fontWeight: FontWeight.bold, marginTop: 2 },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.full },
  content: { flexGrow: 1, padding: Spacing.xl, paddingBottom: Spacing['5xl'], gap: Spacing.xl },
  intro: { gap: Spacing.xs },
  introTitle: TypeScale.sectionTitle,
  introDescription: TypeScale.body,
  searchSurface: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 0 },
  searchInput: { flex: 1, minHeight: 48, ...TypeScale.body },
  results: { gap: Spacing.sm },
  resultCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  avatar: { width: 42, height: 42, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  resultCopy: { flex: 1, minWidth: 0 },
  resultName: { ...TypeScale.body, fontWeight: FontWeight.bold },
  resultMeta: { ...TypeScale.caption, marginTop: 2 },
  resultTrailing: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  resultAmount: { ...TypeScale.label, fontWeight: FontWeight.bold },
  outlineAction: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, borderWidth: 1, borderRadius: BorderRadius.lg },
  outlineActionText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  primaryAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl, borderRadius: BorderRadius.lg },
  primaryActionText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  successCard: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing['3xl'] },
  successIcon: { width: 68, height: 68, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center' },
  successTitle: TypeScale.sectionTitle,
  successDescription: { ...TypeScale.body, textAlign: 'center' },
  successActions: { width: '100%', flexDirection: 'row', justifyContent: 'center', gap: Spacing.md, marginTop: Spacing.sm },
});
