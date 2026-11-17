import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock,
  GraduationCap,
  Plus,
  Search,
  Type,
  Users as UsersIcon,
  X,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import {
  Feedback,
  PressableScale,
  SkeletonLoader,
  Surface,
  TEACHER_TAB_CONTENT_INSET,
  TeacherPage,
  TeacherSearchSheet,
} from '../../components/ui';
import { useAccessibilityPreferences } from '../../components/ui/useAccessibilityPreferences';
import { useAuth } from '../../contexts/AuthContext';
import { BorderRadius, Colors, FontSize, FontWeight, Spacing, TypeScale } from '../../constants/theme';
import api from '../../services/api';
import { executeOrQueueMutation, offlineQuery, updateCachedData } from '../../services/offlineSync';

type ThemeColors = typeof Colors.light | typeof Colors.dark;
type RegistrationFilter = 'ALL' | 'OPEN' | 'PAUSED' | 'ENDED';
type RegistrationStatus = Exclude<RegistrationFilter, 'ALL'>;
type CoachingFeeMode = 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';

interface Batch {
  id: string;
  name: string;
  subject: string | null;
  className: string | null;
  timeSlot: string | null;
  feeAmount: number;
  isRegistrationOpen: boolean;
  isRegistrationEnded: boolean;
  startDate?: string | null;
  endDate?: string | null;
  coachingFeeMode?: CoachingFeeMode;
  _count: { students: number };
}

interface InstituteConfig {
  requiresGrades?: boolean;
  allowedClasses?: unknown;
  classes?: unknown;
  subjects?: unknown;
}

interface InstituteResponse {
  coachingFeeMode?: CoachingFeeMode;
  config?: InstituteConfig | null;
}

const REGISTRATION_FILTERS: Array<{ value: RegistrationFilter; label: string }> = [
  { value: 'ALL', label: 'All batches' },
  { value: 'OPEN', label: 'Open' },
  { value: 'PAUSED', label: 'Paused' },
  { value: 'ENDED', label: 'Ended' },
];

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

function sanitizeStringOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((option): option is string => typeof option === 'string')
      .map((option) => option.trim())
      .filter(Boolean),
  ));
}

function configuredClassOptions(config?: InstituteConfig | null): string[] {
  const directOptions = sanitizeStringOptions(config?.allowedClasses);
  if (directOptions.length > 0 || !Array.isArray(config?.classes)) return directOptions;
  return Array.from(new Set(
    config.classes
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object' && 'name' in entry && typeof entry.name === 'string') {
          return entry.name.trim();
        }
        return '';
      })
      .filter(Boolean),
  ));
}

function registrationStatus(batch: Batch): RegistrationStatus {
  if (batch.isRegistrationEnded) return 'ENDED';
  if (batch.isRegistrationOpen) return 'OPEN';
  return 'PAUSED';
}

function registrationCopy(status: RegistrationStatus): string {
  if (status === 'OPEN') return 'Registration open';
  if (status === 'PAUSED') return 'Registration paused';
  return 'Registration ended';
}

function shortRegistrationCopy(status: RegistrationStatus): string {
  if (status === 'OPEN') return 'Open';
  if (status === 'PAUSED') return 'Paused';
  return 'Ended';
}

function compactClassLabel(value: string | null): string | null {
  if (!value?.trim()) return null;
  const compact = value.trim().replace(/^(class|grade)\s*/i, '').trim();
  return compact || value.trim();
}

function isValidDateInput(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime())
    && date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() + 1 === Number(month)
    && date.getUTCDate() === Number(day);
}

function createErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) return 'The batch could not be created. Please try again.';
  const body = error.response?.data as { error?: unknown; message?: unknown } | undefined;
  const message = typeof body?.error === 'string'
    ? body.error
    : typeof body?.message === 'string'
      ? body.message
      : null;
  if (message === 'BATCH_DATES_REQUIRED') return 'Add a start and end date for this monthly coverage batch.';
  if (message === 'INVALID_BATCH_DATE_RANGE') return 'Check the date range. The end date must be on or after the start date.';
  return message || 'The batch could not be created. Please try again.';
}

function ChoiceField({
  label,
  options,
  value,
  onChange,
  colors,
  selectedTextColor,
  disabled,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  colors: ThemeColors;
  selectedTextColor: string;
  disabled: boolean;
}) {
  return (
    <View style={styles.inputGroup} accessibilityLabel={label}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label} *</Text>
      <View style={styles.choiceWrap}>
        {options.map((option) => {
          const selected = value === option;
          return (
            <PressableScale
              key={option}
              accessibilityLabel={`${label}: ${option}`}
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              haptic="selection"
              onPress={() => onChange(option)}
              style={[
                styles.choice,
                {
                  backgroundColor: selected ? colors.chart : colors.surfaceElevated,
                  borderColor: selected ? colors.chart : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.choiceText,
                  { color: selected ? selectedTextColor : colors.textSecondary },
                ]}
              >
                {option}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function BatchCard({ item, colors, onPress }: { item: Batch; colors: ThemeColors; onPress?: () => void }) {
  const router = useRouter();
  const isPendingSync = item.id.startsWith('offline:');
  const status = registrationStatus(item);
  const statusColor = status === 'OPEN'
    ? colors.positive
    : status === 'PAUSED'
      ? colors.attention
      : colors.textMuted;
  const activeStudents = Math.max(0, item._count?.students ?? 0);
  const studentAccessibilityLabel = `${activeStudents} active ${activeStudents === 1 ? 'student' : 'students'}`;
  const classCopy = item.className?.trim() || 'All classes';
  const subjectCopy = item.subject?.trim() || 'General subject';
  const badgeCopy = compactClassLabel(item.className);
  const scheduleCopy = item.timeSlot?.trim() || 'Schedule not set';

  return (
    <PressableScale
      accessibilityLabel={`${item.name}. ${isPendingSync ? 'Pending sync.' : ''} ${classCopy}. ${subjectCopy}. ${registrationCopy(status)}. ${scheduleCopy}. ${studentAccessibilityLabel}.`}
      accessibilityHint={isPendingSync ? 'Available after this batch syncs' : 'Opens batch details'}
      disabled={isPendingSync}
      onPress={isPendingSync ? undefined : (onPress ?? (() => router.push(`/batch/${item.id}`)))}
      style={styles.cardPressable}
    >
      <Surface style={styles.card}>
        <View style={styles.cardTopRow}>
          <View style={[styles.classBadge, { backgroundColor: colors.surfaceSecondary }]}>
            {badgeCopy ? (
              <Text style={[styles.classBadgeText, { color: colors.text }]}>{badgeCopy}</Text>
            ) : (
              <BookOpen size={21} color={colors.textSecondary} />
            )}
          </View>

          <View style={styles.cardCopy}>
            <View style={styles.cardHeadingRow}>
              <Text style={[styles.batchName, { color: colors.text }]}>{item.name}</Text>
              <View
                style={[
                  styles.statusPill,
                  { backgroundColor: colors.surfaceSecondary, borderColor: statusColor },
                ]}
              >
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.statusPillText, { color: colors.text }]}>
                  {isPendingSync ? 'Pending sync' : shortRegistrationCopy(status)}
                </Text>
              </View>
            </View>
            <Text style={[styles.batchMeta, { color: colors.textSecondary }]}>
              {classCopy} · {subjectCopy}
            </Text>
          </View>
        </View>

        <View style={styles.cardBottomRow}>
          <View style={[styles.cardFact, styles.scheduleFact, { backgroundColor: colors.surfaceSecondary }]}>
            <Clock size={16} color={colors.textMuted} />
            <Text style={[styles.cardFactText, { color: colors.textSecondary }]}>{scheduleCopy}</Text>
          </View>
          <View style={[styles.cardFact, styles.rosterFact, { backgroundColor: colors.surfaceSecondary }]}>
            <UsersIcon size={16} color={colors.textMuted} />
            <Text style={[styles.cardFactText, { color: colors.textSecondary }]}>{activeStudents}</Text>
          </View>
          <View style={[styles.openIndicator, { backgroundColor: colors.hero }]}>
            <ChevronRight size={18} color={colors.heroText} />
          </View>
        </View>
      </Surface>
    </PressableScale>
  );
}

export default function BatchesScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const { width } = useWindowDimensions();
  const { reduceMotion } = useAccessibilityPreferences();
  const router = useRouter();
  const { user, isLoggedIn } = useAuth();
  const queryClient = useQueryClient();
  const accountKey = [user?.instituteId ?? 'no-institute', user?.id ?? 'no-user'] as const;
  const accountIdentity = `${accountKey[0]}\u001f${accountKey[1]}`;
  const currentAccountIdentity = useRef(accountIdentity);
  currentAccountIdentity.current = accountIdentity;

  const [search, setSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [filter, setFilter] = useState<RegistrationFilter>('ALL');
  const [showForm, setShowForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [subject, setSubject] = useState('Mathematics');
  const [timeSlot, setTimeSlot] = useState('');
  const [className, setClassName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const createSubmitting = useRef(false);
  const createGeneration = useRef(0);
  const mounted = useRef(true);

  const {
    data: batches,
    isError,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<Batch[]>({
    queryKey: ['batches', ...accountKey],
    queryFn: ({ signal }) => offlineQuery('batches', async () => (
      await api.get('/batches', { signal })
    ).data),
    enabled: isLoggedIn && Boolean(user?.id && user?.instituteId),
    staleTime: 30_000,
  });

  const {
    data: institute,
    isError: isInstituteError,
    isLoading: isInstituteLoading,
    refetch: refetchInstitute,
  } = useQuery<InstituteResponse>({
    queryKey: ['institute', ...accountKey],
    queryFn: ({ signal }) => offlineQuery('institute', async () => (
      await api.get('/institute/me', { signal })
    ).data),
    enabled: isLoggedIn && Boolean(user?.id && user?.instituteId),
    staleTime: 5 * 60_000,
  });

  const config = institute?.config;
  const requiresGrades = config?.requiresGrades !== false;
  const allowedClasses = useMemo(() => configuredClassOptions(config), [config]);
  const allowedSubjects = useMemo(() => sanitizeStringOptions(config?.subjects), [config?.subjects]);
  const coachingFeeMode: CoachingFeeMode = institute?.coachingFeeMode === 'MONTH_COVERAGE'
    ? 'MONTH_COVERAGE'
    : 'CURRENT_DUE_BASED';
  const selectedControlText = scheme === 'dark' ? colors.backgroundDeep : colors.heroText;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      createGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    createGeneration.current += 1;
    createSubmitting.current = false;
    setSearch('');
    setFilter('ALL');
    setShowForm(false);
    setCustomName('');
    setSubject('Mathematics');
    setTimeSlot('');
    setClassName('');
    setStartDate('');
    setEndDate('');
    setCreateError(null);
    setIsCreating(false);
  }, [user?.id, user?.instituteId]);

  useEffect(() => {
    if (allowedSubjects.length === 0) return;
    setSubject((current) => allowedSubjects.includes(current) ? current : allowedSubjects[0]);
  }, [allowedSubjects]);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (batches || []).filter((batch) => {
      const matchesStatus = filter === 'ALL' || registrationStatus(batch) === filter;
      if (!matchesStatus) return false;
      if (!query) return true;
      return batch.name.toLocaleLowerCase().includes(query)
        || batch.subject?.toLocaleLowerCase().includes(query)
        || batch.className?.toLocaleLowerCase().includes(query);
    });
  }, [batches, filter, search]);

  const registrationCounts = useMemo(() => {
    const counts: Record<RegistrationFilter, number> = {
      ALL: batches?.length ?? 0,
      OPEN: 0,
      PAUSED: 0,
      ENDED: 0,
    };
    for (const batch of batches ?? []) counts[registrationStatus(batch)] += 1;
    return counts;
  }, [batches]);

  const resetCreateForm = () => {
    setCustomName('');
    setSubject(allowedSubjects[0] ?? 'Mathematics');
    setTimeSlot('');
    setClassName('');
    setStartDate('');
    setEndDate('');
    setCreateError(null);
  };

  const openCreateForm = () => {
    setCreateError(null);
    setShowForm(true);
  };

  const closeCreateForm = () => {
    if (createSubmitting.current) return;
    setCreateError(null);
    setShowForm(false);
  };

  const handleCreate = async () => {
    if (createSubmitting.current) return;

    const nextName = customName.trim();
    const nextSubject = subject.trim();
    const nextTimeSlot = timeSlot.trim();
    const nextClassName = className.trim();

    if (!nextName) {
      setCreateError('Add a batch name.');
      return;
    }
    if (requiresGrades && !nextClassName) {
      setCreateError('Choose a class or grade.');
      return;
    }
    if (!nextSubject) {
      setCreateError('Choose or enter a subject.');
      return;
    }
    if (!nextTimeSlot) {
      setCreateError('Add the regular class schedule.');
      return;
    }
    if (coachingFeeMode === 'MONTH_COVERAGE') {
      if (!isValidDateInput(startDate) || !isValidDateInput(endDate)) {
        setCreateError('Enter both dates in YYYY-MM-DD format.');
        return;
      }
      if (startDate > endDate) {
        setCreateError('The end date must be on or after the start date.');
        return;
      }
    }

    createSubmitting.current = true;
    setIsCreating(true);
    setCreateError(null);
    const generation = createGeneration.current;
    const requestAccountKey = [...accountKey] as const;
    const requestAccountIdentity = accountIdentity;
    const requestIsCurrent = () => mounted.current
      && createGeneration.current === generation
      && currentAccountIdentity.current === requestAccountIdentity;
    try {
      const payload = {
        customName: nextName,
        subject: nextSubject,
        timeSlot: nextTimeSlot,
        feeAmount: 0,
        className: requiresGrades ? nextClassName : undefined,
        ...(coachingFeeMode === 'MONTH_COVERAGE' ? {
          startDate: `${startDate}T00:00:00.000Z`,
          endDate: `${endDate}T23:59:59.999Z`,
        } : {}),
      };
      const result = await executeOrQueueMutation<Batch>({ method: 'POST', url: '/batches', data: payload });
      if (!requestIsCurrent()) return;
      if (result.status === 'queued') {
        const optimisticBatch: Batch = {
          id: `offline:${result.idempotencyKey}`,
          name: nextName,
          subject: nextSubject,
          timeSlot: nextTimeSlot,
          feeAmount: 0,
          className: requiresGrades ? nextClassName : null,
          isRegistrationOpen: true,
          isRegistrationEnded: false,
          startDate: coachingFeeMode === 'MONTH_COVERAGE' ? `${startDate}T00:00:00.000Z` : null,
          endDate: coachingFeeMode === 'MONTH_COVERAGE' ? `${endDate}T23:59:59.999Z` : null,
          coachingFeeMode,
          _count: { students: 0 },
        };
        queryClient.setQueryData<Batch[]>(['batches', ...requestAccountKey], previous => [optimisticBatch, ...(previous ?? [])]);
        await updateCachedData<Batch[]>('batches', previous => [optimisticBatch, ...(previous ?? [])]);
      } else {
        await queryClient.invalidateQueries({ queryKey: ['batches', ...requestAccountKey] });
      }
      if (!requestIsCurrent()) return;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetCreateForm();
      setShowForm(false);
      if (result.status === 'queued') Alert.alert('Saved offline', 'The batch will sync automatically when the connection returns.');
    } catch (error) {
      if (requestIsCurrent()) {
        setCreateError(createErrorMessage(error));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      if (requestIsCurrent()) {
        createSubmitting.current = false;
        setIsCreating(false);
      }
    }
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearch('');
  };

  const headerActions = (
    <View style={styles.headerActions}>
      <PressableScale
        accessibilityLabel="Search batches"
        onPress={() => setIsSearchOpen(true)}
        style={[styles.headerSearchButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
      >
        <Search size={19} color={colors.text} />
      </PressableScale>
      <PressableScale
        accessibilityLabel="Create a new batch"
        onPress={openCreateForm}
        style={[styles.headerCreateButton, { backgroundColor: colors.hero, borderColor: colors.hero }]}
      >
        <Plus size={19} color={colors.heroText} />
        <Text style={[styles.headerCreateLabel, { color: colors.heroText }]}>New batch</Text>
      </PressableScale>
    </View>
  );

  const emptyState = isLoading ? (
    <View accessibilityLabel="Loading batches" style={styles.skeletonList}>
      {[1, 2, 3, 4].map((item) => (
        reduceMotion ? (
          <View
            key={item}
            style={[
              styles.staticSkeleton,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
            ]}
          />
        ) : (
          <SkeletonLoader
            key={item}
            width={Math.max(240, width - (Spacing.xl * 2))}
            height={164}
            borderRadius={BorderRadius.xl}
          />
        )
      ))}
    </View>
  ) : isError ? (
    <Feedback
      kind="error"
      title="Batches could not load"
      description="Check the connection and try again."
      action={(
        <PressableScale
          accessibilityLabel="Retry loading batches"
          onPress={() => void refetch()}
          style={[styles.feedbackButton, { backgroundColor: colors.hero }]}
        >
          <Text style={[styles.feedbackButtonText, { color: colors.heroText }]}>Try again</Text>
        </PressableScale>
      )}
    />
  ) : (batches?.length ?? 0) === 0 ? (
    <Feedback
      kind="empty"
      title="No batches yet"
      description="Create your first batch to add students and start teaching workflows."
      action={(
        <PressableScale
          accessibilityLabel="Create your first batch"
          onPress={openCreateForm}
          style={[styles.feedbackButton, { backgroundColor: colors.hero }]}
        >
          <Plus size={18} color={colors.heroText} />
          <Text style={[styles.feedbackButtonText, { color: colors.heroText }]}>Create batch</Text>
        </PressableScale>
      )}
    />
  ) : search.trim() ? (
    <Feedback
      kind="empty"
      title="No matching batches"
      description="Try another batch name, subject, class, or registration filter."
    />
  ) : (
    <Feedback
      kind="empty"
      title={`No ${filter.toLocaleLowerCase()} batches`}
      description="Choose another registration filter to see your batches."
    />
  );

  return (
    <>
      <TeacherPage
        title="Batches"
        actions={headerActions}
        scroll={false}
      >
        <View style={styles.screenBody}>
          <ScrollView
            horizontal
            style={styles.filterScroller}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterContent}
            keyboardShouldPersistTaps="handled"
            accessibilityLabel="Filter batches by registration status"
          >
            {REGISTRATION_FILTERS.map(({ value, label }) => {
              const selected = filter === value;
              return (
                <PressableScale
                  key={value}
                  accessibilityLabel={`Show ${label.toLocaleLowerCase()}`}
                  accessibilityState={{ selected }}
                  haptic="selection"
                  onPress={() => setFilter(value)}
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor: selected ? colors.chart : colors.surfaceElevated,
                      borderColor: selected ? colors.chart : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: selected ? selectedControlText : colors.textSecondary },
                    ]}
                  >
                    {label} · {registrationCounts[value]}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>

          <FlatList
            data={filtered}
            renderItem={({ item }) => <BatchCard item={item} colors={colors} />}
            keyExtractor={(item) => item.id}
            style={styles.list}
            contentContainerStyle={[
              styles.listContent,
              filtered.length === 0 && styles.emptyListContent,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={(
              <RefreshControl
                refreshing={isRefetching && !isLoading}
                onRefresh={() => void refetch()}
                tintColor={colors.text}
                colors={[colors.text]}
                progressBackgroundColor={colors.surfaceElevated}
              />
            )}
            ListEmptyComponent={emptyState}
          />
        </View>
      </TeacherPage>

      <TeacherSearchSheet
        visible={isSearchOpen}
        title="Search batches"
        placeholder="Search batch, subject, or class"
        value={search}
        onChangeText={setSearch}
        onClose={closeSearch}
      >
        <View style={styles.searchResults}>
          {filtered.length === 0 ? (
            <Feedback kind="empty" title="No matching batches" description="Try another batch, subject, or class." />
          ) : filtered.map((item) => (
            <BatchCard
              key={item.id}
              item={item}
              colors={colors}
              onPress={() => {
                if (item.id.startsWith('offline:')) return;
                closeSearch();
                router.push(`/batch/${item.id}`);
              }}
            />
          ))}
        </View>
      </TeacherSearchSheet>

      <Modal
        visible={showForm}
        animationType={reduceMotion ? 'none' : 'slide'}
        presentationStyle="pageSheet"
        onRequestClose={closeCreateForm}
      >
        <SafeAreaView style={[styles.modalSafeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.modalHeadingCopy}>
                <Text accessibilityRole="header" style={[styles.modalTitle, { color: colors.text }]}>Create batch</Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Set the details teachers and students will recognize.</Text>
              </View>
              <PressableScale
                accessibilityLabel="Close create batch"
                accessibilityState={{ disabled: isCreating }}
                disabled={isCreating}
                onPress={closeCreateForm}
                style={[styles.closeButton, { backgroundColor: colors.surfaceSecondary }]}
              >
                <X size={20} color={colors.text} />
              </PressableScale>
            </View>

            {isInstituteLoading ? (
              <View accessibilityLabel="Loading institute settings" style={styles.modalLoading}>
                <ActivityIndicator color={colors.text} />
                <Text style={[styles.modalLoadingText, { color: colors.textSecondary }]}>Loading your batch settings…</Text>
              </View>
            ) : isInstituteError ? (
              <View style={styles.modalFeedback}>
                <Feedback
                  kind="error"
                  title="Batch settings could not load"
                  description="Try again before creating a batch so its class and fee setup is correct."
                  action={(
                    <PressableScale
                      accessibilityLabel="Retry loading batch settings"
                      onPress={() => void refetchInstitute()}
                      style={[styles.feedbackButton, { backgroundColor: colors.hero }]}
                    >
                      <Text style={[styles.feedbackButtonText, { color: colors.heroText }]}>Try again</Text>
                    </PressableScale>
                  )}
                />
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.modalContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {requiresGrades ? (
                  allowedClasses.length > 0 ? (
                    <ChoiceField
                      label="Class or grade"
                      options={allowedClasses}
                      value={className}
                      onChange={(value) => {
                        setClassName(value);
                        setCreateError(null);
                      }}
                      colors={colors}
                      selectedTextColor={selectedControlText}
                      disabled={isCreating}
                    />
                  ) : (
                    <View style={styles.inputGroup}>
                      <Text style={[styles.label, { color: colors.textSecondary }]}>Class or grade *</Text>
                      <View style={[styles.inputWrap, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                        <GraduationCap size={20} color={colors.textMuted} style={styles.inputIcon} />
                        <TextInput
                          accessibilityLabel="Class or grade"
                          autoCapitalize="words"
                          editable={!isCreating}
                          placeholder="e.g. Class 10"
                          placeholderTextColor={colors.textMuted}
                          selectionColor={colors.focus}
                          value={className}
                          onChangeText={(value) => {
                            setClassName(value);
                            setCreateError(null);
                          }}
                          style={[styles.input, { color: colors.text }]}
                        />
                      </View>
                    </View>
                  )
                ) : null}

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Batch name *</Text>
                  <View style={[styles.inputWrap, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                    <Type size={20} color={colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      accessibilityLabel="Batch name"
                      autoCapitalize="words"
                      editable={!isCreating}
                      placeholder="e.g. Target 2026 Batch"
                      placeholderTextColor={colors.textMuted}
                      selectionColor={colors.focus}
                      value={customName}
                      onChangeText={(value) => {
                        setCustomName(value);
                        setCreateError(null);
                      }}
                      style={[styles.input, { color: colors.text }]}
                    />
                  </View>
                </View>

                {allowedSubjects.length > 0 ? (
                  <ChoiceField
                    label="Subject"
                    options={allowedSubjects}
                    value={subject}
                    onChange={(value) => {
                      setSubject(value);
                      setCreateError(null);
                    }}
                    colors={colors}
                    selectedTextColor={selectedControlText}
                    disabled={isCreating}
                  />
                ) : (
                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Subject *</Text>
                    <View style={[styles.inputWrap, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                      <BookOpen size={20} color={colors.textMuted} style={styles.inputIcon} />
                      <TextInput
                        accessibilityLabel="Subject"
                        autoCapitalize="words"
                        editable={!isCreating}
                        placeholder="e.g. Mathematics"
                        placeholderTextColor={colors.textMuted}
                        selectionColor={colors.focus}
                        value={subject}
                        onChangeText={(value) => {
                          setSubject(value);
                          setCreateError(null);
                        }}
                        style={[styles.input, { color: colors.text }]}
                      />
                    </View>
                  </View>
                )}

                <View style={styles.inputGroup}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>Time slot *</Text>
                  <View style={[styles.inputWrap, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                    <Clock size={20} color={colors.textMuted} style={styles.inputIcon} />
                    <TextInput
                      accessibilityLabel="Time slot"
                      autoCapitalize="sentences"
                      editable={!isCreating}
                      placeholder="e.g. Mon-Wed-Fri 4 PM"
                      placeholderTextColor={colors.textMuted}
                      selectionColor={colors.focus}
                      value={timeSlot}
                      onChangeText={(value) => {
                        setTimeSlot(value);
                        setCreateError(null);
                      }}
                      style={[styles.input, { color: colors.text }]}
                    />
                  </View>
                </View>

                {coachingFeeMode === 'MONTH_COVERAGE' ? (
                  <Surface style={styles.dateSurface}>
                    <View style={styles.dateHeadingRow}>
                      <CalendarDays size={20} color={colors.textSecondary} />
                      <View style={styles.dateHeadingCopy}>
                        <Text style={[styles.dateTitle, { color: colors.text }]}>Batch coverage dates</Text>
                        <Text style={[styles.dateDescription, { color: colors.textSecondary }]}>Student fee coverage stays within this batch period.</Text>
                      </View>
                    </View>
                    <View style={styles.dateRow}>
                      <View style={[styles.dateGroup, { minWidth: Math.min(150, Math.max(120, width / 3)) }]}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>Start date *</Text>
                        <TextInput
                          accessibilityLabel="Batch start date"
                          autoCapitalize="none"
                          autoCorrect={false}
                          editable={!isCreating}
                          maxLength={10}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.textMuted}
                          selectionColor={colors.focus}
                          value={startDate}
                          onChangeText={(value) => {
                            setStartDate(value);
                            setCreateError(null);
                          }}
                          style={[
                            styles.dateInput,
                            { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                          ]}
                        />
                      </View>
                      <View style={[styles.dateGroup, { minWidth: Math.min(150, Math.max(120, width / 3)) }]}>
                        <Text style={[styles.label, { color: colors.textSecondary }]}>End date *</Text>
                        <TextInput
                          accessibilityLabel="Batch end date"
                          autoCapitalize="none"
                          autoCorrect={false}
                          editable={!isCreating}
                          maxLength={10}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor={colors.textMuted}
                          selectionColor={colors.focus}
                          value={endDate}
                          onChangeText={(value) => {
                            setEndDate(value);
                            setCreateError(null);
                          }}
                          style={[
                            styles.dateInput,
                            { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
                          ]}
                        />
                      </View>
                    </View>
                  </Surface>
                ) : null}

                {createError ? (
                  <View accessibilityRole="alert" style={[styles.formError, { backgroundColor: colors.surfaceSecondary, borderColor: colors.attention }]}>
                    <Text style={[styles.formErrorText, { color: colors.text }]}>{createError}</Text>
                  </View>
                ) : null}

                <PressableScale
                  accessibilityLabel={isCreating ? 'Creating batch' : 'Save batch'}
                  accessibilityState={{ busy: isCreating, disabled: isCreating }}
                  disabled={isCreating}
                  onPress={() => void handleCreate()}
                  style={[
                    styles.submitButton,
                    { backgroundColor: colors.hero, opacity: isCreating ? 0.72 : 1 },
                  ]}
                >
                  {isCreating ? <ActivityIndicator size="small" color={colors.heroText} /> : null}
                  <Text style={[styles.submitButtonText, { color: colors.heroText }]}>
                    {isCreating ? 'Creating batch…' : 'Save batch'}
                  </Text>
                  {!isCreating ? <ChevronRight size={20} color={colors.heroText} /> : null}
                </PressableScale>
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  screenBody: {
    flex: 1,
    minHeight: 0,
    marginTop: Spacing.lg,
    gap: Spacing.md,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerSearchButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCreateButton: {
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  headerCreateLabel: { ...TypeScale.label },
  searchResults: { gap: Spacing.md },
  filterScroller: {
    flexGrow: 0,
    flexShrink: 0,
  },
  filterContent: {
    minHeight: 44,
    alignItems: 'center',
    gap: Spacing.sm,
    paddingRight: Spacing.xs,
  },
  filterChip: {
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipText: { ...TypeScale.label },
  list: { flex: 1, minHeight: 0 },
  listContent: { paddingBottom: TEACHER_TAB_CONTENT_INSET },
  emptyListContent: { flexGrow: 1 },
  cardPressable: { marginBottom: Spacing.md },
  card: { gap: Spacing.lg, padding: Spacing.lg },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  classBadge: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: Spacing.sm,
    maxWidth: 88,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  classBadgeText: { ...TypeScale.body, fontWeight: FontWeight.bold, textAlign: 'center' },
  cardCopy: { flex: 1, minWidth: 0 },
  cardHeadingRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  batchName: { ...TypeScale.sectionTitle, flex: 1, minWidth: 0 },
  batchMeta: { ...TypeScale.body, marginTop: Spacing.xs },
  statusPill: {
    minHeight: 28,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  statusPillText: { ...TypeScale.caption, fontWeight: FontWeight.semibold },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardFact: {
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  scheduleFact: { flex: 1, minWidth: 0 },
  rosterFact: { flexShrink: 1, minWidth: 112, maxWidth: 164 },
  cardFactText: { ...TypeScale.label, flex: 1, minWidth: 0 },
  openIndicator: {
    width: 44,
    height: 44,
    flexShrink: 0,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonList: { flex: 1, gap: Spacing.md },
  staticSkeleton: {
    width: '100%',
    height: 164,
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
  },
  feedbackButton: {
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  feedbackButtonText: { ...TypeScale.label },
  modalSafeArea: { flex: 1 },
  modalContainer: { flex: 1 },
  modalHeader: {
    minHeight: 84,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  modalHeadingCopy: { flex: 1, minWidth: 0 },
  modalTitle: { ...TypeScale.pageTitle, fontSize: FontSize.xl, lineHeight: 30 },
  modalSubtitle: { ...TypeScale.body, marginTop: Spacing.xs },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  modalLoadingText: { ...TypeScale.body, textAlign: 'center' },
  modalFeedback: { flex: 1, padding: Spacing.xl },
  modalContent: {
    padding: Spacing.xl,
    paddingBottom: Spacing['4xl'],
    gap: Spacing.xl,
  },
  inputGroup: { gap: Spacing.sm },
  label: { ...TypeScale.label, marginLeft: Spacing.xs },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  choice: {
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: { ...TypeScale.label, textAlign: 'center' },
  inputWrap: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputIcon: { marginRight: Spacing.md },
  input: {
    flex: 1,
    minHeight: 52,
    ...TypeScale.body,
    fontWeight: FontWeight.medium,
  },
  dateSurface: { gap: Spacing.lg },
  dateHeadingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  dateHeadingCopy: { flex: 1, minWidth: 0 },
  dateTitle: { ...TypeScale.sectionTitle },
  dateDescription: { ...TypeScale.body, marginTop: Spacing.xs },
  dateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  dateGroup: {
    flexGrow: 1,
    flexBasis: 140,
    gap: Spacing.sm,
  },
  dateInput: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    ...TypeScale.body,
    fontWeight: FontWeight.medium,
  },
  formError: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    justifyContent: 'center',
  },
  formErrorText: { ...TypeScale.body, fontWeight: FontWeight.semibold },
  submitButton: {
    minHeight: 56,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  submitButtonText: { fontSize: FontSize.base, lineHeight: 22, fontWeight: FontWeight.bold },
});
