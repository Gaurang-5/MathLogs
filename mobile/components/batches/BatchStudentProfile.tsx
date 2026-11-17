import { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  GraduationCap,
  IdCard,
  Mail,
  Phone,
  RefreshCw,
  School,
  User,
  Users,
} from 'lucide-react-native';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { Feedback, PressableScale, Surface } from '../ui';
import { BatchFeeStatus } from './BatchFeeStatus';
import {
  BorderRadius,
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  TypeScale,
} from '../../constants/theme';
import type { RosterFeeStatus } from '../../utils/batchFees';

type FeeMode = 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';

export interface BatchStudentProfileMark {
  id: string;
  score: number;
  test: {
    name: string;
    date?: string | null;
    maxMarks: number;
    subject?: string | null;
  };
}

export interface BatchStudentProfileSummary {
  id: string;
  name: string;
  humanId?: string | null;
  parentName?: string | null;
  parentWhatsapp?: string | null;
  schoolName?: string | null;
  enrollmentId?: string | null;
  marks?: BatchStudentProfileMark[];
}

export interface BatchStudentProfileProps {
  student: BatchStudentProfileSummary;
  batchId: string;
  batchName: string;
  feeStatus?: RosterFeeStatus;
  onRetryFees?: () => void;
  feeLoading?: boolean;
  feeMode?: FeeMode;
}

interface RegistrationFieldDefinition {
  id: string;
  label: string;
  system?: boolean;
}

interface StudentEnrollment {
  id: string;
  status: string;
  startedAt?: string | null;
  endedAt?: string | null;
  endReason?: string | null;
  batch: {
    id: string;
    name: string;
    className?: string | null;
    subject?: string | null;
  };
}

interface StudentProfileResponse {
  id: string;
  name: string;
  humanId?: string | null;
  parentName?: string | null;
  parentWhatsapp?: string | null;
  parentEmail?: string | null;
  schoolName?: string | null;
  additionalData?: Record<string, unknown> | null;
  registrationFields?: RegistrationFieldDefinition[];
  coachingFeeMode?: FeeMode;
  status?: string;
  createdAt?: string | null;
  enrollments?: StudentEnrollment[];
  marks?: BatchStudentProfileMark[];
}

type ProfileIcon = typeof User;

function formatDate(value?: string | null) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function readableValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return null;
}

function profileErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return 'The student profile could not be loaded.';
  const status = (error as { response?: { status?: number } }).response?.status;
  if (status === 404) return 'This student profile is no longer available.';
  if (status === 401 || status === 403) return 'Your account no longer has access to this student profile.';
  if (!(error as { response?: unknown }).response) return 'Check your connection, then try again.';
  return 'The student profile could not be loaded. Please try again.';
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  return (
    <View style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {description ? <Text style={[styles.sectionDescription, { color: colors.textSecondary }]}>{description}</Text> : null}
    </View>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: ProfileIcon; label: string; value?: string | null }) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIcon, { backgroundColor: colors.surfaceSecondary }]}>
        <Icon size={18} color={colors.textSecondary} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
        <Text selectable style={[styles.infoValue, { color: value ? colors.text : colors.textMuted }]}>
          {value || 'Not recorded'}
        </Text>
      </View>
    </View>
  );
}

function RetryButton({ label, onPress, loading = false }: { label: string; onPress: () => void; loading?: boolean }) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  return (
    <PressableScale
      accessibilityLabel={label}
      disabled={loading}
      onPress={onPress}
      style={[styles.retryButton, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, loading && styles.disabled]}
    >
      {loading ? <ActivityIndicator size="small" color={colors.text} /> : <RefreshCw size={17} color={colors.text} />}
      <Text style={[styles.retryLabel, { color: colors.text }]}>{label}</Text>
    </PressableScale>
  );
}

function scoreTone(percent: number, colors: (typeof Colors)['light'] | (typeof Colors)['dark']) {
  if (percent >= 75) return colors.positive;
  if (percent >= 50) return colors.chart;
  return colors.attention;
}

export function BatchStudentProfile({
  student,
  batchId,
  batchName,
  feeStatus,
  onRetryFees,
  feeLoading = false,
  feeMode,
}: BatchStudentProfileProps) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const { isLoggedIn, user } = useAuth();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.2;
  const accountScope = `${user?.instituteId || 'no-institute'}:${user?.id || 'no-user'}`;
  const canLoad = Boolean(isLoggedIn && user?.id && user.instituteId && student.id);
  const profileQuery = useQuery<StudentProfileResponse>({
    queryKey: ['batch-student-profile', accountScope, batchId, student.id],
    enabled: canLoad,
    retry: false,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const response = await api.get<StudentProfileResponse>(`/students/${student.id}/profile`, {
        signal,
        timeout: 15_000,
      });
      if (!response.data || response.data.id !== student.id) {
        throw new Error('Student profile response did not match the selected student.');
      }
      return response.data;
    },
  });

  const profile = profileQuery.data;
  const selectedEnrollment = useMemo(() => {
    const enrollments = profile?.enrollments || [];
    if (student.enrollmentId) return enrollments.find((enrollment) => enrollment.id === student.enrollmentId && enrollment.batch?.id === batchId) || null;
    return enrollments.find((enrollment) => enrollment.batch?.id === batchId && enrollment.status === 'ACTIVE')
      || enrollments.find((enrollment) => enrollment.batch?.id === batchId)
      || null;
  }, [batchId, profile?.enrollments, student.enrollmentId]);

  const enrollmentHistory = useMemo(() => [...(profile?.enrollments || [])].sort((left, right) => {
    const leftTime = left.startedAt ? new Date(left.startedAt).getTime() : 0;
    const rightTime = right.startedAt ? new Date(right.startedAt).getTime() : 0;
    return rightTime - leftTime;
  }), [profile?.enrollments]);

  const marksAreBatchScoped = student.marks !== undefined;
  const validMarks = useMemo(() => {
    const source = marksAreBatchScoped ? student.marks || [] : profile?.marks || [];
    const seen = new Set<string>();
    return source.filter((mark) => {
      if (!mark?.id || seen.has(mark.id)) return false;
      seen.add(mark.id);
      const score = mark.score;
      const maximum = mark.test?.maxMarks;
      return Number.isFinite(score) && Number.isFinite(maximum) && maximum > 0 && score >= 0 && score <= maximum;
    }).sort((left, right) => {
      const leftTime = left.test.date ? new Date(left.test.date).getTime() : 0;
      const rightTime = right.test.date ? new Date(right.test.date).getTime() : 0;
      return rightTime - leftTime;
    });
  }, [marksAreBatchScoped, profile?.marks, student.marks]);

  const weightedAverage = useMemo(() => {
    if (!validMarks.length) return null;
    const totals = validMarks.reduce((result, mark) => ({
      earned: result.earned + Number(mark.score),
      possible: result.possible + Number(mark.test.maxMarks),
    }), { earned: 0, possible: 0 });
    return totals.possible > 0 ? (totals.earned / totals.possible) * 100 : null;
  }, [validMarks]);

  const customFields = useMemo(() => {
    if (!profile?.additionalData || !Array.isArray(profile.registrationFields)) return [];
    return profile.registrationFields
      .filter((field) => field && !field.system && typeof field.id === 'string' && typeof field.label === 'string')
      .map((field) => ({ id: field.id, label: field.label, value: readableValue(profile.additionalData?.[field.id]) }))
      .filter((field): field is { id: string; label: string; value: string } => Boolean(field.value));
  }, [profile?.additionalData, profile?.registrationFields]);

  const displayName = profile?.name?.trim() || student.name;
  const displayHumanId = profile ? profile.humanId : student.humanId;
  const displayParentName = profile ? profile.parentName : student.parentName;
  const displayParentWhatsapp = profile ? profile.parentWhatsapp : student.parentWhatsapp;
  const displaySchool = profile ? profile.schoolName : student.schoolName;
  const resolvedFeeMode = feeMode || profile?.coachingFeeMode || 'CURRENT_DUE_BASED';
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'ST';
  const profileStatus = selectedEnrollment?.status || profile?.status;
  const visibleMarks = validMarks.slice(0, 10);

  return (
    <View style={styles.root}>
      <Surface tone="strong" style={styles.identityCard}>
        <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.avatarText, { color: colors.text }]}>{initials}</Text>
        </View>
        <View style={styles.identityCopy}>
          <Text accessibilityRole="header" style={[styles.studentName, { color: colors.text }]}>{displayName}</Text>
          <View style={styles.identityMeta}>
            {displayHumanId ? (
              <View style={[styles.metaBadge, { backgroundColor: colors.surfaceSecondary }]}>
                <Text selectable style={[styles.metaBadgeText, { color: colors.textSecondary }]}>{displayHumanId}</Text>
              </View>
            ) : null}
            {profileStatus ? (
              <View style={[styles.metaBadge, { backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[styles.metaBadgeText, { color: profileStatus === 'ACTIVE' ? colors.positive : colors.textSecondary }]}>
                  {profileStatus === 'ACTIVE' ? 'Active enrollment' : profileStatus.toLowerCase().replace(/_/g, ' ')}
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.batchContext, { color: colors.textSecondary }]}>{batchName}</Text>
        </View>
      </Surface>

      {profileQuery.isLoading ? (
        <Feedback kind="loading" title="Loading student profile" description="Checking contact and enrollment details." />
      ) : profileQuery.isError ? (
        <Feedback
          kind="error"
          title="Profile details could not load"
          description={profileErrorMessage(profileQuery.error)}
          action={<RetryButton label="Retry profile" loading={profileQuery.isFetching} onPress={() => void profileQuery.refetch()} />}
        />
      ) : null}

      <View style={styles.section}>
        <SectionHeading title="Identity and contact" description="Saved details for this student and guardian." />
        <Surface style={styles.infoCard}>
          <InfoRow icon={User} label="Guardian" value={displayParentName} />
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          <InfoRow icon={Phone} label="Phone / WhatsApp" value={displayParentWhatsapp} />
          {profile ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
              <InfoRow icon={Mail} label="Email" value={profile.parentEmail} />
            </>
          ) : null}
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          <InfoRow icon={School} label="School" value={displaySchool} />
          {profile ? (
            <>
              <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
              <InfoRow icon={CalendarDays} label="Profile created" value={formatDate(profile.createdAt)} />
            </>
          ) : null}
          {customFields.map((field) => (
            <View key={field.id}>
              <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
              <InfoRow icon={IdCard} label={field.label} value={field.value} />
            </View>
          ))}
        </Surface>
      </View>

      <View style={styles.section}>
        <SectionHeading title="Fee status" description={batchName} />
        <Surface style={styles.feeCard}>
          <BatchFeeStatus fee={feeStatus} mode={resolvedFeeMode} loading={feeLoading} />
          {!feeLoading && onRetryFees && (!feeStatus || feeStatus.status === 'unavailable') ? (
            <RetryButton label="Retry fee status" onPress={onRetryFees} />
          ) : null}
        </Surface>
      </View>

      {profile ? (
        <View style={styles.section}>
          <SectionHeading title="Enrollment history" description="Recorded batch periods for this student." />
          {enrollmentHistory.length ? (
            <View style={styles.cardList}>
              {enrollmentHistory.map((enrollment) => {
                const isSelected = selectedEnrollment?.id === enrollment.id;
                const context = [enrollment.batch.className, enrollment.batch.subject].filter(Boolean).join(' · ');
                return (
                  <Surface key={enrollment.id} style={[styles.enrollmentCard, isSelected && { borderColor: colors.focus }]}>
                    {!compact ? <View style={[styles.enrollmentIcon, { backgroundColor: colors.surfaceSecondary }]}>
                      <Users size={19} color={colors.textSecondary} />
                    </View> : null}
                    <View style={styles.enrollmentCopy}>
                      <View style={styles.enrollmentTitleRow}>
                        <Text style={[styles.enrollmentTitle, { color: colors.text }]}>{enrollment.batch.name}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: colors.surfaceSecondary }]}>
                          <Text style={[styles.statusText, { color: enrollment.status === 'ACTIVE' ? colors.positive : colors.textSecondary }]}>
                            {isSelected ? 'THIS BATCH' : enrollment.status}
                          </Text>
                        </View>
                      </View>
                      {context ? <Text style={[styles.enrollmentMeta, { color: colors.textSecondary }]}>{context}</Text> : null}
                      <Text style={[styles.enrollmentMeta, { color: colors.textSecondary }]}>
                        {formatDate(enrollment.startedAt)} → {enrollment.endedAt ? formatDate(enrollment.endedAt) : enrollment.status === 'ACTIVE' ? 'Present' : 'End date not recorded'}
                      </Text>
                      {enrollment.endReason ? <Text style={[styles.enrollmentReason, { color: colors.textMuted }]}>Reason: {enrollment.endReason}</Text> : null}
                    </View>
                  </Surface>
                );
              })}
            </View>
          ) : (
            <Feedback kind="empty" title="No enrollment history recorded" description="No batch periods were returned for this student." />
          )}
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeading
          title="Performance"
          description={marksAreBatchScoped ? `Recorded scores returned for ${batchName}.` : 'Recent valid scores on this student profile.'}
        />
        {!marksAreBatchScoped && profileQuery.isLoading ? (
          <Feedback kind="loading" title="Loading performance" description="Checking this student’s recorded scores." />
        ) : !marksAreBatchScoped && profileQuery.isError ? (
          <Feedback kind="error" title="Performance unavailable" description="Profile scores could not be loaded. Retry the student profile above." />
        ) : visibleMarks.length ? (
          <>
            <Surface tone="strong" style={styles.performanceSummary}>
              <View>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Tests recorded</Text>
                <Text style={[styles.summaryValue, { color: colors.text }]}>{validMarks.length}</Text>
              </View>
              <View style={styles.summaryRight}>
                <Text style={[styles.summaryLabel, { color: colors.textMuted }]}>Average score</Text>
                <Text style={[styles.summaryValue, { color: colors.chart }]}>{weightedAverage === null ? '—' : `${Math.round(weightedAverage)}%`}</Text>
              </View>
            </Surface>
            <View style={styles.cardList}>
              {visibleMarks.map((mark) => {
                const percentage = (Number(mark.score) / Number(mark.test.maxMarks)) * 100;
                const tone = scoreTone(percentage, colors);
                return (
                  <Surface key={mark.id} style={styles.markCard}>
                    {!compact ? <View style={[styles.markIcon, { backgroundColor: colors.surfaceSecondary }]}>
                      <GraduationCap size={19} color={colors.textSecondary} />
                    </View> : null}
                    <View style={styles.markCopy}>
                      <Text style={[styles.markTitle, { color: colors.text }]}>{mark.test.name || 'Recorded assessment'}</Text>
                      <Text style={[styles.markMeta, { color: colors.textSecondary }]}>
                        {[formatDate(mark.test.date), mark.test.subject].filter(Boolean).join(' · ')}
                      </Text>
                      <View style={[styles.scoreTrack, { backgroundColor: colors.surfaceSecondary }]}>
                        <View style={[styles.scoreFill, { backgroundColor: tone, width: `${Math.min(100, percentage)}%` }]} />
                      </View>
                    </View>
                    <View style={styles.scoreCopy}>
                      <Text style={[styles.scoreValue, { color: colors.text }]}>{mark.score}/{mark.test.maxMarks}</Text>
                      <Text style={[styles.scorePercent, { color: tone }]}>{Math.round(percentage)}%</Text>
                    </View>
                  </Surface>
                );
              })}
            </View>
            {validMarks.length > visibleMarks.length ? (
              <Text style={[styles.listNote, { color: colors.textMuted }]}>Latest 10 of {validMarks.length} recorded scores. Open Performance below for the full list.</Text>
            ) : null}
          </>
        ) : (
          <Feedback kind="empty" title="No scores recorded yet" description="This student’s test results will appear here." />
        )}
      </View>

    </View>
  );
}

export default BatchStudentProfile;

const styles = StyleSheet.create({
  root: { gap: Spacing['2xl'] },
  identityCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  avatar: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: FontSize.md, lineHeight: 23, fontWeight: FontWeight.bold },
  identityCopy: { flex: 1, minWidth: 0 },
  studentName: { ...TypeScale.pageTitle, fontSize: FontSize.xl, lineHeight: 30 },
  identityMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
  metaBadge: { minHeight: 28, borderRadius: BorderRadius.full, justifyContent: 'center', paddingHorizontal: Spacing.sm },
  metaBadgeText: { ...TypeScale.caption, textTransform: 'capitalize' },
  batchContext: { ...TypeScale.body, marginTop: Spacing.sm },
  section: { gap: Spacing.md },
  sectionHeading: { gap: 3 },
  sectionTitle: { ...TypeScale.sectionTitle },
  sectionDescription: { ...TypeScale.body, fontSize: FontSize.sm, lineHeight: 19 },
  infoCard: { paddingVertical: Spacing.sm },
  infoRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
  infoIcon: { width: 40, height: 40, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  infoCopy: { flex: 1, minWidth: 0 },
  infoLabel: { ...TypeScale.caption, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { ...TypeScale.body, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  retryButton: { minHeight: 44, borderRadius: BorderRadius.md, borderWidth: 1, paddingHorizontal: Spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, alignSelf: 'flex-start' },
  retryLabel: { ...TypeScale.label },
  disabled: { opacity: 0.55 },
  feeCard: { gap: Spacing.md },
  cardList: { gap: Spacing.sm },
  enrollmentCard: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  enrollmentIcon: { width: 42, height: 42, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  enrollmentCopy: { flex: 1, minWidth: 0 },
  enrollmentTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm },
  enrollmentTitle: { ...TypeScale.label, fontSize: FontSize.base, lineHeight: 21, flex: 1 },
  statusBadge: { minHeight: 26, borderRadius: BorderRadius.full, justifyContent: 'center', paddingHorizontal: Spacing.sm, flexShrink: 0 },
  statusText: { ...TypeScale.caption, fontSize: 10, lineHeight: 14, fontWeight: FontWeight.bold },
  enrollmentMeta: { ...TypeScale.caption, marginTop: 4 },
  enrollmentReason: { ...TypeScale.caption, marginTop: 5 },
  performanceSummary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: Spacing.lg },
  summaryRight: { alignItems: 'flex-end' },
  summaryLabel: { ...TypeScale.caption, fontWeight: FontWeight.semibold },
  summaryValue: { fontSize: FontSize.xl, lineHeight: 30, fontWeight: FontWeight.bold, marginTop: 3 },
  markCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  markIcon: { width: 42, height: 42, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  markCopy: { flex: 1, minWidth: 0 },
  markTitle: { ...TypeScale.label },
  markMeta: { ...TypeScale.caption, marginTop: 3 },
  scoreTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: Spacing.sm },
  scoreFill: { height: '100%', borderRadius: 3 },
  scoreCopy: { alignItems: 'flex-end', flexShrink: 0 },
  scoreValue: { ...TypeScale.label },
  scorePercent: { ...TypeScale.caption, marginTop: 2, fontWeight: FontWeight.bold },
  listNote: { ...TypeScale.caption, textAlign: 'center' },
});
