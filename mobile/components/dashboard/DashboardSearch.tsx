import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type TextInputInstance,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ChevronRight,
  FileText,
  GraduationCap,
  Search,
  UserRound,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { PressableScale, Surface } from '../ui';
import { useAccessibilityPreferences } from '../ui/useAccessibilityPreferences';
import {
  BorderRadius,
  Colors,
  FontWeight,
  Spacing,
  TypeScale,
} from '../../constants/theme';
import api from '../../services/api';

export interface DashboardSearchBatch {
  id: string;
  name: string;
  subject?: string | null;
  className?: string | null;
}

export interface DashboardSearchTest {
  id: string;
  name: string;
  subject?: string | null;
  className?: string | null;
  date?: string | null;
}

export interface DashboardStudentSearchResult {
  id: string;
  humanId: string | null;
  name: string;
  parentName?: string | null;
  parentWhatsapp?: string | null;
  schoolName: string | null;
  status: string;
  batch?: {
    name: string;
    className: string | null;
  } | null;
}

export interface DashboardSearchProps {
  autoFocus?: boolean;
  onDismiss?: () => void;
  batches?: readonly DashboardSearchBatch[];
  batchesError?: boolean;
  batchesLoading?: boolean;
  tests?: readonly DashboardSearchTest[];
  testsError?: boolean;
  testsLoading?: boolean;
  onStudentPress?: (student: DashboardStudentSearchResult) => void;
}

const EMPTY_BATCHES: readonly DashboardSearchBatch[] = [];
const EMPTY_TESTS: readonly DashboardSearchTest[] = [];
const DEBOUNCE_MS = 280;
const LOCAL_RESULT_LIMIT = 5;

function includesQuery(value: string | null | undefined, query: string) {
  return Boolean(value?.toLocaleLowerCase().includes(query));
}

function formatTestDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function DashboardSearch({
  autoFocus = false,
  onDismiss,
  batches = EMPTY_BATCHES,
  batchesError = false,
  batchesLoading = false,
  tests = EMPTY_TESTS,
  testsError = false,
  testsLoading = false,
  onStudentPress,
}: DashboardSearchProps) {
  const router = useRouter();
  const { isLoggedIn, user } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { reduceTransparency } = useAccessibilityPreferences();
  const inputRef = useRef<TextInputInstance>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const hasAuthenticatedScope = isLoggedIn && Boolean(user);
  const scopeKey = hasAuthenticatedScope && user
    ? `${user.instituteId ?? 'no-institute'}:${user.id}`
    : 'signed-out';

  useEffect(() => {
    setDebouncedQuery('');
    if (normalizedQuery.length < 2) return;

    const timer = setTimeout(() => {
      setDebouncedQuery(normalizedQuery);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [normalizedQuery, scopeKey]);

  const studentQuery = useQuery<DashboardStudentSearchResult[]>({
    queryKey: ['dashboard-search', 'students', scopeKey, debouncedQuery],
    queryFn: async ({ signal }) => {
      const response = await api.get<DashboardStudentSearchResult[]>(
        `/students/search?q=${encodeURIComponent(debouncedQuery)}`,
        { signal },
      );
      return response.data;
    },
    enabled: hasAuthenticatedScope && debouncedQuery.length >= 2,
    staleTime: 15_000,
    gcTime: 60_000,
    retry: 1,
  });

  const localBatches = useMemo(() => {
    if (normalizedQuery.length < 2) return [];
    return batches.filter((batch) => (
      includesQuery(batch.name, normalizedQuery)
      || includesQuery(batch.subject, normalizedQuery)
      || includesQuery(batch.className, normalizedQuery)
    )).slice(0, LOCAL_RESULT_LIMIT);
  }, [batches, normalizedQuery]);

  const localTests = useMemo(() => {
    if (normalizedQuery.length < 2) return [];
    return tests.filter((test) => (
      includesQuery(test.name, normalizedQuery)
      || includesQuery(test.subject, normalizedQuery)
      || includesQuery(test.className, normalizedQuery)
    )).slice(0, LOCAL_RESULT_LIMIT);
  }, [normalizedQuery, tests]);

  const queryIsSettled = debouncedQuery === normalizedQuery;
  const students = queryIsSettled ? (studentQuery.data ?? []) : [];
  const isSearching = normalizedQuery.length >= 2
    && (!queryIsSettled || studentQuery.isFetching);
  const resultCount = students.length + localBatches.length + localTests.length;
  const showPanel = isFocused || normalizedQuery.length > 0;
  const localSourcesSettled = !batchesLoading && !testsLoading;
  const localSourcesAvailable = !batchesError && !testsError;
  const canConfirmNoResults = !isSearching
    && hasAuthenticatedScope
    && !studentQuery.isError
    && localSourcesSettled
    && localSourcesAvailable
    && resultCount === 0;
  const canShowResultCount = !isSearching
    && hasAuthenticatedScope
    && !studentQuery.isError
    && localSourcesSettled
    && localSourcesAvailable;

  const clearSearch = (keepFocus: boolean) => {
    setQuery('');
    setDebouncedQuery('');
    if (keepFocus) {
      inputRef.current?.focus();
      return;
    }
    setIsFocused(false);
    inputRef.current?.blur();
    Keyboard.dismiss();
    onDismiss?.();
  };

  const completeSelection = () => {
    setQuery('');
    setDebouncedQuery('');
    setIsFocused(false);
    inputRef.current?.blur();
    Keyboard.dismiss();
    onDismiss?.();
  };

  const openBatch = (batch: DashboardSearchBatch) => {
    completeSelection();
    router.push(`/batch/${batch.id}`);
  };

  const openTest = (test: DashboardSearchTest) => {
    completeSelection();
    router.push(`/test/${test.id}`);
  };

  const selectStudent = (student: DashboardStudentSearchResult) => {
    if (!onStudentPress) return;
    completeSelection();
    onStudentPress(student);
  };

  const submitCurrentQuery = () => {
    if (normalizedQuery.length >= 2) setDebouncedQuery(normalizedQuery);
  };

  const studentRow = (student: DashboardStudentSearchResult) => {
    const batchLabel = student.batch
      ? [student.batch.name, student.batch.className].filter(Boolean).join(' · ')
      : null;
    const metadata = [student.humanId, batchLabel, student.schoolName].filter(Boolean).join(', ');
    const content = (
      <>
        <View style={styles.resultIcon}>
          <UserRound size={19} color={colors.focus} />
        </View>
        <View style={styles.resultCopy}>
          <Text style={styles.resultTitle}>{student.name}</Text>
          {student.humanId ? (
            <Text style={styles.resultId}>{student.humanId}</Text>
          ) : null}
          {batchLabel ? <Text style={styles.resultMeta}>{batchLabel}</Text> : null}
          {student.schoolName ? (
            <Text style={styles.resultDetail}>{student.schoolName}</Text>
          ) : null}
        </View>
        {onStudentPress ? <ChevronRight size={19} color={colors.textMuted} /> : null}
      </>
    );

    if (onStudentPress) {
      return (
        <PressableScale
          key={student.id}
          accessibilityLabel={`Open student ${student.name}${metadata ? `, ${metadata}` : ''}`}
          onPress={() => selectStudent(student)}
          style={styles.resultRow}
        >
          {content}
        </PressableScale>
      );
    }

    return (
      <View
        key={student.id}
        accessible
        accessibilityLabel={`Student ${student.name}${metadata ? `, ${metadata}` : ''}. Read-only search result.`}
        style={styles.resultRow}
      >
        {content}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Surface
          tone={reduceTransparency ? 'strong' : 'material'}
          style={[
            styles.searchSurface,
            isFocused && styles.searchSurfaceFocused,
          ]}
        >
          <Search size={21} color={isFocused ? colors.focus : colors.textMuted} />
          <TextInput
            ref={inputRef}
            autoFocus={autoFocus}
            accessibilityLabel="Search students, batches, and tests"
            accessibilityHint="Enter at least two characters. Student matches come from your institute; batches and tests are matched from this dashboard."
            autoCapitalize="none"
            autoCorrect={false}
            onBlur={() => setIsFocused(false)}
            onChangeText={setQuery}
            onFocus={() => setIsFocused(true)}
            onSubmitEditing={submitCurrentQuery}
            placeholder="Search students, batches, tests"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            selectionColor={colors.focus}
            style={styles.input}
            value={query}
          />
          {query.length > 0 ? (
            <PressableScale
              accessibilityLabel="Clear dashboard search"
              onPress={() => clearSearch(true)}
              style={styles.clearButton}
            >
              <X size={19} color={colors.textSecondary} />
            </PressableScale>
          ) : null}
        </Surface>

        {isFocused || query.length > 0 ? (
          <PressableScale
            accessibilityLabel="Cancel dashboard search"
            onPress={() => clearSearch(false)}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </PressableScale>
        ) : null}
      </View>

      {showPanel ? (
        <Surface tone="strong" style={styles.resultsSurface}>
          {normalizedQuery.length === 0 ? (
            <View
              accessibilityLiveRegion="polite"
              style={styles.messageRow}
            >
              <Search size={18} color={colors.textMuted} />
              <Text style={styles.messageText}>Search by student name or ID, batch, subject, or test.</Text>
            </View>
          ) : null}

          {normalizedQuery.length === 1 ? (
            <View
              accessibilityLiveRegion="polite"
              style={styles.messageRow}
            >
              <Search size={18} color={colors.textMuted} />
              <Text style={styles.messageText}>Type one more character to search.</Text>
            </View>
          ) : null}

          {normalizedQuery.length >= 2 ? (
            <>
              <View style={styles.resultsHeader}>
                <Text accessibilityRole="header" style={styles.resultsTitle}>Results</Text>
                {canShowResultCount && resultCount > 0 ? (
                  <Text style={styles.resultsCount}>
                    {resultCount} shown
                  </Text>
                ) : null}
              </View>

              {isSearching ? (
                <View
                  accessibilityLabel="Searching student records"
                  accessibilityLiveRegion="polite"
                  style={styles.messageRow}
                >
                  <ActivityIndicator size="small" color={colors.focus} />
                  <Text style={styles.messageText}>Searching student records…</Text>
                </View>
              ) : null}

              {studentQuery.isError && queryIsSettled ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={styles.errorRow}
                >
                  <AlertCircle size={18} color={colors.attention} />
                  <View style={styles.errorCopy}>
                    <Text style={styles.errorTitle}>Student search is unavailable</Text>
                    <Text style={styles.errorDetail}>Available batch and test matches are shown below.</Text>
                  </View>
                </View>
              ) : null}

              {batchesLoading || batchesError ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={styles.categoryStatusRow}
                >
                  {batchesLoading ? (
                    <ActivityIndicator size="small" color={colors.focus} />
                  ) : (
                    <AlertCircle size={18} color={colors.attention} />
                  )}
                  <Text style={styles.categoryStatusText}>
                    {batchesLoading
                      ? 'Loading batch matches…'
                      : 'Batch matches may be incomplete.'}
                  </Text>
                </View>
              ) : null}

              {testsLoading || testsError ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={styles.categoryStatusRow}
                >
                  {testsLoading ? (
                    <ActivityIndicator size="small" color={colors.focus} />
                  ) : (
                    <AlertCircle size={18} color={colors.attention} />
                  )}
                  <Text style={styles.categoryStatusText}>
                    {testsLoading
                      ? 'Loading test matches…'
                      : 'Test matches may be incomplete.'}
                  </Text>
                </View>
              ) : null}

              {students.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>STUDENTS</Text>
                  {students.map(studentRow)}
                </View>
              ) : null}

              {localBatches.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>BATCHES</Text>
                  {localBatches.map((batch) => (
                    <PressableScale
                      key={batch.id}
                      accessibilityLabel={`Open batch ${batch.name}`}
                      onPress={() => openBatch(batch)}
                      style={styles.resultRow}
                    >
                      <View style={styles.resultIcon}>
                        <GraduationCap size={19} color={colors.focus} />
                      </View>
                      <View style={styles.resultCopy}>
                        <Text style={styles.resultTitle}>{batch.name}</Text>
                        <Text style={styles.resultMeta}>
                          {[batch.subject, batch.className].filter(Boolean).join(' · ') || 'Batch'}
                        </Text>
                      </View>
                      <ChevronRight size={19} color={colors.textMuted} />
                    </PressableScale>
                  ))}
                </View>
              ) : null}

              {localTests.length > 0 ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>TESTS</Text>
                  {localTests.map((test) => {
                    const dateLabel = formatTestDate(test.date);
                    return (
                      <PressableScale
                        key={test.id}
                        accessibilityLabel={`Open test ${test.name}`}
                        onPress={() => openTest(test)}
                        style={styles.resultRow}
                      >
                        <View style={styles.resultIcon}>
                          <FileText size={19} color={colors.focus} />
                        </View>
                        <View style={styles.resultCopy}>
                          <Text style={styles.resultTitle}>{test.name}</Text>
                          <Text style={styles.resultMeta}>
                            {[test.subject, test.className, dateLabel].filter(Boolean).join(' · ') || 'Test'}
                          </Text>
                        </View>
                        <ChevronRight size={19} color={colors.textMuted} />
                      </PressableScale>
                    );
                  })}
                </View>
              ) : null}

              {canConfirmNoResults ? (
                <View
                  accessibilityLiveRegion="polite"
                  style={styles.emptyState}
                >
                  <Search size={22} color={colors.textMuted} />
                  <Text style={styles.emptyTitle}>No matching records</Text>
                  <Text style={styles.emptyDetail}>
                    Try a student name or ID, batch, subject, or test name.
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </Surface>
      ) : null}
    </View>
  );
}

const createStyles = (colors: typeof Colors.light | typeof Colors.dark) => StyleSheet.create({
  container: {
    width: '100%',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  searchSurface: {
    flex: 1,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 0,
    borderRadius: BorderRadius.xl,
  },
  searchSurfaceFocused: {
    borderColor: colors.focus,
  },
  input: {
    flex: 1,
    minHeight: 44,
    ...TypeScale.body,
    color: colors.text,
    paddingVertical: 0,
  },
  clearButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
  },
  cancelButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  cancelText: {
    ...TypeScale.label,
    color: colors.focus,
    fontWeight: FontWeight.bold,
  },
  resultsSurface: {
    marginTop: Spacing.sm,
    padding: 0,
    borderRadius: BorderRadius.xl,
  },
  resultsHeader: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  resultsTitle: {
    ...TypeScale.sectionTitle,
    color: colors.text,
  },
  resultsCount: {
    ...TypeScale.caption,
    color: colors.textSecondary,
  },
  messageRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  messageText: {
    flex: 1,
    ...TypeScale.body,
    color: colors.textSecondary,
  },
  errorRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    margin: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: colors.surfaceSecondary,
  },
  errorCopy: {
    flex: 1,
    minWidth: 0,
  },
  errorTitle: {
    ...TypeScale.label,
    color: colors.text,
  },
  errorDetail: {
    ...TypeScale.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  categoryStatusRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  categoryStatusText: {
    flex: 1,
    ...TypeScale.caption,
    color: colors.textSecondary,
  },
  section: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  sectionLabel: {
    ...TypeScale.caption,
    color: colors.textMuted,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.8,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xs,
  },
  resultRow: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  resultIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  resultCopy: {
    flex: 1,
    minWidth: 0,
  },
  resultTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: FontWeight.semibold,
    color: colors.text,
  },
  resultId: {
    ...TypeScale.caption,
    color: colors.focus,
    marginTop: 1,
  },
  resultMeta: {
    ...TypeScale.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  resultDetail: {
    ...TypeScale.caption,
    color: colors.textMuted,
    marginTop: 1,
  },
  emptyState: {
    minHeight: 116,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl,
  },
  emptyTitle: {
    ...TypeScale.label,
    color: colors.text,
    marginTop: Spacing.sm,
  },
  emptyDetail: {
    ...TypeScale.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});

export default DashboardSearch;
