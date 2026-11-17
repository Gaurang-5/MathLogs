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
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Feedback,
  PressableScale,
  SkeletonLoader,
  Surface,
  TEACHER_TAB_CONTENT_INSET,
  TeacherSearchSheet,
} from '../../components/ui';
import { useAccessibilityPreferences } from '../../components/ui/useAccessibilityPreferences';
import {
  BarChart2,
  Calendar,
  CheckSquare,
  ChevronRight,
  Clock3,
  FileText,
  Plus,
  ScanLine,
  Search,
  Square,
  X,
} from 'lucide-react-native';
import {
  BorderRadius,
  Colors,
  FontWeight,
  Shadows,
  Spacing,
  TypeScale,
} from '../../constants/theme';
import api from '../../services/api';
import { executeOrQueueMutation, offlineQuery, updateCachedData } from '../../services/offlineSync';
import * as Haptics from 'expo-haptics';

interface Test {
  id: string;
  name: string;
  subject: string;
  className: string | null;
  date: string;
  maxMarks: number;
  _count: { marks: number };
}

interface Batch {
  id: string;
  name: string;
  className: string | null;
  subject: string | null;
}

interface StatusColors {
  attention: string;
  positive: string;
  focus: string;
}

type ThemeColors = typeof Colors.light | typeof Colors.dark;

function getTestStatus(test: Test, colors: StatusColors): { color: string; label: string } {
  const testDate = new Date(test.date);
  const now = new Date();

  if (testDate > now) return { color: colors.attention, label: 'Upcoming' };
  if (test._count.marks > 0) return { color: colors.positive, label: 'Graded' };
  return { color: colors.focus, label: 'Pending' };
}

function TestCard({
  item,
  index,
  onPress,
  colors,
  reduceMotion,
}: {
  item: Test;
  index: number;
  onPress?: () => void;
  colors: ThemeColors;
  reduceMotion: boolean;
}) {
  const isPendingSync = item.id.startsWith('offline:');
  const status = isPendingSync ? { color: colors.attention, label: 'Pending sync' } : getTestStatus(item, colors);
  const dateStr = new Date(item.date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInDown.duration(260).delay(Math.min(index, 4) * 35)}
      style={styles.cardSpacing}
    >
      <Surface
        onPress={onPress}
        accessibilityLabel={isPendingSync ? `${item.name}, pending sync` : `Open test ${item.name}`}
        style={styles.assessmentCard}
      >
        <View style={[styles.assessmentIcon, { backgroundColor: `${status.color}18` }]}>
          <FileText size={21} color={status.color} strokeWidth={2} />
        </View>

        <View style={styles.assessmentCopy}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
              {item.name}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: `${status.color}18` }]}>
              <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <Calendar size={14} color={colors.textSecondary} />
            <Text style={[styles.metaText, { color: colors.textSecondary }]}>{dateStr}</Text>
            {item._count.marks > 0 ? (
              <>
                <View style={[styles.metaDivider, { backgroundColor: colors.border }]} />
                <BarChart2 size={14} color={colors.textSecondary} />
                <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                  {item._count.marks} graded
                </Text>
              </>
            ) : null}
          </View>

          <Text style={[styles.detailText, { color: colors.textMuted }]} numberOfLines={2}>
            {item.subject}{item.className ? ` · ${item.className}` : ''} · {item.maxMarks} marks
          </Text>
        </View>

        <ChevronRight size={20} color={colors.textMuted} />
      </Surface>
    </Animated.View>
  );
}

export default function TestsScreen() {
  const queryClient = useQueryClient();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const { reduceMotion } = useAccessibilityPreferences();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState('');
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [maxMarks, setMaxMarks] = useState('');

  const {
    data: tests,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery<Test[]>({
    queryKey: ['tests'],
    queryFn: () => offlineQuery('tests', async () => (await api.get('/tests')).data),
  });

  const { data: batches = [] } = useQuery<Batch[]>({
    queryKey: ['batches'],
    queryFn: () => offlineQuery('batches', async () => (await api.get('/batches')).data),
  });
  const syncedBatches = useMemo(() => batches.filter(batch => !batch.id.startsWith('offline:')), [batches]);

  const filtered = useMemo(() => {
    if (!tests) return [];
    if (!search) return tests;
    const query = search.toLowerCase();
    return tests.filter(test =>
      test.name.toLowerCase().includes(query) ||
      test.subject.toLowerCase().includes(query)
    );
  }, [tests, search]);

  const upcomingCount = useMemo(
    () => (tests || []).filter(test => new Date(test.date) > new Date()).length,
    [tests],
  );
  const gradedCount = useMemo(
    () => (tests || []).filter(test => test._count.marks > 0).length,
    [tests],
  );
  const pendingCount = useMemo(
    () => (tests || []).filter(test => new Date(test.date) <= new Date() && test._count.marks === 0).length,
    [tests],
  );

  const handleCreate = async () => {
    const numericMaxMarks = Number(maxMarks);
    if (!name.trim() || selectedBatchIds.length === 0 || !date || !Number.isFinite(numericMaxMarks) || numericMaxMarks <= 0) {
      Alert.alert('Missing Fields', 'Please fill in all required fields and select at least one batch.');
      return;
    }

    const batch = syncedBatches.find(item => item.id === selectedBatchIds[0]);
    const subject = batch?.subject || 'General';
    const className = batch?.className;

    try {
      const payload = {
        name: name.trim(),
        subject,
        date,
        maxMarks: numericMaxMarks,
        className,
        batchIds: selectedBatchIds,
      };
      const result = await executeOrQueueMutation<Test>({ method: 'POST', url: '/tests', data: payload });
      if (result.status === 'queued') {
        const optimisticTest: Test = {
          id: `offline:${result.idempotencyKey}`,
          name: payload.name,
          subject,
          className: className ?? null,
          date,
          maxMarks: numericMaxMarks,
          _count: { marks: 0 },
        };
        queryClient.setQueryData<Test[]>(['tests'], previous => [optimisticTest, ...(previous ?? [])]);
        await updateCachedData<Test[]>('tests', previous => [optimisticTest, ...(previous ?? [])]);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowForm(false);
      setName('');
      setSelectedBatchIds([]);
      setMaxMarks('');
      if (result.status === 'queued') Alert.alert('Saved offline', 'The test will sync automatically when the connection returns.');
      else void refetch();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to create test');
    }
  };

  const toggleBatch = (id: string) => {
    setSelectedBatchIds(previous =>
      previous.includes(id) ? previous.filter(batchId => batchId !== id) : [...previous, id],
    );
  };

  const renderEmptyState = () => {
    if (isLoading) {
      return (
        <View style={styles.skeletonStack}>
          {[1, 2, 3].map(item => (
            reduceMotion ? (
              <View
                key={item}
                style={[
                  styles.staticSkeleton,
                  {
                    width: Math.max(width - Spacing['4xl'], 0),
                    backgroundColor: colors.surfaceElevated,
                    borderColor: colors.border,
                  },
                ]}
              />
            ) : (
              <SkeletonLoader
                key={item}
                width={Math.max(width - Spacing['4xl'], 0)}
                height={126}
                borderRadius={BorderRadius.xl}
              />
            )
          ))}
        </View>
      );
    }

    if (isError) {
      return (
        <Feedback
          kind="error"
          title="Tests could not be loaded"
          description="Check your connection and try again."
          action={(
            <PressableScale
              accessibilityLabel="Retry loading tests"
              onPress={() => void refetch()}
              style={[styles.feedbackAction, { backgroundColor: colors.text }]}
            >
              <Text style={[styles.feedbackActionText, { color: colors.background }]}>Try again</Text>
            </PressableScale>
          )}
        />
      );
    }

    return (
      <Feedback
        kind="empty"
        title={search ? 'No matching tests' : 'No tests yet'}
        description={search ? 'Try another name or subject.' : 'Create your first test to start tracking marks and progress.'}
      />
    );
  };

  const header = (
    <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(280)}>
      <View style={styles.pageHeader}>
        <Text accessibilityRole="header" style={[styles.pageTitle, { color: colors.text }]}>Tests</Text>
        <View style={styles.headerActions}>
          <PressableScale
            accessibilityLabel="Search tests"
            onPress={() => setIsSearchOpen(true)}
            style={[styles.headerSearchAction, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          >
            <Search size={19} color={colors.text} />
          </PressableScale>
          <PressableScale
            accessibilityLabel="Scan student marks"
            haptic="selection"
            onPress={() => router.push('/scan' as never)}
            style={[styles.scanAction, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          >
            <ScanLine size={19} color={colors.text} />
          </PressableScale>
          <PressableScale
            accessibilityLabel="Create test"
            haptic="selection"
            onPress={() => setShowForm(true)}
            style={[styles.primaryAction, { backgroundColor: colors.text }]}
          >
            <Plus size={18} color={colors.background} />
            <Text style={[styles.primaryActionText, { color: colors.background }]}>New test</Text>
          </PressableScale>
        </View>
      </View>

      {!isLoading ? (
        <View style={styles.statsRow}>
          <Surface style={styles.statCard}>
            <Clock3 size={18} color={colors.attention} />
            <Text style={[styles.statValue, { color: colors.text }]}>{upcomingCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Upcoming</Text>
          </Surface>
          <Surface style={styles.statCard}>
            <FileText size={18} color={colors.focus} />
            <Text style={[styles.statValue, { color: colors.text }]}>{pendingCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Pending</Text>
          </Surface>
          <Surface style={styles.statCard}>
            <BarChart2 size={18} color={colors.positive} />
            <Text style={[styles.statValue, { color: colors.text }]}>{gradedCount}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Graded</Text>
          </Surface>
        </View>
      ) : null}

    </Animated.View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <FlatList
        data={filtered}
        renderItem={({ item, index }) => (
          <TestCard
            item={item}
            index={index}
            colors={colors}
            reduceMotion={reduceMotion}
            onPress={item.id.startsWith('offline:') ? undefined : () => router.push(`/test/${item.id}`)}
          />
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={(
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={colors.focus}
            colors={[colors.focus]}
          />
        )}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={styles.listHeader}
        ListEmptyComponent={renderEmptyState}
      />

      <TeacherSearchSheet
        visible={isSearchOpen}
        title="Search tests"
        placeholder="Search by test or subject"
        value={search}
        onChangeText={setSearch}
        onClose={() => {
          setIsSearchOpen(false);
          setSearch('');
        }}
      >
        <View>
          {filtered.length === 0 ? (
            <Feedback kind="empty" title="No matching tests" description="Try another test name or subject." />
          ) : filtered.map((item, index) => (
            <TestCard
              key={item.id}
              item={item}
              index={index}
              colors={colors}
              reduceMotion={reduceMotion}
              onPress={() => {
                if (item.id.startsWith('offline:')) return;
                setIsSearchOpen(false);
                setSearch('');
                router.push(`/test/${item.id}`);
              }}
            />
          ))}
        </View>
      </TeacherSearchSheet>

      <Modal
        visible={showForm}
        animationType={reduceMotion ? 'none' : 'slide'}
        presentationStyle="pageSheet"
        onRequestClose={() => setShowForm(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContainer}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.modalHeadingCopy}>
                <Text accessibilityRole="header" style={[styles.modalTitle, { color: colors.text }]}>Create new test</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Assign one assessment to one or more batches.</Text>
              </View>
              <PressableScale
                accessibilityLabel="Close create test"
                onPress={() => setShowForm(false)}
                style={[styles.closeButton, { backgroundColor: colors.surfaceSecondary }]}
              >
                <X size={20} color={colors.textSecondary} />
              </PressableScale>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Test name</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <FileText size={19} color={colors.textMuted} />
                  <TextInput
                    accessibilityLabel="Test name"
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g. Unit Test 1"
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={setName}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.fieldHeadingRow}>
                  <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Select batches</Text>
                  {selectedBatchIds.length > 0 ? (
                    <Text style={[styles.selectionCount, { color: colors.focus }]}>{selectedBatchIds.length} selected</Text>
                  ) : null}
                </View>
                <Surface style={styles.batchList}>
                  {syncedBatches.length === 0 ? (
                    <Text style={[styles.batchEmptyText, { color: colors.textSecondary }]}>No batches available.</Text>
                  ) : syncedBatches.map(batch => {
                    const isSelected = selectedBatchIds.includes(batch.id);
                    return (
                      <PressableScale
                        key={batch.id}
                        accessibilityRole="checkbox"
                        accessibilityLabel={`Select ${batch.name}`}
                        accessibilityState={{ checked: isSelected }}
                        haptic="selection"
                        onPress={() => toggleBatch(batch.id)}
                        style={[
                          styles.batchOption,
                          {
                            backgroundColor: isSelected ? colors.surfaceSecondary : colors.background,
                            borderColor: isSelected ? colors.focus : colors.borderLight,
                          },
                        ]}
                      >
                        {isSelected ? <CheckSquare size={21} color={colors.focus} /> : <Square size={21} color={colors.textMuted} />}
                        <Text style={[styles.batchOptionText, { color: isSelected ? colors.text : colors.textSecondary }]}>
                          {batch.name}{batch.className ? ` (${batch.className})` : ''}
                        </Text>
                      </PressableScale>
                    );
                  })}
                </Surface>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Date (YYYY-MM-DD)</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Calendar size={19} color={colors.textMuted} />
                  <TextInput
                    accessibilityLabel="Test date"
                    style={[styles.input, { color: colors.text }]}
                    placeholder="2026-05-17"
                    placeholderTextColor={colors.textMuted}
                    value={date}
                    onChangeText={setDate}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Maximum marks</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <BarChart2 size={19} color={colors.textMuted} />
                  <TextInput
                    accessibilityLabel="Maximum marks"
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g. 50"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    value={maxMarks}
                    onChangeText={setMaxMarks}
                  />
                </View>
              </View>

              <PressableScale
                accessibilityLabel="Create test"
                haptic="commit"
                onPress={() => void handleCreate()}
                style={[styles.submitButton, { backgroundColor: colors.text }, Shadows.md]}
              >
                <Text style={[styles.submitButtonText, { color: colors.background }]}>Create test</Text>
                <ChevronRight size={19} color={colors.background} />
              </PressableScale>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: TEACHER_TAB_CONTENT_INSET,
  },
  listHeader: { marginBottom: Spacing.xl },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerSearchAction: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: BorderRadius.full },
  scanAction: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: BorderRadius.full },
  pageTitle: TypeScale.pageTitle,
  primaryAction: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
  },
  primaryActionText: { ...TypeScale.label, fontWeight: FontWeight.bold },
  statsRow: { flexDirection: 'row', gap: Spacing.sm },
  statCard: { flex: 1, minWidth: 0, padding: Spacing.md, borderRadius: BorderRadius.lg },
  statValue: { fontSize: 24, lineHeight: 29, fontWeight: FontWeight.bold, marginTop: Spacing.sm },
  statLabel: { ...TypeScale.caption, marginTop: 2 },
  cardSpacing: { marginBottom: Spacing.md },
  assessmentCard: {
    minHeight: 118,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.xl,
  },
  assessmentIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  assessmentCopy: { flex: 1, minWidth: 0, marginRight: Spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  cardTitle: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: FontWeight.semibold },
  statusPill: { borderRadius: BorderRadius.full, paddingHorizontal: 9, paddingVertical: 4 },
  statusText: { ...TypeScale.caption, fontWeight: FontWeight.bold },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.xs, marginTop: Spacing.sm },
  metaText: { fontSize: 13, lineHeight: 18, fontWeight: FontWeight.medium },
  metaDivider: { width: 1, height: 13, marginHorizontal: Spacing.xs },
  detailText: { fontSize: 13, lineHeight: 18, marginTop: Spacing.xs },
  skeletonStack: { gap: Spacing.md },
  staticSkeleton: { height: 126, borderRadius: BorderRadius.xl, borderWidth: 1 },
  feedbackAction: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
  },
  feedbackActionText: TypeScale.label,
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
  },
  modalHeadingCopy: { flex: 1, minWidth: 0 },
  modalTitle: TypeScale.sectionTitle,
  modalSubtitle: { ...TypeScale.caption, marginTop: 2 },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: { padding: Spacing.xl, paddingBottom: Spacing['5xl'], gap: Spacing.xl },
  inputGroup: { gap: Spacing.sm },
  fieldHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  inputLabel: TypeScale.label,
  selectionCount: TypeScale.caption,
  inputWrap: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
  },
  input: { flex: 1, ...TypeScale.body, minHeight: 44 },
  batchList: { padding: Spacing.sm, gap: Spacing.sm },
  batchOption: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  batchOptionText: { flex: 1, ...TypeScale.body, fontWeight: FontWeight.medium },
  batchEmptyText: { ...TypeScale.body, padding: Spacing.md },
  submitButton: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.sm,
  },
  submitButtonText: { fontSize: 16, lineHeight: 22, fontWeight: FontWeight.bold },
});
