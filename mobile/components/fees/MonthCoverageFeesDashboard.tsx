import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, ChevronRight, Clock3, IndianRupee, Search, Users } from 'lucide-react-native';
import api from '../../services/api';
import { offlineQuery } from '../../services/offlineSync';
import { BorderRadius, Colors, FontWeight, Spacing, TypeScale } from '../../constants/theme';
import { Feedback, PressableScale, Surface, TeacherPage, TeacherSearchSheet, TeacherSection } from '../ui';
import type { MonthCoverageStudent } from './MonthCoveragePaymentForm';

interface MonthPayment {
  id: string;
  studentName: string;
  batchName: string;
  amountRupees: number;
  paymentDate: string;
  coverageMonths: string[];
}

interface MonthCoverageSummary {
  feeMode: 'MONTH_COVERAGE';
  totals: {
    collectedRupees: number;
    receivedMonths: number;
    pendingMonths: number;
    overdueMonths: number;
    applicableMonths: number;
    progressPercent: number;
  };
  students: MonthCoverageStudent[];
  recentPayments: MonthPayment[];
}

const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function monthLabel(value?: string): string {
  if (!value) return 'No overdue month';
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function MonthCoverageFeesDashboard() {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const summaryQuery = useQuery<MonthCoverageSummary>({
    queryKey: ['month-coverage-summary'],
    queryFn: () => offlineQuery('fees-month-coverage', async () => (
      await api.get('/month-coverage/summary')
    ).data),
    staleTime: 0,
  });

  const students = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = summaryQuery.data?.students ?? [];
    return rows
      .filter(student => !needle || [student.name, student.humanId ?? '', student.batchName]
        .some(value => value.toLowerCase().includes(needle)))
      .sort((left, right) => {
        if (left.setupRequired !== right.setupRequired) return left.setupRequired ? -1 : 1;
        if (left.overdueMonths !== right.overdueMonths) return right.overdueMonths - left.overdueMonths;
        return left.name.localeCompare(right.name);
      });
  }, [search, summaryQuery.data?.students]);

  const recordFor = (studentId?: string) => {
    if (studentId) router.push({ pathname: '/quick-fee-modal', params: { studentId } } as never);
    else router.push('/quick-fee-modal' as never);
  };

  return (
    <>
    <TeacherPage
      title="Fees"
      actions={(
        <View style={styles.headerActions}>
          <PressableScale
            accessibilityLabel="Search student fee coverage"
            onPress={() => setIsSearchOpen(true)}
            style={[styles.headerSearchButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          >
            <Search size={19} color={colors.text} />
          </PressableScale>
          <PressableScale
            accessibilityLabel="Record a month coverage payment"
            haptic="selection"
            onPress={() => recordFor()}
            style={[styles.recordButton, { backgroundColor: colors.text }]}
          >
            <IndianRupee size={17} color={colors.background} />
            <Text style={[styles.recordButtonText, { color: colors.background }]}>Record</Text>
          </PressableScale>
        </View>
      )}
      scrollProps={{ keyboardDismissMode: 'on-drag', keyboardShouldPersistTaps: 'handled' }}
    >
      {summaryQuery.isLoading ? (
        <Feedback kind="loading" title="Loading fee coverage" description="Checking received and pending months." />
      ) : summaryQuery.isError || !summaryQuery.data ? (
        <Feedback
          kind="error"
          title="Fee coverage could not be loaded"
          description="Check your connection and try again."
          action={(
            <PressableScale onPress={() => void summaryQuery.refetch()} style={[styles.retryButton, { borderColor: colors.border }]}>
              <Text style={[styles.retryText, { color: colors.text }]}>Try again</Text>
            </PressableScale>
          )}
        />
      ) : (
        <>
          <Surface tone="strong" style={[styles.hero, { backgroundColor: colors.hero }]}>
            <View style={styles.heroTop}>
              <View>
                <Text style={[styles.heroEyebrow, { color: colors.heroText }]}>MONTHS RECEIVED</Text>
                <Text style={[styles.heroValue, { color: colors.heroText }]}>
                  {summaryQuery.data.totals.receivedMonths}
                  <Text style={styles.heroValueMuted}> / {summaryQuery.data.totals.applicableMonths}</Text>
                </Text>
              </View>
              <View style={styles.heroPercent}>
                <Text style={[styles.heroPercentText, { color: colors.heroText }]}>{summaryQuery.data.totals.progressPercent}%</Text>
              </View>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.heroEnd }]}>
              <View style={[styles.progressFill, { backgroundColor: colors.heroText, width: `${summaryQuery.data.totals.progressPercent}%` }]} />
            </View>
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatValue, { color: colors.heroText }]}>{summaryQuery.data.totals.pendingMonths}</Text>
                <Text style={[styles.heroStatLabel, { color: colors.heroText }]}>Pending months</Text>
              </View>
              <View style={[styles.heroDivider, { backgroundColor: colors.heroEnd }]} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatValue, { color: colors.heroText }]}>{summaryQuery.data.totals.overdueMonths}</Text>
                <Text style={[styles.heroStatLabel, { color: colors.heroText }]}>Overdue months</Text>
              </View>
              <View style={[styles.heroDivider, { backgroundColor: colors.heroEnd }]} />
              <View style={styles.heroStat}>
                <Text style={[styles.heroStatValue, { color: colors.heroText }]}>{money(summaryQuery.data.totals.collectedRupees)}</Text>
                <Text style={[styles.heroStatLabel, { color: colors.heroText }]}>Collected</Text>
              </View>
            </View>
          </Surface>

          <TeacherSection title="Students">
            <View style={styles.studentStack}>
              {students.length === 0 ? (
                <Feedback kind="empty" title="No matching students" description="Try a different name, ID, or batch." />
              ) : students.map(student => {
                const tone = student.setupRequired ? colors.attention : student.overdueMonths > 0 ? colors.attention : colors.positive;
                const title = student.setupRequired
                  ? 'Fee setup required'
                  : student.pendingMonths === 0
                    ? 'Coverage complete'
                    : `${student.pendingMonths} month${student.pendingMonths === 1 ? '' : 's'} pending`;
                const detail = student.setupRequired
                  ? 'Confirm the first fee month from the batch roster.'
                  : student.overdueMonths > 0
                    ? `${student.overdueMonths} overdue · oldest ${monthLabel((student as MonthCoverageStudent & { oldestOverdueMonth?: string | null }).oldestOverdueMonth ?? undefined)}`
                    : `${student.receivedMonths ?? 0} month${student.receivedMonths === 1 ? '' : 's'} received`;
                return (
                  <Surface key={student.studentId} style={styles.studentRow}>
                    <View style={[styles.studentIcon, { backgroundColor: colors.surfaceSecondary }]}>
                      {student.setupRequired ? <Clock3 size={19} color={tone} /> : <Users size={19} color={tone} />}
                    </View>
                    <View style={styles.studentCopy}>
                      <Text style={[styles.studentName, { color: colors.text }]} numberOfLines={1}>{student.name}</Text>
                      <Text style={[styles.studentMeta, { color: colors.textSecondary }]} numberOfLines={1}>{student.batchName} · {detail}</Text>
                    </View>
                    <View style={styles.studentTrailing}>
                      <Text style={[styles.studentStatus, { color: tone }]}>{title}</Text>
                      {!student.setupRequired && student.pendingMonths > 0 ? (
                        <PressableScale
                          accessibilityLabel={`Record fee for ${student.name}`}
                          haptic="selection"
                          onPress={() => recordFor(student.studentId)}
                          style={[styles.rowAction, { backgroundColor: colors.text }]}
                        >
                          <Text style={[styles.rowActionText, { color: colors.background }]}>Record</Text>
                          <ChevronRight size={14} color={colors.background} />
                        </PressableScale>
                      ) : null}
                    </View>
                  </Surface>
                );
              })}
            </View>
          </TeacherSection>

          <TeacherSection title="Recent payments">
            {summaryQuery.data.recentPayments.length === 0 ? (
              <Feedback kind="empty" title="No payments yet" description="Recorded month-coverage payments will appear here." />
            ) : (
              <Surface style={styles.paymentList}>
                {summaryQuery.data.recentPayments.slice(0, 8).map((payment, index) => (
                  <View key={payment.id} style={[styles.paymentRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: 1 }]}>
                    <View style={[styles.paymentIcon, { backgroundColor: colors.surfaceSecondary }]}>
                      <CalendarCheck2 size={18} color={colors.positive} />
                    </View>
                    <View style={styles.paymentCopy}>
                      <Text style={[styles.paymentName, { color: colors.text }]}>{payment.studentName}</Text>
                      <Text style={[styles.paymentMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                        {payment.batchName} · {payment.coverageMonths.map(monthLabel).join(', ')}
                      </Text>
                    </View>
                    <Text style={[styles.paymentAmount, { color: colors.positive }]}>{money(payment.amountRupees)}</Text>
                  </View>
                ))}
              </Surface>
            )}
          </TeacherSection>
        </>
      )}
    </TeacherPage>
    <TeacherSearchSheet
      visible={isSearchOpen}
      title="Search student fees"
      placeholder="Search by name, ID, or batch"
      value={search}
      onChangeText={setSearch}
      onClose={() => {
        setIsSearchOpen(false);
        setSearch('');
      }}
    >
      <View style={styles.studentStack}>
        {students.length === 0 ? (
          <Feedback kind="empty" title="No matching students" description="Try another name, ID, or batch." />
        ) : students.map(student => {
          const tone = student.setupRequired || student.overdueMonths > 0 ? colors.attention : colors.positive;
          return (
            <Surface key={student.studentId} style={styles.studentRow}>
              <View style={[styles.studentIcon, { backgroundColor: colors.surfaceSecondary }]}>
                {student.setupRequired ? <Clock3 size={19} color={tone} /> : <Users size={19} color={tone} />}
              </View>
              <View style={styles.studentCopy}>
                <Text style={[styles.studentName, { color: colors.text }]} numberOfLines={1}>{student.name}</Text>
                <Text style={[styles.studentMeta, { color: colors.textSecondary }]} numberOfLines={1}>{student.batchName}</Text>
              </View>
              {!student.setupRequired && student.pendingMonths > 0 ? (
                <PressableScale
                  accessibilityLabel={`Record fee for ${student.name}`}
                  onPress={() => {
                    setIsSearchOpen(false);
                    setSearch('');
                    recordFor(student.studentId);
                  }}
                  style={[styles.rowAction, { backgroundColor: colors.text }]}
                >
                  <Text style={[styles.rowActionText, { color: colors.background }]}>Record</Text>
                </PressableScale>
              ) : null}
            </Surface>
          );
        })}
      </View>
    </TeacherSearchSheet>
    </>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerSearchButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: BorderRadius.full },
  recordButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full },
  recordButtonText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  retryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.md, borderWidth: 1, borderRadius: BorderRadius.md },
  retryText: TypeScale.label,
  hero: { gap: Spacing.lg, borderWidth: 0 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.md },
  heroEyebrow: { ...TypeScale.caption, opacity: 0.72 },
  heroValue: { fontSize: 32, lineHeight: 38, fontWeight: FontWeight.bold, marginTop: Spacing.xs },
  heroValueMuted: { opacity: 0.58 },
  heroPercent: { minWidth: 58, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.full },
  heroPercentText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  progressTrack: { height: 7, borderRadius: BorderRadius.full, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: BorderRadius.full },
  heroStats: { flexDirection: 'row', alignItems: 'stretch' },
  heroStat: { flex: 1 },
  heroStatValue: { ...TypeScale.sectionTitle, fontWeight: FontWeight.bold },
  heroStatLabel: { ...TypeScale.caption, opacity: 0.65, marginTop: 2 },
  heroDivider: { width: 1, marginHorizontal: Spacing.md, opacity: 0.5 },
  studentStack: { gap: Spacing.sm },
  studentRow: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  studentIcon: { width: 42, height: 42, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  studentCopy: { flex: 1, minWidth: 0 },
  studentName: { ...TypeScale.body, fontWeight: FontWeight.bold },
  studentMeta: { ...TypeScale.caption, marginTop: 3 },
  studentTrailing: { alignItems: 'flex-end', gap: Spacing.xs, maxWidth: 116 },
  studentStatus: { ...TypeScale.caption, textAlign: 'right', fontWeight: FontWeight.bold },
  rowAction: { minHeight: 36, minWidth: 78, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.full },
  rowActionText: { ...TypeScale.caption, fontWeight: FontWeight.bold },
  paymentList: { paddingVertical: 0 },
  paymentRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  paymentIcon: { width: 38, height: 38, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  paymentCopy: { flex: 1, minWidth: 0 },
  paymentName: { ...TypeScale.label, fontWeight: FontWeight.bold },
  paymentMeta: { ...TypeScale.caption, marginTop: 2 },
  paymentAmount: { ...TypeScale.label, fontWeight: FontWeight.bold },
});
