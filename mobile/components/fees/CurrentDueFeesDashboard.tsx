import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  IndianRupee,
  Mail,
  ReceiptText,
  Search,
  WalletCards,
  X,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import api from '../../services/api';
import { offlineQuery } from '../../services/offlineSync';
import {
  feeCollectionStats,
  feeStudentState,
  filterFeeStudents,
  type FeeDashboardStudent,
  type FeeStudentFilter,
} from '../../utils/feeDashboard';
import { BorderRadius, Colors, FontWeight, Spacing, TypeScale } from '../../constants/theme';
import { Feedback, PressableScale, Surface, TEACHER_TAB_CONTENT_INSET, TeacherPage, TeacherSearchSheet } from '../ui';
import { RecordPaymentForm } from './RecordPaymentForm';
import { useProUpgrade } from '../../contexts/ProUpgradeContext';
import { isProPlanRequiredError } from '../../services/proFeatureGate';

interface Transaction {
  id: string;
  studentName: string;
  batchName: string;
  amount: number;
  date: string;
  type: string;
}

interface CustomInvoice {
  id: string;
  name: string;
  amount: number;
  createdAt: string;
  studentName: string;
  batchName: string;
  isPaid: boolean;
  lastPaymentDate: string | null;
}

const money = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function dateLabel(value: string | null): string {
  if (!value) return 'No payment recorded';
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function CurrentDueFeesDashboard() {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const router = useRouter();
  const { runProFeature } = useProUpgrade();
  const [search, setSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [status, setStatus] = useState<FeeStudentFilter>('needs_payment');
  const [batch, setBatch] = useState('All');
  const [selectedStudent, setSelectedStudent] = useState<FeeDashboardStudent | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [showAllInvoices, setShowAllInvoices] = useState(false);

  const feesQuery = useQuery<FeeDashboardStudent[]>({
    queryKey: ['fees'],
    queryFn: () => offlineQuery('fees-current-due', async () => (await api.get('/fees')).data),
    staleTime: 0,
  });
  const transactionsQuery = useQuery<Transaction[]>({
    queryKey: ['recent-transactions'],
    queryFn: () => offlineQuery('fees-recent', async () => (await api.get('/fees/recent')).data),
    staleTime: 0,
  });
  const invoicesQuery = useQuery<CustomInvoice[]>({
    queryKey: ['custom-invoices'],
    queryFn: () => offlineQuery('fees-custom-invoices', async () => (await api.get('/fees/custom-invoices')).data),
  });

  const students = feesQuery.data ?? [];
  const stats = useMemo(() => feeCollectionStats(students), [students]);
  const batches = useMemo(() => {
    const values = students.flatMap(student => student.batchName.split(',').map(name => name.trim()))
      .filter(name => name && name !== 'N/A');
    return ['All', ...Array.from(new Set(values)).sort()];
  }, [students]);
  const filteredStudents = useMemo(
    () => filterFeeStudents(students, { search, status, batch }),
    [batch, search, status, students],
  );
  const searchResults = useMemo(
    () => filterFeeStudents(students, { search, status: 'all', batch: 'All' }),
    [search, students],
  );
  const visiblePayments = showAllPayments
    ? transactionsQuery.data ?? []
    : (transactionsQuery.data ?? []).slice(0, 5);
  const visibleInvoices = showAllInvoices
    ? invoicesQuery.data ?? []
    : (invoicesQuery.data ?? []).slice(0, 5);
  const refreshing = feesQuery.isRefetching || transactionsQuery.isRefetching || invoicesQuery.isRefetching;

  const refresh = () => {
    void Promise.all([feesQuery.refetch(), transactionsQuery.refetch(), invoicesQuery.refetch()]);
  };

  const remind = async (student: FeeDashboardStudent) => {
    if (remindingId) return;
    setRemindingId(student.id);
    try {
      await api.post('/fees/remind', { studentId: student.id, amountDue: student.balance });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Reminder sent', `${student.name}’s fee reminder was sent successfully.`);
    } catch (reason) {
      if (isProPlanRequiredError(reason)) return;
      const message = typeof reason === 'object' && reason && 'response' in reason
        ? (reason as { response?: { data?: { error?: string } } }).response?.data?.error
        : undefined;
      Alert.alert('Reminder not sent', message || 'Check the contact details and try again.');
    } finally {
      setRemindingId(null);
    }
  };

  const filters: Array<{ key: FeeStudentFilter; label: string; count: number }> = [
    { key: 'needs_payment', label: 'Needs payment', count: stats.needsPayment },
    { key: 'all', label: 'All students', count: students.length },
    { key: 'paid', label: 'Paid', count: stats.paid },
  ];

  const header = (
    <View style={styles.headerContent}>
      <Surface tone="strong" style={[styles.hero, { backgroundColor: colors.hero, borderColor: colors.heroEnd }]}>
        <View style={styles.heroTop}>
          <View style={styles.heroMain}>
            <Text style={[styles.heroEyebrow, { color: colors.heroText }]}>RECEIVED</Text>
            <Text accessibilityLabel={`${money(stats.collected)} received`} style={[styles.heroAmount, { color: colors.heroText }]}>
              {money(stats.collected)}
            </Text>
          </View>
          <View style={[styles.rateBadge, { backgroundColor: colors.heroEnd }]}>
            <Text style={[styles.rateText, { color: colors.heroText }]}>{stats.rate}%</Text>
          </View>
        </View>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: stats.rate }} style={[styles.progressTrack, { backgroundColor: colors.heroEnd }]}>
          <View style={[styles.progressFill, { width: `${stats.rate}%`, backgroundColor: colors.heroText }]} />
        </View>
        <View style={styles.heroMetrics}>
          <View style={styles.heroMetric}>
            <Text style={[styles.heroMetricValue, { color: colors.heroText }]}>{money(stats.outstanding)}</Text>
            <Text style={[styles.heroMetricLabel, { color: colors.heroText }]}>Outstanding</Text>
          </View>
          <View style={[styles.heroDivider, { backgroundColor: colors.heroEnd }]} />
          <View style={styles.heroMetric}>
            <Text style={[styles.heroMetricValue, { color: colors.heroText }]}>{stats.needsPayment}</Text>
            <Text style={[styles.heroMetricLabel, { color: colors.heroText }]}>Need follow-up</Text>
          </View>
          <View style={[styles.heroDivider, { backgroundColor: colors.heroEnd }]} />
          <View style={styles.heroMetric}>
            <Text style={[styles.heroMetricValue, { color: colors.heroText }]}>{stats.paid}</Text>
            <Text style={[styles.heroMetricLabel, { color: colors.heroText }]}>Paid</Text>
          </View>
        </View>
      </Surface>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
        {filters.map(filter => {
          const selected = status === filter.key;
          return (
            <PressableScale
              key={filter.key}
              accessibilityLabel={`${filter.label}, ${filter.count}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              haptic="selection"
              onPress={() => setStatus(filter.key)}
              style={[
                styles.filterChip,
                { backgroundColor: selected ? colors.text : colors.surfaceElevated, borderColor: selected ? colors.text : colors.border },
              ]}
            >
              <Text style={[styles.filterChipText, { color: selected ? colors.background : colors.text }]}>{filter.label}</Text>
              <View style={[styles.filterCount, { backgroundColor: selected ? colors.background : colors.surfaceSecondary }]}>
                <Text style={[styles.filterCountText, { color: selected ? colors.text : colors.textSecondary }]}>{filter.count}</Text>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>

      {batches.length > 2 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.batchRail}>
          {batches.map(name => {
            const selected = batch === name;
            return (
              <PressableScale
                key={name}
                accessibilityLabel={`Filter by ${name === 'All' ? 'all batches' : name}`}
                accessibilityState={{ selected }}
                onPress={() => setBatch(name)}
                style={[styles.batchChip, { borderColor: selected ? colors.focus : colors.border, backgroundColor: selected ? colors.surfaceSecondary : 'transparent' }]}
              >
                <Text style={[styles.batchChipText, { color: selected ? colors.text : colors.textSecondary }]}>{name === 'All' ? 'All batches' : name}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );

  const renderStudent = ({ item: student }: { item: FeeDashboardStudent }) => {
    const state = feeStudentState(student);
    const isDue = state === 'pending' || state === 'part_paid';
    const tone = state === 'paid' ? colors.positive : state === 'part_paid' ? colors.attention : state === 'pending' ? colors.attention : colors.textMuted;
    const stateLabel = state === 'paid' ? 'Paid' : state === 'part_paid' ? 'Part paid' : state === 'pending' ? 'Pending' : 'Not configured';
    const initials = student.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    const progress = student.totalFee > 0 ? Math.min(100, Math.round((student.totalPaid / student.totalFee) * 100)) : 0;
    const pendingItems = student.breakdown ?? [];
    return (
      <Surface tone="strong" style={styles.studentCard}>
        <View style={styles.studentHeader}>
          <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.avatarText, { color: colors.text }]}>{initials || 'ST'}</Text>
          </View>
          <View style={styles.studentIdentity}>
            <Text style={[styles.studentName, { color: colors.text }]} numberOfLines={1}>{student.name}</Text>
            <Text style={[styles.studentMeta, { color: colors.textSecondary }]} numberOfLines={2}>
              {[student.humanId, student.batchName].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={[styles.statusBadge, { borderColor: tone, backgroundColor: `${tone}12` }]}>
            <Text style={[styles.statusText, { color: tone }]}>{stateLabel}</Text>
          </View>
        </View>

        {state !== 'not_configured' ? (
          <View style={styles.balanceBlock}>
            <View style={styles.balanceRow}>
              <View>
                <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>{isDue ? 'Remaining' : 'Total received'}</Text>
                <Text style={[styles.balanceAmount, { color: colors.text }]}>{money(isDue ? student.balance : student.totalPaid)}</Text>
              </View>
              <View style={styles.receivedCopy}>
                <Text style={[styles.receivedValue, { color: colors.text }]}>{money(student.totalPaid)} received</Text>
                <Text style={[styles.receivedMeta, { color: colors.textMuted }]}>{dateLabel(student.lastPaymentDate)}</Text>
              </View>
            </View>
            <View style={[styles.studentProgressTrack, { backgroundColor: colors.surfaceSecondary }]}>
              <View style={[styles.studentProgressFill, { width: `${progress}%`, backgroundColor: state === 'paid' ? colors.positive : colors.focus }]} />
            </View>
          </View>
        ) : (
          <Feedback kind="warning" title="Fee plan not configured" description="Assign installments from the student’s batch before recording payment." />
        )}

        {pendingItems.length > 0 ? (
          <View style={[styles.installmentBlock, { backgroundColor: colors.surfaceSecondary }]}>
            <Text style={[styles.installmentTitle, { color: colors.textSecondary }]}>PENDING INSTALLMENTS</Text>
            {pendingItems.slice(0, 3).map((installment, index) => (
              <View key={`${installment.name}-${index}`} style={styles.installmentRow}>
                <View style={[styles.installmentDot, { backgroundColor: colors.attention }]} />
                <Text style={[styles.installmentName, { color: colors.text }]} numberOfLines={1}>{installment.name}</Text>
                <Text style={[styles.installmentAmount, { color: colors.text }]}>{money(installment.due)}</Text>
              </View>
            ))}
            {pendingItems.length > 3 ? <Text style={[styles.moreInstallments, { color: colors.textSecondary }]}>+{pendingItems.length - 3} more</Text> : null}
          </View>
        ) : null}

        {isDue ? (
          <View style={styles.rowActions}>
            <PressableScale
              accessibilityLabel={`Send fee reminder to ${student.name}`}
              accessibilityState={{ disabled: Boolean(remindingId) }}
              disabled={Boolean(remindingId)}
              haptic="commit"
              onPress={() => runProFeature({
                feature: 'WhatsApp fee reminders',
                description: 'Upgrade to Pro to send fee reminders through MathLogs.',
              }, () => void remind(student))}
              style={[styles.secondaryAction, { borderColor: colors.border }]}
            >
              <Mail size={17} color={colors.textSecondary} />
              <Text style={[styles.secondaryActionText, { color: colors.text }]}>{remindingId === student.id ? 'Sending…' : 'Remind'}</Text>
            </PressableScale>
            <PressableScale
              accessibilityLabel={`Record payment for ${student.name}`}
              haptic="selection"
              onPress={() => setSelectedStudent(student)}
              style={[styles.primaryAction, { backgroundColor: colors.text }]}
            >
              <IndianRupee size={17} color={colors.background} />
              <Text style={[styles.primaryActionText, { color: colors.background }]}>Record</Text>
            </PressableScale>
          </View>
        ) : null}
      </Surface>
    );
  };

  const footer = (
    <View style={styles.footerSections}>
      <View style={styles.footerSection}>
        <View style={styles.sectionHeading}>
          <View>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>Recent receipts</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Latest payments recorded by the institute.</Text>
          </View>
        </View>
        {transactionsQuery.isLoading ? <Feedback kind="loading" title="Loading receipts" />
          : transactionsQuery.isError ? <Feedback kind="error" title="Receipts unavailable" description="Pull down to retry." />
            : visiblePayments.length === 0 ? <Feedback kind="empty" title="No receipts yet" description="Recorded payments will appear here." />
              : (
                <Surface style={styles.compactList}>
                  {visiblePayments.map((payment, index) => (
                    <View key={payment.id} style={[styles.compactRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                      <View style={[styles.compactIcon, { backgroundColor: colors.surfaceSecondary }]}><ReceiptText size={18} color={colors.positive} /></View>
                      <View style={styles.compactCopy}>
                        <Text style={[styles.compactTitle, { color: colors.text }]}>{payment.studentName}</Text>
                        <Text style={[styles.compactMeta, { color: colors.textSecondary }]} numberOfLines={1}>{payment.batchName} · {dateLabel(payment.date)}</Text>
                      </View>
                      <Text style={[styles.compactAmount, { color: colors.positive }]}>+{money(payment.amount)}</Text>
                    </View>
                  ))}
                  {(transactionsQuery.data?.length ?? 0) > 5 ? (
                    <PressableScale accessibilityLabel={showAllPayments ? 'Show fewer receipts' : 'Show all receipts'} onPress={() => setShowAllPayments(value => !value)} style={styles.expandButton}>
                      <Text style={[styles.expandText, { color: colors.text }]}>{showAllPayments ? 'Show less' : 'Show all'}</Text>
                      {showAllPayments ? <ChevronUp size={16} color={colors.textSecondary} /> : <ChevronDown size={16} color={colors.textSecondary} />}
                    </PressableScale>
                  ) : null}
                </Surface>
              )}
      </View>

      <View style={styles.footerSection}>
        <View style={styles.sectionHeading}>
          <View>
            <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>Custom invoices</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>One-off fee requests assigned to students.</Text>
          </View>
        </View>
        {invoicesQuery.isLoading ? <Feedback kind="loading" title="Loading invoices" />
          : invoicesQuery.isError ? <Feedback kind="error" title="Invoices unavailable" description="Pull down to retry." />
            : visibleInvoices.length === 0 ? <Feedback kind="empty" title="No custom invoices" description="One-off fee requests will appear here." />
              : (
                <Surface style={styles.compactList}>
                  {visibleInvoices.map((invoice, index) => (
                    <View key={invoice.id} style={[styles.compactRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                      <View style={[styles.compactIcon, { backgroundColor: colors.surfaceSecondary }]}>
                        {invoice.isPaid ? <CheckCircle2 size={18} color={colors.positive} /> : <Clock3 size={18} color={colors.attention} />}
                      </View>
                      <View style={styles.compactCopy}>
                        <Text style={[styles.compactTitle, { color: colors.text }]}>{invoice.name}</Text>
                        <Text style={[styles.compactMeta, { color: colors.textSecondary }]} numberOfLines={1}>{invoice.studentName} · {invoice.batchName}</Text>
                      </View>
                      <View style={styles.invoiceTrailing}>
                        <Text style={[styles.compactAmount, { color: colors.text }]}>{money(invoice.amount)}</Text>
                        <Text style={[styles.invoiceState, { color: invoice.isPaid ? colors.positive : colors.attention }]}>{invoice.isPaid ? 'Paid' : 'Pending'}</Text>
                      </View>
                    </View>
                  ))}
                  {(invoicesQuery.data?.length ?? 0) > 5 ? (
                    <PressableScale accessibilityLabel={showAllInvoices ? 'Show fewer invoices' : 'Show all invoices'} onPress={() => setShowAllInvoices(value => !value)} style={styles.expandButton}>
                      <Text style={[styles.expandText, { color: colors.text }]}>{showAllInvoices ? 'Show less' : 'Show all'}</Text>
                      {showAllInvoices ? <ChevronUp size={16} color={colors.textSecondary} /> : <ChevronDown size={16} color={colors.textSecondary} />}
                    </PressableScale>
                  ) : null}
                </Surface>
              )}
      </View>
    </View>
  );

  return (
    <>
      <TeacherPage
        title="Fees"
        scroll={false}
        actions={(
          <View style={styles.headerActions}>
            <PressableScale
              accessibilityLabel="Search student fees"
              onPress={() => setIsSearchOpen(true)}
              style={[styles.headerSearchButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
              <Search size={19} color={colors.text} />
            </PressableScale>
            <PressableScale
              accessibilityLabel="Record a fee payment"
              haptic="selection"
              onPress={() => router.push('/quick-fee-modal' as never)}
              style={[styles.recordButton, { backgroundColor: colors.text }]}
            >
              <WalletCards size={17} color={colors.background} />
              <Text style={[styles.recordButtonText, { color: colors.background }]}>Record</Text>
            </PressableScale>
          </View>
        )}
      >
        {feesQuery.isLoading ? (
          <View style={styles.loadingWrap}><Feedback kind="loading" title="Loading student ledger" description="Checking fee plans and received amounts." /></View>
        ) : feesQuery.isError ? (
          <View style={styles.loadingWrap}>
            <Feedback
              kind="error"
              title="Student ledger unavailable"
              description="Check the connection and try again."
              action={(
                <PressableScale onPress={() => void feesQuery.refetch()} style={[styles.retryButton, { borderColor: colors.border }]}>
                  <Text style={[styles.retryText, { color: colors.text }]}>Try again</Text>
                </PressableScale>
              )}
            />
          </View>
        ) : (
          <FlatList
            data={filteredStudents}
            renderItem={renderStudent}
            keyExtractor={student => student.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.focus} colors={[colors.focus]} />}
            ListHeaderComponent={header}
            ListEmptyComponent={<Feedback kind="empty" title="No matching students" description="Change the status, batch, or search filter." />}
            ListFooterComponent={footer}
          />
        )}
      </TeacherPage>

      <TeacherSearchSheet
        visible={isSearchOpen}
        title="Search student fees"
        placeholder="Search student, ID, or batch"
        value={search}
        onChangeText={setSearch}
        onClose={() => {
          setIsSearchOpen(false);
          setSearch('');
        }}
      >
        <View style={styles.searchResults}>
          {searchResults.length === 0 ? (
            <Feedback kind="empty" title="No matching students" description="Try another name, ID, or batch." />
          ) : searchResults.map((student) => {
            const state = feeStudentState(student);
            return (
              <PressableScale
                key={student.id}
                accessibilityLabel={`Show ${student.name} in the fee list`}
                onPress={() => {
                  setStatus('all');
                  setBatch('All');
                  setSearch(student.name);
                  setIsSearchOpen(false);
                }}
                style={[styles.searchResult, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              >
                <View style={[styles.searchResultAvatar, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.avatarText, { color: colors.text }]}>{student.name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={styles.searchResultCopy}>
                  <Text style={[styles.studentName, { color: colors.text }]} numberOfLines={1}>{student.name}</Text>
                  <Text style={[styles.studentMeta, { color: colors.textSecondary }]} numberOfLines={1}>{student.batchName}</Text>
                </View>
                <Text style={[styles.searchResultStatus, { color: state === 'paid' ? colors.positive : colors.attention }]}>
                  {state === 'paid' ? 'Paid' : state === 'not_configured' ? 'Setup needed' : 'Payment due'}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </TeacherSearchSheet>

      <Modal visible={Boolean(selectedStudent)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedStudent(null)}>
        <SafeAreaView style={[styles.modal, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modal}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={[styles.modalEyebrow, { color: colors.textSecondary }]}>COLLECTION</Text>
                <Text accessibilityRole="header" style={[styles.modalTitle, { color: colors.text }]}>Record payment</Text>
              </View>
              <PressableScale accessibilityLabel="Close payment form" onPress={() => setSelectedStudent(null)} style={[styles.closeButton, { backgroundColor: colors.surfaceSecondary }]}>
                <X size={21} color={colors.text} />
              </PressableScale>
            </View>
            {selectedStudent ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
                <RecordPaymentForm
                  student={selectedStudent}
                  onCancel={() => setSelectedStudent(null)}
                  onSuccess={({ amount, studentName, queued }) => {
                    setSelectedStudent(null);
                    Alert.alert(
                      queued ? 'Payment saved offline' : 'Payment recorded',
                      queued
                        ? `${money(amount)} for ${studentName} will sync when the connection returns.`
                        : `${money(amount)} received from ${studentName}.`,
                    );
                  }}
                />
              </ScrollView>
            ) : null}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerSearchButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: BorderRadius.full },
  recordButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full },
  recordButtonText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  list: { flex: 1, marginTop: Spacing.xl, marginHorizontal: -Spacing.xl },
  listContent: { paddingHorizontal: Spacing.xl, paddingBottom: TEACHER_TAB_CONTENT_INSET, gap: Spacing.md },
  loadingWrap: { flex: 1, justifyContent: 'center', marginTop: Spacing.xl },
  retryButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.md, borderWidth: 1, borderRadius: BorderRadius.md },
  retryText: TypeScale.label,
  headerContent: { gap: Spacing.lg, marginBottom: Spacing.sm },
  hero: { gap: Spacing.lg, borderWidth: 0 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.md },
  heroMain: { flex: 1 },
  heroEyebrow: { ...TypeScale.caption, opacity: 0.7 },
  heroAmount: { fontSize: 34, lineHeight: 40, fontWeight: FontWeight.bold, letterSpacing: -0.8, marginTop: Spacing.xs },
  rateBadge: { minWidth: 58, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.full },
  rateText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  progressTrack: { height: 7, borderRadius: BorderRadius.full, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: BorderRadius.full },
  heroMetrics: { flexDirection: 'row', alignItems: 'stretch' },
  heroMetric: { flex: 1 },
  heroMetricValue: { ...TypeScale.sectionTitle, fontWeight: FontWeight.bold },
  heroMetricLabel: { ...TypeScale.caption, opacity: 0.68, marginTop: 3 },
  heroDivider: { width: 1, marginHorizontal: Spacing.md, opacity: 0.55 },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: Spacing.md },
  sectionTitle: TypeScale.sectionTitle,
  sectionSubtitle: { ...TypeScale.caption, marginTop: 2 },
  searchResults: { gap: Spacing.sm },
  searchResult: { minHeight: 72, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: BorderRadius.xl },
  searchResultAvatar: { width: 42, height: 42, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  searchResultCopy: { flex: 1, minWidth: 0 },
  searchResultStatus: { ...TypeScale.caption, fontWeight: FontWeight.bold },
  chipRail: { gap: Spacing.sm, paddingRight: Spacing.xl },
  filterChip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md },
  filterChipText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  filterCount: { minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.full, paddingHorizontal: 6 },
  filterCountText: TypeScale.caption,
  batchRail: { gap: Spacing.sm, paddingRight: Spacing.xl },
  batchChip: { minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.md },
  batchChipText: TypeScale.label,
  studentCard: { gap: Spacing.lg, marginBottom: Spacing.sm },
  studentHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: { width: 46, height: 46, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  avatarText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  studentIdentity: { flex: 1, minWidth: 0 },
  studentName: { ...TypeScale.body, fontWeight: FontWeight.bold },
  studentMeta: { ...TypeScale.caption, marginTop: 2 },
  statusBadge: { minHeight: 30, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm },
  statusText: { ...TypeScale.caption, fontWeight: FontWeight.bold },
  balanceBlock: { gap: Spacing.sm },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: Spacing.md },
  balanceLabel: TypeScale.caption,
  balanceAmount: { fontSize: 23, lineHeight: 29, fontWeight: FontWeight.bold, marginTop: 2 },
  receivedCopy: { flex: 1, alignItems: 'flex-end' },
  receivedValue: TypeScale.label,
  receivedMeta: { ...TypeScale.caption, marginTop: 2 },
  studentProgressTrack: { height: 5, borderRadius: BorderRadius.full, overflow: 'hidden' },
  studentProgressFill: { height: '100%', borderRadius: BorderRadius.full },
  installmentBlock: { borderRadius: BorderRadius.lg, padding: Spacing.md, gap: Spacing.sm },
  installmentTitle: { ...TypeScale.caption, fontWeight: FontWeight.bold },
  installmentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  installmentDot: { width: 7, height: 7, borderRadius: BorderRadius.full },
  installmentName: { ...TypeScale.body, flex: 1 },
  installmentAmount: { ...TypeScale.label, fontWeight: FontWeight.bold },
  moreInstallments: { ...TypeScale.caption, marginLeft: Spacing.lg },
  rowActions: { flexDirection: 'row', gap: Spacing.sm },
  secondaryAction: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: BorderRadius.lg },
  secondaryActionText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  primaryAction: { flex: 1.2, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderRadius: BorderRadius.lg },
  primaryActionText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  footerSections: { gap: Spacing['3xl'], marginTop: Spacing['2xl'], paddingBottom: Spacing.xl },
  footerSection: { gap: Spacing.md },
  compactList: { paddingVertical: 0 },
  compactRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  compactIcon: { width: 38, height: 38, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  compactCopy: { flex: 1, minWidth: 0 },
  compactTitle: { ...TypeScale.label, fontWeight: FontWeight.bold },
  compactMeta: { ...TypeScale.caption, marginTop: 2 },
  compactAmount: { ...TypeScale.label, fontWeight: FontWeight.bold },
  invoiceTrailing: { alignItems: 'flex-end' },
  invoiceState: { ...TypeScale.caption, fontWeight: FontWeight.bold, marginTop: 2 },
  expandButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.xs, borderTopWidth: 1, borderTopColor: 'transparent' },
  expandText: TypeScale.label,
  modal: { flex: 1 },
  modalHeader: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: 1 },
  modalEyebrow: { ...TypeScale.caption, fontWeight: FontWeight.bold },
  modalTitle: { ...TypeScale.sectionTitle, marginTop: 2 },
  closeButton: { width: 44, height: 44, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center' },
  modalContent: { padding: Spacing.xl, paddingBottom: Spacing['5xl'] },
});
