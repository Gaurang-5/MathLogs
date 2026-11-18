import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Modal,
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
import { useFocusEffect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { DashboardSearch } from '../../components/dashboard/DashboardSearch';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { ThemeModeSelector } from '../../components/ui/ThemeModeSelector';
import {
  AlertCircle,
  ChevronRight,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileText,
  IndianRupee,
  Layers,
  LogOut,
  Mail,
  Phone,
  ScanLine,
  Search,
  Sparkles,
  Save,
  Users,
  X,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { useProUpgrade } from '../../contexts/ProUpgradeContext';
import {
  Feedback,
  PressableScale,
  Surface,
  TeacherPage,
  TeacherSection,
} from '../../components/ui';
import { useAccessibilityPreferences } from '../../components/ui/useAccessibilityPreferences';
import { BorderRadius, Colors, FontSize, FontWeight, Spacing, TypeScale } from '../../constants/theme';
import api from '../../services/api';
import { offlineQuery } from '../../services/offlineSync';

type ThemeColors = typeof Colors.light | typeof Colors.dark;

function dashboardFailureDescription(error: unknown): string {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  if (status === 401) return 'Your login could not be renewed. Please sign in again.';
  if (status === 403) return 'The server declined access to this dashboard. Check your account access or sign in again.';
  if (status === 402) return 'Your account needs a plan update. Check billing on the web app.';
  if (status && status >= 500) return 'The server is temporarily unavailable. Please try again shortly.';
  return 'The app could not reach your dashboard. Check the connection and try again.';
}

interface DashboardBase {
  stats: { batches: number; students: number };
  userName: string;
}

interface CurrentDueDashboard extends DashboardBase {
  feeMode: 'CURRENT_DUE_BASED';
  finances: { collected: number; totalCollected: number; pending: number };
  defaulters: Array<{ name: string; amount: number }>;
}

interface MonthCoverageDashboard extends DashboardBase {
  feeMode: 'MONTH_COVERAGE';
  monthCoverage: {
    collectedRupees: number;
    receivedMonths: number;
    pendingMonths: number;
    overdueMonths: number;
    applicableMonths: number;
    progressPercent: number;
  };
  followUps: Array<{
    studentId: string;
    name: string;
    batchName: string;
    overdueMonths: number;
    oldestOverdueMonth: string;
  }>;
}

type DashboardData = CurrentDueDashboard | MonthCoverageDashboard;

interface BatchSummary {
  id: string;
  name: string;
  subject: string | null;
  className: string | null;
  timeSlot: string | null;
  _count: { students: number };
}

interface ClassAverage {
  name: string;
  average: number;
}

interface TestSummary {
  id: string;
  name: string;
  date: string;
  _count: { marks: number };
}

type FeeInsight = {
  title: string;
  percentage: number;
  isCurrency: boolean;
  segments: Array<{ value: number; color: string; label: string }>;
};

type FollowUp = {
  key: string;
  title: string;
  detail: string;
  trailing: string;
};

const formatCurrency = (value: number) => `₹${Math.max(0, value).toLocaleString('en-IN')}`;

function getFeeInsight(data: DashboardData | undefined, colors: ThemeColors): FeeInsight | null {
  if (!data) return null;

  if (data.feeMode === 'MONTH_COVERAGE') {
    const totals = data.monthCoverage;
    const overdue = Math.min(totals.pendingMonths, totals.overdueMonths);
    const pending = Math.max(0, totals.pendingMonths - overdue);
    return {
      title: 'Fee month coverage',
      percentage: Math.max(0, Math.min(100, totals.progressPercent)),
      isCurrency: false,
      segments: [
        { value: totals.receivedMonths, color: colors.chart, label: 'Received' },
        { value: pending, color: colors.chartSoft, label: 'Pending' },
        { value: overdue, color: colors.attention, label: 'Overdue' },
      ],
    };
  }

  const collected = Math.max(0, data.finances?.totalCollected ?? 0);
  const pending = Math.max(0, data.finances?.pending ?? 0);
  const total = collected + pending;
  return {
    title: 'Fee collection',
    percentage: total > 0 ? Math.round((collected / total) * 100) : 0,
    isCurrency: true,
    segments: [
      { value: collected, color: colors.chart, label: 'Collected' },
      { value: pending, color: colors.attention, label: 'Pending' },
    ],
  };
}

function getFollowUps(data: DashboardData | undefined): FollowUp[] {
  if (!data) return [];
  if (data.feeMode === 'MONTH_COVERAGE') {
    return (data.followUps ?? []).slice(0, 4).map((item) => ({
      key: item.studentId,
      title: item.name,
      detail: item.batchName,
      trailing: `${item.overdueMonths} ${item.overdueMonths === 1 ? 'month' : 'months'}`,
    }));
  }
  return (data.defaulters ?? []).slice(0, 4).map((item, index) => ({
    key: `${item.name}-${index}`,
    title: item.name,
    detail: 'Batch pending dues',
    trailing: formatCurrency(item.amount),
  }));
}

function ActionTile({
  icon,
  label,
  onPress,
  colors,
  wide = false,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  colors: ThemeColors;
  wide?: boolean;
}) {
  return (
    <PressableScale
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.actionTile, wide && styles.actionTileWide, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
    >
      <View style={[styles.actionIcon, { backgroundColor: colors.surfaceSecondary }]}>{icon}</View>
      <Text style={[styles.actionLabel, { color: colors.text }]}>{label}</Text>
    </PressableScale>
  );
}

function MiniMetric({
  icon,
  value,
  label,
  onPress,
  accessibilityLabel,
  colors,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  colors: ThemeColors;
}) {
  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={styles.miniMetricPressable}
    >
      <Surface style={styles.miniMetric}>
        <View style={styles.metricTopRow}>{icon}<ChevronRight size={15} color={colors.textMuted} /></View>
        <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
        <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
      </Surface>
    </PressableScale>
  );
}

function FeePulseCard({
  data,
  insight,
  hideAmounts,
  colors,
  onPress,
  stacked,
}: {
  data: DashboardData;
  insight: FeeInsight;
  hideAmounts: boolean;
  colors: ThemeColors;
  onPress: () => void;
  stacked: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const ringSize = 92 * Math.min(2, Math.max(1, fontScale));
  const collected = data.feeMode === 'MONTH_COVERAGE'
    ? data.monthCoverage.collectedRupees
    : data.finances.totalCollected;
  const hasRecords = insight.segments.some((segment) => segment.value > 0);
  const coverageLabel = data.feeMode === 'MONTH_COVERAGE' ? 'months received' : 'collected';
  const circumference = 2 * Math.PI * 36;
  const value = hideAmounts ? '••••' : formatCurrency(collected);

  return (
    <PressableScale
      accessibilityLabel={`Fee pulse. ${hideAmounts ? 'Amount hidden.' : `${value} total collected.`} ${hasRecords ? `${insight.percentage}% ${coverageLabel}.` : 'No fee records yet.'} Open fees.`}
      onPress={onPress}
      style={[styles.commandHeroPressable, stacked && styles.contentHeight]}
    >
      <Surface tone="strong" style={[styles.commandHero, stacked && styles.contentHeight, { backgroundColor: colors.hero, borderColor: colors.border }]}>
        <LinearGradient colors={[colors.hero, colors.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.heroHeading}>
          <Text style={[styles.heroKicker, { color: colors.heroText }]}>Fee pulse</Text>
          <ChevronRight size={18} color={colors.heroText} />
        </View>
        <View style={[styles.pulseChart, { width: ringSize, height: ringSize }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Svg width={ringSize} height={ringSize} viewBox="0 0 92 92" accessible={false}>
            <Circle cx={46} cy={46} r={36} fill="none" stroke={colors.heroText} strokeOpacity={0.13} strokeWidth={7} />
            {hasRecords && insight.percentage > 0 ? (
              <Circle cx={46} cy={46} r={36} fill="none" stroke={colors.heroText} strokeWidth={7}
                strokeLinecap="round" strokeDasharray={`${circumference * insight.percentage / 100} ${circumference}`}
                rotation={-90} origin="46, 46" />
            ) : null}
          </Svg>
          <View style={styles.pulseCenter}>
            <Text style={[styles.pulsePercent, { color: colors.heroText }]}>{hasRecords ? `${insight.percentage}%` : '–'}</Text>
          </View>
        </View>
        <View style={styles.heroAmounts}>
          <Text style={[styles.heroAmount, { color: colors.heroText }]}>{value}</Text>
          <Text style={[styles.heroDetail, { color: colors.heroText }]}>Total collected</Text>
          {data.feeMode === 'MONTH_COVERAGE' || !hasRecords ? <Text style={[styles.heroFootnote, { color: colors.heroText }]}>{hasRecords ? `${insight.percentage}% ${coverageLabel}` : 'No fee records yet'}</Text> : null}
        </View>
      </Surface>
    </PressableScale>
  );
}

function InstitutePerformanceCard({
  averages,
  loading,
  failed,
  onRetry,
  colors,
}: {
  averages: ClassAverage[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  colors: ThemeColors;
}) {
  const [expanded, setExpanded] = useState(false);
  const { fontScale } = useWindowDimensions();
  const useRows = expanded || fontScale > 1.25;
  const validAverages = averages.filter((item) => Number.isFinite(item.average));
  const visibleAverages = expanded ? validAverages : validAverages.slice(0, 4);

  return (
    <Surface style={styles.insightCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderCopy}>
          <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.text }]}>Institute performance</Text>
          <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>Class averages · recorded marks</Text>
        </View>
        <View style={[styles.chartBadge, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.chartBadgeText, { color: colors.textSecondary }]}>%</Text>
        </View>
      </View>
      {loading ? (
        <Text accessibilityLiveRegion="polite" style={[styles.chartMessage, { color: colors.textSecondary }]}>Loading class averages…</Text>
      ) : failed ? (
        <View style={styles.chartMessageRow}>
          <Text style={[styles.chartMessage, { color: colors.textSecondary }]}>Couldn't refresh class averages.{validAverages.length > 0 ? ' Showing the last loaded marks.' : ''}</Text>
          <PressableScale accessibilityLabel="Retry class averages" onPress={onRetry} style={styles.sectionAction}>
            <Text style={[styles.sectionActionText, { color: colors.text }]}>Retry</Text>
          </PressableScale>
        </View>
      ) : null}
      {!loading && validAverages.length === 0 && !failed ? (
        <View style={styles.inlineEmpty}>
          <ClipboardCheck size={22} color={colors.textSecondary} />
          <Text style={[styles.inlineEmptyText, { color: colors.textSecondary }]}>Class averages appear after marks are recorded.</Text>
        </View>
      ) : (
        useRows ? (
          <View style={styles.classChart}>
            {visibleAverages.map((item) => (
              <View key={item.name} accessible accessibilityLabel={`${item.name}, average ${item.average.toFixed(1)} percent`} style={styles.classRow}>
                <View style={styles.classRowHeading}>
                  <Text style={[styles.className, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.classValue, { color: colors.text }]}>{item.average.toFixed(1)}%</Text>
                </View>
                <View style={[styles.classTrack, { backgroundColor: colors.surfaceSecondary }]}>
                  <View style={[styles.classFill, { width: `${Math.max(0, Math.min(100, item.average))}%`, backgroundColor: colors.chart }]} />
                </View>
              </View>
            ))}
          </View>
        ) : visibleAverages.length > 0 ? (
          <View style={styles.performanceChart}>
            <View style={styles.performanceAxis} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {[100, 50, 0].map((tick) => <Text key={tick} style={[styles.axisLabel, { color: colors.textSecondary }]}>{tick}</Text>)}
            </View>
            <View style={styles.performancePlot}>
              <View pointerEvents="none" style={styles.performanceGrid}>
                {[0, 50, 100].map((tick) => <View key={tick} style={[styles.gridLine, { top: `${tick}%`, backgroundColor: colors.border }]} />)}
              </View>
              <View style={styles.performanceColumns}>
                {visibleAverages.map((item) => (
                  <View key={item.name} style={styles.performanceColumn} accessible accessibilityLabel={`${item.name}, average ${item.average.toFixed(1)} percent`}>
                    <View style={styles.scorePlot}>
                      <View style={[styles.scoreBar, { height: `${Math.max(0, Math.min(100, item.average))}%`, backgroundColor: colors.chart }]} />
                    </View>
                    <Text style={[styles.scoreValue, { color: colors.text }]}>{item.average.toFixed(1)}%</Text>
                    <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>{item.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null
      )}
      {validAverages.length > 4 ? (
        <PressableScale accessibilityLabel={expanded ? 'Show fewer classes' : `Show all ${validAverages.length} classes`} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.classExpand}>
          <Text style={[styles.sectionActionText, { color: colors.text }]}>{expanded ? 'Show fewer' : `Show all ${validAverages.length} classes`}</Text>
          <ChevronRight size={17} color={colors.textSecondary} style={{ transform: [{ rotate: expanded ? '-90deg' : '90deg' }] }} />
        </PressableScale>
      ) : null}
    </Surface>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user, isLoggedIn, logout, updateProfile } = useAuth();
  const { runProFeature } = useProUpgrade();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const { reduceMotion } = useAccessibilityPreferences();
  const { width, fontScale } = useWindowDimensions();
  const stackBento = width < 360 || fontScale > 1.25;
  const accountKey = [user?.instituteId ?? '', user?.id ?? ''];
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [profileTeacherName, setProfileTeacherName] = useState('');
  const [profileInstituteName, setProfileInstituteName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const hasFocusedOnce = useRef(false);

  const openProfile = useCallback(() => {
    setProfileTeacherName(user?.name || '');
    setProfileInstituteName(user?.instituteName || '');
    setProfileEmail(user?.email || '');
    setProfileError('');
    setProfileSaved(false);
    setIsProfileOpen(true);
  }, [user]);

  const saveProfile = useCallback(async () => {
    if (profileTeacherName.trim().length < 2) {
      setProfileError('Enter your name.');
      return;
    }
    if (profileInstituteName.trim().length < 2) {
      setProfileError('Enter your institute or coaching name.');
      return;
    }
    if (profileEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileEmail.trim())) {
      setProfileError('Enter a valid email address or leave it blank.');
      return;
    }
    setProfileSaving(true);
    setProfileError('');
    setProfileSaved(false);
    try {
      await updateProfile({
        teacherName: profileTeacherName.trim(),
        instituteName: profileInstituteName.trim(),
        email: profileEmail.trim() || undefined,
      });
      setProfileSaved(true);
    } catch (reason: any) {
      setProfileError(reason.message || 'Could not save your profile.');
    } finally {
      setProfileSaving(false);
    }
  }, [profileEmail, profileInstituteName, profileTeacherName, updateProfile]);

  const summaryQuery = useQuery<DashboardData>({
    queryKey: ['dashboard-summary', ...accountKey],
    queryFn: ({ signal }) => offlineQuery('dashboard-summary', async () => (
      await api.get('/dashboard/summary', { signal })
    ).data),
    enabled: isLoggedIn && !!user?.id,
    staleTime: 30_000,
  });
  const batchesQuery = useQuery<BatchSummary[]>({
    queryKey: ['dashboard-batches', ...accountKey],
    queryFn: ({ signal }) => offlineQuery('batches', async () => (
      await api.get('/batches', { signal })
    ).data),
    enabled: isLoggedIn && !!user?.id,
    staleTime: 30_000,
  });
  const testsQuery = useQuery<TestSummary[]>({
    queryKey: ['dashboard-tests', ...accountKey],
    queryFn: ({ signal }) => offlineQuery('tests', async () => (
      await api.get('/tests', { signal })
    ).data),
    enabled: isLoggedIn && !!user?.id,
    staleTime: 30_000,
  });

  const averagesQuery = useQuery<ClassAverage[]>({
    queryKey: ['dashboard-class-averages', ...accountKey],
    queryFn: ({ signal }) => offlineQuery('class-averages', async () => (
      await api.get('/stats/class-average', { signal })
    ).data),
    enabled: isLoggedIn && !!user?.id && !!summaryQuery.data,
    staleTime: 30_000,
  });

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([
      summaryQuery.refetch(),
      batchesQuery.refetch(),
      testsQuery.refetch(),
      averagesQuery.refetch(),
    ]);
  }, [averagesQuery.refetch, batchesQuery.refetch, summaryQuery.refetch, testsQuery.refetch]);

  useFocusEffect(useCallback(() => {
    if (!isLoggedIn) return;
    if (!hasFocusedOnce.current) {
      hasFocusedOnce.current = true;
      return;
    }
    void refreshAll();
  }, [isLoggedIn, refreshAll]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshAll();
    setRefreshing(false);
  }, [refreshAll]);

  const data = summaryQuery.data;
  const batches = batchesQuery.data ?? [];
  const tests = testsQuery.data ?? [];
  const feeInsight = useMemo(() => getFeeInsight(data, colors), [colors, data]);
  const followUps = useMemo(() => getFollowUps(data), [data]);

  const dateLabel = new Intl.DateTimeFormat('en-IN', {
    weekday: stackBento ? undefined : 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date());
  const logoUri = user?.logo
    ? (user.logo.startsWith('http') || user.logo.startsWith('data:') ? user.logo : `https://mathlogs.app${user.logo}`)
    : null;
  const profileName = user?.name || data?.userName || user?.instituteName || 'Teacher';
  const isInitialLoading = summaryQuery.isLoading && !data;
  const partialFailure = batchesQuery.isError || testsQuery.isError;

  const headerActions = (
    <View style={styles.headerActions}>
      <PressableScale
        accessibilityLabel="Open dashboard search"
        onPress={() => setIsSearchOpen(true)}
        style={[styles.headerButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
      >
        <Search size={19} color={colors.text} />
      </PressableScale>
      <PressableScale
        accessibilityLabel={isPrivate ? 'Show fee amounts' : 'Hide fee amounts'}
        onPress={() => setIsPrivate((value) => !value)}
        haptic="selection"
        style={[styles.headerButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
      >
        {isPrivate ? <EyeOff size={19} color={colors.text} /> : <Eye size={19} color={colors.text} />}
      </PressableScale>
      <PressableScale
        accessibilityLabel="Open profile"
        onPress={openProfile}
        style={[styles.avatarButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
      >
        <ProfileAvatar logoUri={logoUri} name={profileName} size={38} />
      </PressableScale>
    </View>
  );

  return (
    <>
      <TeacherPage
        title="Today at a glance"
        compactTitle="Today"
        eyebrow={dateLabel}
        headerLayout="compact"
        actions={headerActions}
        scrollProps={{
          keyboardShouldPersistTaps: 'handled',
          keyboardDismissMode: 'on-drag',
          refreshControl: (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.text}
              colors={[colors.text]}
              progressBackgroundColor={colors.surfaceElevated}
            />
          ),
        }}
      >
        {isInitialLoading ? (
          <Feedback kind="loading" title="Preparing your dashboard" description="Loading batches, tests, and fee status." />
        ) : summaryQuery.isError && !data ? (
          <Feedback
            kind="error"
            title="Dashboard could not load"
            description={dashboardFailureDescription(summaryQuery.error)}
            action={(
              <PressableScale
                accessibilityLabel="Retry dashboard"
                onPress={() => void refreshAll()}
                style={[styles.retryButton, { backgroundColor: colors.hero }]}
              >
                <Text style={[styles.retryText, { color: colors.heroText }]}>Try again</Text>
              </PressableScale>
            )}
          />
        ) : (
          <>
            {summaryQuery.isError && data ? (
              <Feedback kind="warning" title="Dashboard refresh failed" description="Showing the last loaded fee totals. Pull down to retry." />
            ) : null}
            {partialFailure ? (
              <Feedback
                kind="warning"
                title="Some insights are unavailable"
                description="The fee summary is visible. Pull down to retry batches and tests."
              />
            ) : null}

            <TeacherSection>
              <View style={[styles.bentoRow, stackBento && styles.bentoStack]}>
                {data && feeInsight ? (
                  <FeePulseCard data={data} insight={feeInsight} hideAmounts={isPrivate} colors={colors} stacked={stackBento} onPress={() => router.push('/(tabs)/fees' as never)} />
                ) : null}

                <View style={[styles.metricRail, stackBento && styles.metricRailHorizontal]}>
                  <MiniMetric
                    icon={<Users size={18} color={colors.textSecondary} />}
                    value={String(data?.stats.students ?? 0)}
                    label="Students"
                    onPress={() => router.push('/(tabs)/batches' as never)}
                    accessibilityLabel={`${data?.stats.students ?? 0} students. Open batches.`}
                    colors={colors}
                  />
                  <MiniMetric
                    icon={<Layers size={18} color={colors.textSecondary} />}
                    value={String(data?.stats.batches ?? 0)}
                    label="Batches"
                    onPress={() => router.push('/(tabs)/batches' as never)}
                    accessibilityLabel={`${data?.stats.batches ?? 0} batches. Open batches.`}
                    colors={colors}
                  />
                </View>
              </View>
            </TeacherSection>

            <TeacherSection>
              <View style={[styles.actionGrid, stackBento && styles.actionGridWrapped]}>
                <ActionTile
                  icon={<ScanLine size={21} color={colors.textSecondary} />}
                  label="Scan marks"
                  wide={stackBento}
                  onPress={() => runProFeature({
                    feature: 'Scan Marks',
                    description: 'Upgrade to Pro to scan mark sheets with the online OCR service.',
                  }, () => router.push('/scan' as never))}
                  colors={colors}
                />
                <ActionTile
                  icon={<IndianRupee size={21} color={colors.textSecondary} />}
                  label="Record fee"
                  wide={stackBento}
                  onPress={() => router.push('/quick-fee-modal' as never)}
                  colors={colors}
                />
                <ActionTile
                  icon={<FileText size={21} color={colors.textSecondary} />}
                  label="Tests"
                  wide={stackBento}
                  onPress={() => router.push('/(tabs)/tests' as never)}
                  colors={colors}
                />
                <ActionTile
                  icon={<Sparkles size={21} color={colors.textSecondary} />}
                  label="Quizzes"
                  wide={stackBento}
                  onPress={() => runProFeature({
                    feature: 'AI quizzes',
                    description: 'Upgrade to Pro to generate quizzes from documents, publish them online, and use quiz credits.',
                  }, () => router.push('/(tabs)/quizzes' as never))}
                  colors={colors}
                />
              </View>
            </TeacherSection>

            <TeacherSection>
              <InstitutePerformanceCard
                averages={averagesQuery.data ?? []}
                loading={averagesQuery.isPending}
                failed={averagesQuery.isError}
                onRetry={() => void averagesQuery.refetch()}
                colors={colors}
              />
            </TeacherSection>

            <TeacherSection
              title="Do next"
              action={(
                <PressableScale
                  accessibilityLabel="Open fees"
                  onPress={() => router.push('/(tabs)/fees' as never)}
                  style={styles.sectionAction}
                >
                  <Text style={[styles.sectionActionText, { color: colors.text }]}>Manage</Text>
                  <ChevronRight size={17} color={colors.textSecondary} />
                </PressableScale>
              )}
            >
              {followUps.length > 0 ? (
                <Surface style={styles.followUpList}>
                  {followUps.map((item, index) => (
                    <PressableScale
                      key={item.key}
                      accessibilityLabel={`${item.title}, ${item.detail}, ${isPrivate && data?.feeMode === 'CURRENT_DUE_BASED' ? 'amount hidden' : item.trailing}. Open fees.`}
                      onPress={() => router.push('/(tabs)/fees' as never)}
                      style={[
                        styles.followUpRow,
                        index < followUps.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                      ]}
                    >
                      <View style={[styles.followUpIcon, { backgroundColor: colors.surfaceSecondary }]}>
                        <AlertCircle size={18} color={colors.attention} />
                      </View>
                      <View style={styles.followUpCopy}>
                        <Text style={[styles.followUpTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                        <Text style={[styles.followUpDetail, { color: colors.textSecondary }]} numberOfLines={1}>{item.detail}</Text>
                      </View>
                      <Text style={[styles.followUpTrailing, { color: colors.attention }]}>
                        {isPrivate && data?.feeMode === 'CURRENT_DUE_BASED' ? '••••' : item.trailing}
                      </Text>
                    </PressableScale>
                  ))}
                </Surface>
              ) : (
                <Feedback
                  kind="success"
                  title="No fee follow-ups right now"
                  description="Current fee records do not show any pending follow-up items."
                />
              )}
            </TeacherSection>
          </>
        )}
      </TeacherPage>

      {isSearchOpen ? (
        <Modal
          visible
          animationType={reduceMotion ? 'none' : 'slide'}
          presentationStyle="pageSheet"
          onRequestClose={() => setIsSearchOpen(false)}
        >
          <SafeAreaView style={[styles.profileSafeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
            <View style={[styles.profileHeader, { borderBottomColor: colors.border }]}>
              <Text accessibilityRole="header" style={[styles.profileTitle, { color: colors.text }]}>Search</Text>
              <PressableScale accessibilityLabel="Close dashboard search" onPress={() => setIsSearchOpen(false)} style={[styles.profileClose, { backgroundColor: colors.surfaceSecondary }]}>
                <X size={20} color={colors.text} />
              </PressableScale>
            </View>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.searchBody}>
              <ScrollView contentContainerStyle={styles.searchContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                <DashboardSearch
                  autoFocus
                  onDismiss={() => setIsSearchOpen(false)}
                  batches={batches}
                  tests={tests}
                  batchesLoading={batchesQuery.isPending}
                  batchesError={batchesQuery.isError}
                  testsLoading={testsQuery.isPending}
                  testsError={testsQuery.isError}
                />
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Modal>
      ) : null}

      <Modal
        visible={isProfileOpen}
        animationType={reduceMotion ? 'none' : 'slide'}
        presentationStyle="pageSheet"
        onRequestClose={() => setIsProfileOpen(false)}
      >
        <SafeAreaView style={[styles.profileSafeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
          <View style={[styles.profileHeader, { borderBottomColor: colors.border }]}>
            <Text accessibilityRole="header" style={[styles.profileTitle, { color: colors.text }]}>Profile</Text>
            <PressableScale
              accessibilityLabel="Close profile"
              onPress={() => setIsProfileOpen(false)}
              style={[styles.profileClose, { backgroundColor: colors.surfaceSecondary }]}
            >
              <X size={20} color={colors.text} />
            </PressableScale>
          </View>
          <ScrollView contentContainerStyle={styles.profileContent}>
            <View style={styles.profileIdentity}>
              <Surface style={styles.profileAvatarSurface}>
                <ProfileAvatar logoUri={logoUri} name={profileName} size={84} />
              </Surface>
              <Text style={[styles.profileName, { color: colors.text }]}>{user?.instituteName || user?.name || 'Institute'}</Text>
              <Text style={[styles.profileSubtitle, { color: colors.textSecondary }]}>{user?.productPlan === 'PRO' ? 'Pro plan' : 'Basic plan'}</Text>
            </View>
            <View style={styles.profileForm}>
              <View style={styles.profileField}>
                <Text style={[styles.profileLabel, { color: colors.textSecondary }]}>Your name</Text>
                <TextInput value={profileTeacherName} onChangeText={(value) => { setProfileTeacherName(value); setProfileError(''); setProfileSaved(false); }} autoCapitalize="words" placeholder="Teacher name" placeholderTextColor={colors.textMuted} style={[styles.profileInput, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} />
              </View>
              <View style={styles.profileField}>
                <Text style={[styles.profileLabel, { color: colors.textSecondary }]}>Institute or coaching name</Text>
                <TextInput value={profileInstituteName} onChangeText={(value) => { setProfileInstituteName(value); setProfileError(''); setProfileSaved(false); }} autoCapitalize="words" placeholder="Institute name" placeholderTextColor={colors.textMuted} style={[styles.profileInput, { color: colors.text, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} />
              </View>
              <View style={styles.profileField}>
                <Text style={[styles.profileLabel, { color: colors.textSecondary }]}>Email</Text>
                <View style={[styles.profileInputRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <Mail size={18} color={colors.textSecondary} />
                  <TextInput value={profileEmail} onChangeText={(value) => { setProfileEmail(value); setProfileError(''); setProfileSaved(false); }} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="Optional" placeholderTextColor={colors.textMuted} style={[styles.profileInputInline, { color: colors.text }]} />
                </View>
              </View>
              {(user as { phone?: string } | null)?.phone ? (
                <View style={[styles.profilePhone, { backgroundColor: colors.surfaceSecondary }]}>
                  <Phone size={19} color={colors.textSecondary} />
                  <Text style={[styles.profileInfoText, { color: colors.text }]}>{(user as { phone?: string }).phone}</Text>
                  <Text style={[styles.profilePhoneHint, { color: colors.textMuted }]}>Verified</Text>
                </View>
              ) : null}
              {profileError ? <Text accessibilityRole="alert" style={styles.profileError}>{profileError}</Text> : null}
              {profileSaved ? <Text accessibilityLiveRegion="polite" style={[styles.profileSaved, { color: colors.positive }]}>Profile saved.</Text> : null}
              <PressableScale accessibilityLabel="Save profile" accessibilityState={{ busy: profileSaving, disabled: profileSaving }} disabled={profileSaving} haptic="commit" onPress={() => void saveProfile()} style={[styles.profileSaveButton, { backgroundColor: colors.hero }]}>
                {profileSaving ? <Text style={[styles.profileSaveText, { color: colors.heroText }]}>Saving…</Text> : <><Save size={18} color={colors.heroText} /><Text style={[styles.profileSaveText, { color: colors.heroText }]}>Save profile</Text></>}
              </PressableScale>
            </View>
            <View style={styles.appearanceSection}>
              <Text style={[styles.appearanceTitle, { color: colors.text }]}>Appearance</Text>
              <Text style={[styles.appearanceDescription, { color: colors.textSecondary }]}>Choose how the teacher workspace looks on this device.</Text>
              <ThemeModeSelector />
            </View>
            <PressableScale
              accessibilityLabel="Logout from MathLogs"
              haptic="commit"
              onPress={() => void logout()}
              style={[styles.logoutButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
              <LogOut size={19} color={Colors.error} />
              <Text style={[styles.logoutText, { color: Colors.error }]}>Logout from MathLogs</Text>
            </PressableScale>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  retryButton: {
    minHeight: 44,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { ...TypeScale.label },
  bentoRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.md },
  bentoStack: { flexDirection: 'column' },
  commandHeroPressable: { flex: 1.5, minWidth: 0 },
  commandHero: { flex: 1, minHeight: 226, padding: Spacing.lg, borderRadius: BorderRadius['2xl'], justifyContent: 'space-between', gap: Spacing.sm },
  contentHeight: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  heroHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.xs },
  heroKicker: { ...TypeScale.body, fontWeight: FontWeight.semibold },
  pulseChart: { alignSelf: 'flex-start', width: 92, height: 92, marginVertical: Spacing.xs },
  pulseCenter: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  pulsePercent: { fontSize: FontSize.lg, lineHeight: 27, fontWeight: FontWeight.semibold, letterSpacing: -0.7 },
  heroAmounts: { gap: 2 },
  heroAmount: { fontSize: FontSize.xl, lineHeight: 30, fontWeight: FontWeight.semibold, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  heroDetail: { ...TypeScale.label, fontWeight: FontWeight.medium, opacity: 0.84 },
  heroFootnote: { ...TypeScale.caption, opacity: 0.74, marginTop: Spacing.xs },
  metricRail: { flex: 0.9, minWidth: 0, gap: Spacing.md },
  metricRailHorizontal: { flexDirection: 'row' },
  miniMetricPressable: { flex: 1, minWidth: 0 },
  miniMetric: { flex: 1, minHeight: 107, padding: Spacing.md, borderRadius: BorderRadius['2xl'], justifyContent: 'space-between', gap: Spacing.xs },
  metricTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metricValue: { fontSize: FontSize['2xl'], lineHeight: 34, fontWeight: FontWeight.semibold, letterSpacing: -0.7, fontVariant: ['tabular-nums'] },
  metricLabel: { ...TypeScale.body, fontWeight: FontWeight.medium },
  actionGrid: { flexDirection: 'row', gap: Spacing.sm },
  actionGridWrapped: { flexWrap: 'wrap' },
  actionTile: { flex: 1, flexBasis: 64, minHeight: 92, paddingVertical: Spacing.md, paddingHorizontal: Spacing.xs, borderWidth: 1, borderRadius: BorderRadius.xl, alignItems: 'center', justifyContent: 'flex-start', gap: Spacing.sm },
  actionTileWide: { flexBasis: '40%' },
  actionIcon: { width: 36, height: 36, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { ...TypeScale.label, fontSize: 14, lineHeight: 19, textAlign: 'center' },
  insightCard: { gap: Spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.md },
  cardHeaderCopy: { flex: 1, minWidth: 0 },
  cardTitle: { ...TypeScale.sectionTitle },
  cardSubtitle: { ...TypeScale.label, fontWeight: FontWeight.medium, marginTop: Spacing.xs },
  chartBadge: { minWidth: 36, minHeight: 36, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  chartBadgeText: { ...TypeScale.body, fontWeight: FontWeight.semibold },
  chartMessage: { ...TypeScale.body, flex: 1 },
  chartMessageRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  performanceChart: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  performanceAxis: { height: 140, justifyContent: 'space-between', width: 24 },
  axisLabel: { ...TypeScale.caption, textAlign: 'right' },
  performancePlot: { flex: 1, minWidth: 0 },
  performanceGrid: { position: 'absolute', top: 0, left: 0, right: 0, height: 140 },
  gridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  performanceColumns: { flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-start' },
  performanceColumn: { flex: 1, maxWidth: 92, minWidth: 0, alignItems: 'stretch', gap: Spacing.xs },
  scorePlot: { height: 140, justifyContent: 'flex-end', alignItems: 'center' },
  scoreBar: { width: '70%', maxWidth: 42, borderTopLeftRadius: BorderRadius.sm, borderTopRightRadius: BorderRadius.sm },
  scoreValue: { ...TypeScale.label, textAlign: 'center', fontVariant: ['tabular-nums'], marginTop: Spacing.xs },
  scoreLabel: { ...TypeScale.label, fontWeight: FontWeight.regular, textAlign: 'center' },
  classChart: { gap: Spacing.lg },
  classRow: { gap: Spacing.sm },
  classRowHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  className: { ...TypeScale.body, flex: 1, fontWeight: FontWeight.medium },
  classValue: { ...TypeScale.body, fontWeight: FontWeight.semibold, fontVariant: ['tabular-nums'] },
  classTrack: { height: 8, borderRadius: BorderRadius.full, overflow: 'hidden' },
  classFill: { height: '100%', borderRadius: BorderRadius.full },
  classExpand: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  inlineEmpty: { minHeight: 82, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  inlineEmptyText: { ...TypeScale.body, textAlign: 'center' },
  sectionAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingLeft: Spacing.sm },
  sectionActionText: { ...TypeScale.label },
  followUpList: { padding: 0, overflow: 'hidden' },
  followUpRow: {
    minHeight: 68,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  followUpIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followUpCopy: { flex: 1, minWidth: 0 },
  followUpTitle: { ...TypeScale.label },
  followUpDetail: { ...TypeScale.label, fontWeight: FontWeight.regular, marginTop: 2 },
  followUpTrailing: { fontSize: FontSize.sm, lineHeight: 18, fontWeight: FontWeight.semibold },
  searchBody: { flex: 1 },
  searchContent: { padding: Spacing.xl, paddingBottom: Spacing['3xl'] },
  profileSafeArea: { flex: 1 },
  profileHeader: {
    minHeight: 68,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  profileTitle: TypeScale.pageTitle,
  profileClose: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileContent: { padding: Spacing.xl, gap: Spacing.xl },
  profileIdentity: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg },
  profileAvatarSurface: { width: 104, height: 104, padding: Spacing.sm, alignItems: 'center', justifyContent: 'center' },
  profileName: { fontSize: FontSize.xl, lineHeight: 29, fontWeight: FontWeight.bold, textAlign: 'center' },
  profileSubtitle: { ...TypeScale.body, textAlign: 'center' },
  profileInfo: { padding: 0, overflow: 'hidden' },
  profileInfoRow: { minHeight: 58, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  profileInfoText: { ...TypeScale.body, flex: 1 },
  profileForm: { gap: Spacing.lg },
  profileField: { gap: Spacing.sm },
  profileLabel: TypeScale.label,
  profileInput: { minHeight: 52, borderWidth: 1, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg, fontSize: FontSize.base },
  profileInputRow: { minHeight: 52, borderWidth: 1, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  profileInputInline: { flex: 1, minWidth: 0, fontSize: FontSize.base },
  profilePhone: { minHeight: 52, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  profilePhoneHint: TypeScale.caption,
  profileError: { ...TypeScale.label, color: Colors.error },
  profileSaved: TypeScale.label,
  profileSaveButton: { minHeight: 52, borderRadius: BorderRadius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  profileSaveText: { ...TypeScale.label, fontSize: FontSize.base },
  appearanceSection: { gap: Spacing.sm },
  appearanceTitle: TypeScale.sectionTitle,
  appearanceDescription: TypeScale.body,
  logoutButton: {
    minHeight: 52,
    paddingHorizontal: Spacing.lg,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  logoutText: { ...TypeScale.label },
});
