import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  Eye,
  IndianRupee,
  MoreHorizontal,
  Phone,
  Plus,
  Receipt,
  Search,
  Send,
  Users,
  X,
} from 'lucide-react-native';
import QRCode from 'react-native-qrcode-svg';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import api from '../../services/api';
import { offlineQuery } from '../../services/offlineSync';
import { getItemAsync } from '../../services/storage';
import { useAuth } from '../../contexts/AuthContext';
import { useProUpgrade } from '../../contexts/ProUpgradeContext';
import { isProPlanRequiredError } from '../../services/proFeatureGate';
import {
  Feedback,
  PressableScale,
  SkeletonLoader,
  Surface,
} from '../../components/ui';
import { useAccessibilityPreferences } from '../../components/ui/useAccessibilityPreferences';
import { BatchActionsSheet } from '../../components/batches/BatchActionsSheet';
import { BatchFeeStatus } from '../../components/batches/BatchFeeStatus';
import { BatchStudentProfile } from '../../components/batches/BatchStudentProfile';
import BatchInviteSheet from '../../components/batches/BatchInviteSheet';
import {
  getBatchAssessmentInsights,
  isBatchInstallmentApplicable,
} from '../../utils/batchInsights';
import { coverageFeeStatus, hasUnlinkedReceipts, immediateBatchFeeStatus, installmentFeeStatus, unavailableFeeStatus, type CoverageSource, type PaymentOption, type RosterFeeStatus } from '../../utils/batchFees';
import { createFeeLookupQueue } from '../../utils/feeLookupQueue';
import {
  BorderRadius,
  Colors,
  FontSize,
  FontWeight,
  Spacing,
  TypeScale,
} from '../../constants/theme';

type ThemeColors = (typeof Colors)['light'] | (typeof Colors)['dark'];
type FeeMode = 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';
type FeeLookupSource = { mode: 'MONTH_COVERAGE'; profile: CoverageSource } | { mode: 'CURRENT_DUE_BASED'; options: PaymentOption[] };

type BatchTest = {
  id: string;
  name: string;
  maxMarks: number;
  date: string;
  subject?: string | null;
  isQuiz?: boolean;
};

type FeeInstallment = {
  id: string;
  name: string;
  amount: number;
  createdAt: string;
  studentId?: string | null;
};

type StudentMark = {
  id: string;
  score: number;
  test: BatchTest;
};

type MonthCoverageProfile = {
  id?: string;
  feeStartMonth?: string | null;
  feeEndMonth?: string | null;
  status?: 'PENDING_SETUP' | 'ACTIVE' | 'CLOSED';
};

type BatchStudent = {
  id: string;
  enrollmentId?: string;
  enrollmentStartedAt?: string;
  feeDecision?: string;
  humanId: string | null;
  name: string;
  parentName?: string | null;
  parentWhatsapp?: string | null;
  schoolName?: string | null;
  createdAt?: string;
  feePayments: Array<{
    id?: string;
    amountPaid: number;
    installmentId: string;
    date?: string;
  }>;
  feeAssignments?: Array<{ installmentId: string }>;
  fees: Array<{ id?: string; amount: number; status: string; date?: string }>;
  marks: StudentMark[];
  monthCoverageProfile?: MonthCoverageProfile | null;
};

type BatchDetails = {
  id: string;
  name: string;
  subject: string | null;
  className: string | null;
  timeSlot: string | null;
  feeAmount: number;
  startDate?: string | null;
  endDate?: string | null;
  whatsappGroupLink: string | null;
  autoSendWelcome?: boolean;
  isRegistrationOpen: boolean;
  isRegistrationEnded?: boolean;
  coachingFeeMode?: FeeMode;
  timezone?: string;
  students: BatchStudent[];
  feeInstallments: FeeInstallment[];
  tests?: BatchTest[];
};

type SheetFrameProps = {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onDismiss?: () => void;
  children: React.ReactNode;
  colors: ThemeColors;
  reduceMotion: boolean;
  keyboard?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

function SheetFrame({
  visible,
  title,
  subtitle,
  onClose,
  onDismiss,
  children,
  colors,
  reduceMotion,
  keyboard = true,
  contentStyle,
}: SheetFrameProps) {
  const content = (
    <SafeAreaView style={[styles.sheetSafeArea, { backgroundColor: colors.background }]} edges={['bottom']}>
      <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
      <View style={[styles.sheetHeader, { borderBottomColor: colors.border }]}>
        <View style={styles.sheetHeaderCopy}>
          <Text accessibilityRole="header" style={[styles.sheetTitle, { color: colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
        </View>
        <PressableScale
          accessibilityLabel={`Close ${title}`}
          onPress={onClose}
          style={[styles.closeButton, { backgroundColor: colors.surfaceSecondary }]}
        >
          <X size={20} color={colors.text} />
        </PressableScale>
      </View>
      <ScrollView
        contentContainerStyle={[styles.sheetContent, contentStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );

  return (
    <Modal
      accessibilityViewIsModal
      animationType={reduceMotion ? 'none' : 'slide'}
      onDismiss={onDismiss}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      {keyboard ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.sheetKeyboard, { backgroundColor: colors.background }]}
        >
          {content}
        </KeyboardAvoidingView>
      ) : content}
    </Modal>
  );
}

function PrimaryButton({
  label,
  onPress,
  colors,
  icon,
  disabled,
  loading,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  colors: ThemeColors;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel || label}
      disabled={disabled || loading}
      haptic="commit"
      onPress={onPress}
      style={[
        styles.primaryButton,
        { backgroundColor: colors.hero },
        (disabled || loading) && styles.disabled,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={colors.heroText} /> : icon}
      <Text style={[styles.primaryButtonText, { color: colors.heroText }]}>{label}</Text>
    </PressableScale>
  );
}

function SecondaryButton({
  label,
  onPress,
  colors,
  icon,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  colors: ThemeColors;
  icon?: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressableScale
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.secondaryButton,
        { backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
        disabled && styles.disabled,
        style,
      ]}
    >
      {icon}
      <Text style={[styles.secondaryButtonText, { color: colors.text }]}>{label}</Text>
    </PressableScale>
  );
}

function InputField({
  label,
  value,
  onChangeText,
  colors,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  colors: ThemeColors;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'numeric';
  multiline?: boolean;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.focus}
        style={[
          styles.input,
          multiline && styles.multilineInput,
          { backgroundColor: colors.surfaceElevated, borderColor: colors.border, color: colors.text },
        ]}
        value={value}
      />
    </View>
  );
}

function formatDate(value?: string | null) {
  if (!value) return 'Date not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date not set';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMonth(value?: string | null) {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function weightedRecordedAverage(
  insights: Array<{ average: number | null; maxMarks: number; recorded: number }>,
) {
  let earned = 0;
  let possible = 0;
  insights.forEach((insight) => {
    if (insight.average === null || !Number.isFinite(insight.maxMarks) || insight.maxMarks <= 0 || insight.recorded <= 0) return;
    const testPossible = insight.maxMarks * insight.recorded;
    earned += (insight.average / 100) * testPossible;
    possible += testPossible;
  });
  return possible > 0 ? (earned / possible) * 100 : null;
}

function remainingInstallmentAmount(student: BatchStudent, installment: FeeInstallment) {
  const paid = student.feePayments
    .filter((payment) => payment.installmentId === installment.id)
    .reduce((total, payment) => total + (Number(payment.amountPaid) || 0), 0);
  return Math.max(0, Number(installment.amount) - paid);
}

function getErrorStatus(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  return (error as { response?: { status?: number } }).response?.status;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return fallback;
  const message = (error as { response?: { data?: { error?: string } } }).response?.data?.error;
  if (typeof message === 'string' && message.length > 0) return message;
  const localMessage = (error as { message?: unknown }).message;
  return typeof localMessage === 'string' && localMessage.length > 0 ? localMessage : fallback;
}

export default function BatchDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoading: isAuthLoading, isLoggedIn, user } = useAuth();
  const { openProUpgrade, runProFeature } = useProUpgrade();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const { width } = useWindowDimensions();
  const { reduceMotion } = useAccessibilityPreferences();
  const batchId = Array.isArray(params.id) ? params.id[0] : params.id;
  const accountScope = `${user?.instituteId || 'no-institute'}:${user?.id || 'no-user'}`;
  const canLoadBatch = Boolean(batchId && isLoggedIn && user?.id && user.instituteId);

  const [studentSearch, setStudentSearch] = useState('');
  const [focusedStudent, setFocusedStudent] = useState<BatchStudent | null>(null);
  const [marksStudent, setMarksStudent] = useState<BatchStudent | null>(null);
  const [editStudent, setEditStudent] = useState<BatchStudent | null>(null);
  const [invoiceStudent, setInvoiceStudent] = useState<BatchStudent | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [showBatchSettings, setShowBatchSettings] = useState(false);
  const [showFeeSettings, setShowFeeSettings] = useState(false);
  const [editInstallment, setEditInstallment] = useState<FeeInstallment | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    humanId: '',
    parentName: '',
    parentWhatsapp: '',
    schoolName: '',
  });
  const [batchForm, setBatchForm] = useState({
    name: '',
    subject: '',
    className: '',
    timeSlot: '',
    whatsappGroupLink: '',
    feeAmount: '',
  });
  const [feeForm, setFeeForm] = useState({ name: '', amount: '' });
  const [editInstallmentForm, setEditInstallmentForm] = useState({ name: '', amount: '' });
  const [invoiceForm, setInvoiceForm] = useState({
    name: '',
    amount: '',
    markAsPaid: false,
    existingInstallmentId: '',
  });
  const focusedStudentActionRef = useRef<(() => void) | null>(null);
  const feeSettingsActionRef = useRef<(() => void) | null>(null);
  const actionLockRef = useRef(false);
  const downloadLockRef = useRef(false);

  const {
    data: batch,
    error,
    isError,
    isLoading,
    isRefetching,
    refetch: refetchBatch,
  } = useQuery<BatchDetails>({
    enabled: canLoadBatch,
    queryKey: ['batch', accountScope, batchId],
    queryFn: ({ signal }) => offlineQuery(`batch:${batchId}`, async () => (
      await api.get(`/batches/${batchId}`, { signal })
    ).data),
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const feeMode = batch?.coachingFeeMode || 'CURRENT_DUE_BASED';

  const students = useMemo(() => batch?.students || [], [batch?.students]);
  const tests = useMemo(
    () => [...(batch?.tests || [])].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime()),
    [batch?.tests],
  );
  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => (
      student.name.toLowerCase().includes(query)
      || student.humanId?.toLowerCase().includes(query)
      || student.parentName?.toLowerCase().includes(query)
      || student.schoolName?.toLowerCase().includes(query)
    ));
  }, [studentSearch, students]);
  const immediateFeeRows = useMemo(() => {
    const rows: Record<string, RosterFeeStatus | undefined> = {};
    for (const student of students) {
      try {
        rows[student.id] = immediateBatchFeeStatus(student, feeMode, batch?.feeInstallments || [], batch?.feeAmount || 0);
      } catch {
        rows[student.id] = unavailableFeeStatus('The fee plan needs review.');
      }
    }
    return rows;
  }, [students, feeMode, batch?.feeInstallments, batch?.feeAmount]);
  const remoteFeeStudents = useMemo(() => students.filter(student => !immediateFeeRows[student.id]), [students, immediateFeeRows]);
  const feeLookupQueue = useMemo(() => createFeeLookupQueue(), [accountScope, batchId]);
  const feeQueries = useQueries({
    queries: remoteFeeStudents.map(student => ({
      queryKey: ['batch-fee-status', accountScope, batchId, feeMode, student.id, student.enrollmentId || ''],
      enabled: canLoadBatch && Boolean(batch),
      retry: false,
      staleTime: 30_000,
      queryFn: ({ signal }: { signal: AbortSignal }): Promise<FeeLookupSource> => feeLookupQueue.run(async requestSignal => {
        if (feeMode === 'MONTH_COVERAGE') {
          const response = await api.get<CoverageSource>(`/students/${student.id}/profile`, { signal: requestSignal, timeout: 10_000 });
          return { mode: 'MONTH_COVERAGE', profile: response.data };
        }
        const response = await api.get<{ studentId: string; installments: PaymentOption[] }>(`/fees/students/${student.id}/payment-options`, { signal: requestSignal, timeout: 10_000 });
        if (response.data.studentId !== student.id || !Array.isArray(response.data.installments)) throw new Error('Fee response did not match the student');
        return { mode: 'CURRENT_DUE_BASED', options: response.data.installments };
      }, signal),
      select: (source: FeeLookupSource): RosterFeeStatus => source.mode === 'MONTH_COVERAGE'
        ? coverageFeeStatus(student, batchId!, source.profile, batch?.timezone || 'Asia/Kolkata')
        : installmentFeeStatus(student, batch?.feeInstallments || [], batch?.feeAmount || 0, source.options),
    })),
  });
  const feeRows: Record<string, RosterFeeStatus | undefined> = { ...immediateFeeRows };
  const loadingFeeIds = new Set<string>();
  const pausedFeeIds = new Set<string>();
  feeQueries.forEach((query, index) => {
    const studentId = remoteFeeStudents[index].id;
    feeRows[studentId] = query.isError ? undefined : query.data;
    if (!query.data && query.fetchStatus === 'fetching') loadingFeeIds.add(studentId);
    if (!query.data && query.isPaused) pausedFeeIds.add(studentId);
  });
  const feeRetryAvailable = feeQueries.some(query => query.isError || query.isPaused || query.data?.status === 'unavailable');
  const retryFeeStatuses = () => {
    feeQueries.forEach(query => {
      if (query.isError || query.isPaused || query.data?.status === 'unavailable') void query.refetch();
    });
  };
  const refetch = useCallback(async () => {
    const result = await refetchBatch();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['batch-fee-status', accountScope, batchId] }),
      queryClient.invalidateQueries({ queryKey: ['batch-student-profile', accountScope, batchId] }),
    ]);
    return result;
  }, [refetchBatch, queryClient, accountScope, batchId]);
  const studentAverageById = useMemo(() => {
    const averages = new Map<string, number | null>();
    students.forEach((student) => {
      const recorded = getBatchAssessmentInsights([student], batch?.tests || [])
        .filter((test) => test.average !== null);
      averages.set(student.id, weightedRecordedAverage(recorded));
    });
    return averages;
  }, [batch?.tests, students]);

  const registrationState = batch?.isRegistrationEnded
    ? 'Registration closed'
    : batch?.isRegistrationOpen
      ? 'Registration open'
      : 'Registration paused';
  const registrationTone = batch?.isRegistrationEnded
    ? Colors.error
    : batch?.isRegistrationOpen
      ? colors.positive
      : colors.attention;
  const publicRegistrationUrl = batchId ? `https://mathlogs.app/register/${batchId}` : '';

  const runAction = useCallback(async (
    key: string,
    action: () => Promise<void>,
    successMessage?: string,
  ) => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setPendingAction(key);
    try {
      await action();
      if (successMessage) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Done', successMessage);
      }
    } catch (actionError) {
      if (isProPlanRequiredError(actionError)) return;
      Alert.alert('Could not complete action', getErrorMessage(actionError, 'Please try again.'));
    } finally {
      actionLockRef.current = false;
      setPendingAction(null);
    }
  }, []);

  const handleDownload = useCallback(async (type: 'pdf' | 'stickers') => {
    if (!batchId || downloadLockRef.current) return;
    downloadLockRef.current = true;
    setIsDownloading(true);
    try {
      const token = await getItemAsync('auth_token');
      const endpoint = type === 'pdf' ? `/batches/${batchId}/download` : `/stickers/download?batchId=${batchId}`;
      const baseUrl = api.defaults.baseURL;
      if (!baseUrl) throw new Error('API base URL is not configured');
      const fileUri = `${FileSystem.documentDirectory}${type}_${batchId}.pdf`;
      const result = await FileSystem.downloadAsync(`${baseUrl}${endpoint}`, fileUri, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (result.status < 200 || result.status >= 300) throw new Error('The server could not create the file');
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, { mimeType: 'application/pdf' });
      } else {
        Alert.alert('File ready', 'The PDF was downloaded to this device.');
      }
    } catch (downloadError) {
      Alert.alert('Download failed', getErrorMessage(downloadError, 'The file could not be generated.'));
    } finally {
      downloadLockRef.current = false;
      setIsDownloading(false);
    }
  }, [batchId]);

  const handleInvite = useCallback(() => {
    runProFeature({
      feature: 'WhatsApp student invitations',
      description: 'Upgrade to Pro to send student registration invitations through WhatsApp.',
    }, () => setShowInvite(true));
  }, [runProFeature]);

  const handleToggleRegistration = useCallback(async () => {
    if (!batchId || !batch || batch.isRegistrationEnded) return;
    const nextOpen = !batch.isRegistrationOpen;
    await runAction('registration', async () => {
      await api.put(`/batches/${batchId}/toggle-registration`, { isOpen: nextOpen });
      await refetch();
    }, nextOpen ? 'Registration is open.' : 'Registration is paused.');
  }, [batch, batchId, refetch, runAction]);

  const handleEndRegistration = useCallback(() => {
    if (!batchId || !batch || batch.isRegistrationEnded) return;
    Alert.alert(
      'Close registration permanently?',
      'New registrations will stop. Existing students remain in this batch.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close registration',
          style: 'destructive',
          onPress: () => {
            void runAction('end-registration', async () => {
              await api.put(`/batches/${batchId}/end-registration`, {});
              await refetch();
            }, 'Registration is permanently closed.');
          },
        },
      ],
    );
  }, [batch, batchId, refetch, runAction]);

  const openBatchSettings = useCallback(() => {
    if (!batch) return;
    setBatchForm({
      name: batch.name || '',
      subject: batch.subject || '',
      className: batch.className || '',
      timeSlot: batch.timeSlot || '',
      whatsappGroupLink: batch.whatsappGroupLink || '',
      feeAmount: batch.feeAmount ? String(batch.feeAmount) : '',
    });
    setShowBatchSettings(true);
  }, [batch]);

  const handleBatchSettingsSave = useCallback(async () => {
    if (!batchId || !batchForm.name.trim()) {
      Alert.alert('Batch name required', 'Enter the name teachers and students recognize.');
      return;
    }
    await runAction('batch-settings', async () => {
      await api.put(`/batches/${batchId}`, {
        name: batchForm.name.trim(),
        subject: batchForm.subject.trim(),
        className: batchForm.className.trim(),
        timeSlot: batchForm.timeSlot.trim(),
        ...(user?.productPlan === 'PRO' ? { whatsappGroupLink: batchForm.whatsappGroupLink.trim() } : {}),
        ...(feeMode === 'CURRENT_DUE_BASED' ? { feeAmount: Number(batchForm.feeAmount) || 0 } : {}),
      });
      setShowBatchSettings(false);
      await refetch();
    }, 'Batch settings were updated.');
  }, [batchForm, batchId, feeMode, refetch, runAction, user?.productPlan]);

  const handleAddInstallment = useCallback(async () => {
    if (!batchId || !feeForm.name.trim() || !(Number(feeForm.amount) > 0)) {
      Alert.alert('Enter fee details', 'A name and an amount greater than zero are required.');
      return;
    }
    await runAction('add-installment', async () => {
      await api.post(`/batches/${batchId}/installments`, {
        name: feeForm.name.trim(),
        amount: Number(feeForm.amount),
      });
      setFeeForm({ name: '', amount: '' });
      await refetch();
    }, 'The fee installment was added.');
  }, [batchId, feeForm, refetch, runAction]);

  const openInstallmentEditor = useCallback((installment: FeeInstallment) => {
    const open = () => {
      setEditInstallment(installment);
      setEditInstallmentForm({ name: installment.name, amount: String(installment.amount) });
    };
    if (showFeeSettings && Platform.OS === 'ios') {
      feeSettingsActionRef.current = open;
      setShowFeeSettings(false);
      return;
    }
    if (showFeeSettings) setShowFeeSettings(false);
    open();
  }, [showFeeSettings]);

  const handleFeeSettingsDismissed = useCallback(() => {
    const action = feeSettingsActionRef.current;
    feeSettingsActionRef.current = null;
    action?.();
  }, []);

  const handleEditInstallment = useCallback(async () => {
    if (!editInstallment || !editInstallmentForm.name.trim() || !(Number(editInstallmentForm.amount) > 0)) {
      Alert.alert('Enter fee details', 'A name and an amount greater than zero are required.');
      return;
    }
    await runAction('edit-installment', async () => {
      await api.put(`/installments/${editInstallment.id}`, {
        name: editInstallmentForm.name.trim(),
        amount: Number(editInstallmentForm.amount),
      });
      setEditInstallment(null);
      await refetch();
    }, 'The fee installment was updated.');
  }, [editInstallment, editInstallmentForm, refetch, runAction]);

  const openStudentProfile = useCallback((student: BatchStudent) => {
    setFocusedStudent(student);
  }, []);

  const runAfterStudentActions = useCallback((action: () => void) => {
    if (Platform.OS === 'ios') {
      focusedStudentActionRef.current = action;
      setFocusedStudent(null);
      return;
    }
    setFocusedStudent(null);
    action();
  }, []);

  const handleStudentActionsDismissed = useCallback(() => {
    const action = focusedStudentActionRef.current;
    focusedStudentActionRef.current = null;
    action?.();
  }, []);

  const openStudentEditor = useCallback((student: BatchStudent) => {
    setFocusedStudent(null);
    setEditStudent(student);
    setEditForm({
      name: student.name || '',
      humanId: student.humanId || '',
      parentName: student.parentName || '',
      parentWhatsapp: student.parentWhatsapp || '',
      schoolName: student.schoolName || '',
    });
  }, []);

  const handleEditStudent = useCallback(async () => {
    if (!editStudent || !editForm.name.trim()) {
      Alert.alert('Student name required', 'Enter the student’s name.');
      return;
    }
    await runAction('edit-student', async () => {
      await api.put(`/students/${editStudent.id}`, {
        ...editForm,
        name: editForm.name.trim(),
      });
      setEditStudent(null);
      await refetch();
    }, 'Student details were updated.');
  }, [editForm, editStudent, refetch, runAction]);

  const openInvoice = useCallback((student: BatchStudent) => {
    setFocusedStudent(null);
    // The direct-payment sheet cannot reconcile unlinked receipts across enrollments.
    if (hasUnlinkedReceipts(student)) {
      router.push('/(tabs)/fees');
      return;
    }
    setInvoiceStudent(student);
    setInvoiceForm({ name: '', amount: '', markAsPaid: false, existingInstallmentId: '' });
  }, [router]);

  const handleCreateInvoice = useCallback(async () => {
    if (!invoiceStudent) return;
    if (!invoiceForm.existingInstallmentId || !invoiceForm.markAsPaid) {
      Alert.alert('Choose a payment', 'Select an applicable fee plan and confirm that it is being paid today.');
      return;
    }
    await runAction('invoice', async () => {
      const installment = batch?.feeInstallments.find((item) => item.id === invoiceForm.existingInstallmentId);
      if (!installment || !isBatchInstallmentApplicable(invoiceStudent, installment)) {
        throw new Error('Select an applicable fee plan for this student');
      }
      const remainingAmount = remainingInstallmentAmount(invoiceStudent, installment);
      if (remainingAmount <= 0.01) throw new Error('This fee plan is already fully paid');
      await api.post('/fees/pay-installment', {
        studentId: invoiceStudent.id,
        installmentId: installment.id,
        amount: remainingAmount,
        date: new Date().toISOString().split('T')[0],
      });
      setInvoiceStudent(null);
      await refetch();
    }, 'The payment was recorded.');
  }, [batch?.feeInstallments, invoiceForm, invoiceStudent, refetch, runAction]);

  const callParent = useCallback(async (student: BatchStudent) => {
    setFocusedStudent(null);
    if (!student.parentWhatsapp) {
      Alert.alert('No phone number', 'Add a parent phone number in student details first.');
      return;
    }
    const url = `tel:${student.parentWhatsapp}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) throw new Error('Calling is not available');
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not start call', 'Calling is not available on this device.');
    }
  }, []);

  const openKiosk = useCallback(async () => {
    if (!batchId) return;
    const url = `https://mathlogs.app/kiosk/register/${batchId}`;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) throw new Error('Cannot open URL');
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open kiosk', url);
    }
  }, [batchId]);

  const openRegistrationPage = useCallback(async () => {
    if (!publicRegistrationUrl) return;
    try {
      const canOpen = await Linking.canOpenURL(publicRegistrationUrl);
      if (!canOpen) throw new Error('Cannot open URL');
      await Linking.openURL(publicRegistrationUrl);
    } catch {
      Alert.alert('Could not open registration', publicRegistrationUrl);
    }
  }, [publicRegistrationUrl]);

  const renderBatchHeader = () => (
    <>
      <View style={[styles.appBar, { borderBottomColor: colors.border }]}>
        <PressableScale
          accessibilityLabel="Back to batches"
          onPress={() => router.back()}
          style={[styles.appBarButton, { backgroundColor: colors.surfaceSecondary }]}
        >
          <ChevronLeft size={23} color={colors.text} />
        </PressableScale>
        <View style={styles.appBarTitleWrap}>
          <Text accessibilityRole="header" numberOfLines={1} style={[styles.appBarTitle, { color: colors.text }]}>Batches</Text>
        </View>
        <PressableScale
          accessibilityLabel="Open batch actions"
          disabled={!batch}
          onPress={() => setShowActions(true)}
          style={[styles.appBarButton, { backgroundColor: colors.surfaceSecondary }]}
        >
          <MoreHorizontal size={23} color={colors.text} />
        </PressableScale>
      </View>

      {batch ? (
        <View style={styles.identityWrap}>
          <Surface tone="strong" style={styles.identityCard}>
            <View style={styles.identityTopRow}>
              <View style={styles.identityCopy}>
                <Text numberOfLines={2} style={[styles.identityTitle, { color: colors.text }]}>{batch.name}</Text>
                <Text style={[styles.identitySubtitle, { color: colors.textSecondary }]}>
                  {[batch.className, batch.subject].filter(Boolean).join(' · ') || 'General batch'}
                </Text>
              </View>
              <View style={[styles.statusBadge, { borderColor: `${registrationTone}55`, backgroundColor: `${registrationTone}12` }]}>
                <View style={[styles.statusDot, { backgroundColor: registrationTone }]} />
                <Text style={[styles.statusBadgeText, { color: registrationTone }]}>{registrationState}</Text>
              </View>
            </View>
            <View style={styles.identityMetaRow}>
              <View style={styles.identityMeta}>
                <Clock size={16} color={colors.textSecondary} />
                <Text style={[styles.identityMetaText, { color: colors.textSecondary }]}>{batch.timeSlot || 'Time not set'}</Text>
              </View>
              <View style={styles.identityMeta}>
                <Users size={16} color={colors.textSecondary} />
                <Text style={[styles.identityMetaText, { color: colors.textSecondary }]}>{students.length} students</Text>
              </View>
            </View>
          </Surface>
        </View>
      ) : null}

    </>
  );

  const renderStudent = ({ item: student }: { item: BatchStudent }) => {
    const fee = feeRows[student.id];
    const rowLoading = loadingFeeIds.has(student.id);
    const rowPaused = pausedFeeIds.has(student.id);
    const feeTitle = fee?.title || (rowLoading ? 'Loading fee status…' : rowPaused ? 'Waiting for connection' : 'Fee status unavailable');
    const feeDetail = fee?.detail || (rowLoading ? 'Checking this enrollment’s payments.' : rowPaused ? 'Fee details will load when you reconnect.' : 'Use Retry fee status above to try again.');
    const feeItemsLabel = fee?.items?.map(item => `${item.label}: ${item.status === 'paid' ? 'Received' : item.status === 'partial' ? 'Part paid' : 'Pending'}, ${item.remaining} rupees pending.`).join(' ') || '';
    const initials = student.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'ST';

    return (
      <PressableScale
        accessibilityLabel={`${student.name}. ${feeTitle}. ${feeDetail}. ${feeItemsLabel} Open student profile.`}
        onPress={() => openStudentProfile(student)}
      >
        <Surface style={styles.studentCard}>
          <View style={styles.studentIdentityRow}>
            <View style={[styles.avatar, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.avatarText, { color: colors.text }]}>{initials}</Text>
            </View>
            <View style={styles.studentCopy}>
              <Text style={[styles.studentName, { color: colors.text }]}>{student.name}</Text>
              {student.humanId ? <Text style={[styles.idBadgeText, { color: colors.textMuted }]}>{student.humanId}</Text> : null}
            </View>
            <ChevronRight size={20} color={colors.textMuted} />
          </View>
          <BatchFeeStatus fee={fee} mode={feeMode} loading={rowLoading} paused={rowPaused} />
        </Surface>
      </PressableScale>
    );
  };

  const renderStudents = () => (
    <FlatList
      contentContainerStyle={[
        styles.sectionContent,
        filteredStudents.length === 0 && styles.emptySectionContent,
      ]}
      data={filteredStudents}
      extraData={{ feeRows, loadingFeeIds, pausedFeeIds }}
      ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
      keyboardShouldPersistTaps="handled"
      keyExtractor={(student) => student.id}
      ListEmptyComponent={(
        <Feedback
          kind="empty"
          title={studentSearch ? 'No matching students' : 'No students yet'}
          description={studentSearch ? 'Try another name, ID, parent, or school.' : 'Send a registration invitation to add the first student.'}
          action={!studentSearch ? (
            <PrimaryButton colors={colors} icon={<Plus size={18} color={colors.heroText} />} label="Invite student" onPress={handleInvite} />
          ) : undefined}
        />
      )}
      ListHeaderComponent={(
        <View style={styles.studentListHeader}>
          <View style={styles.sectionHeadingRow}>
            <View style={styles.sectionHeadingCopy}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Student roster</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>{students.length} enrolled in this batch</Text>
            </View>
            <PressableScale
              accessibilityLabel="Invite student"
              onPress={handleInvite}
              style={[styles.roundAction, { backgroundColor: colors.hero }]}
            >
              <Plus size={20} color={colors.heroText} />
            </PressableScale>
          </View>
          <Surface tone="material" style={styles.searchSurface}>
            <Search size={19} color={colors.textMuted} />
            <TextInput
              accessibilityLabel="Search students"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setStudentSearch}
              placeholder="Search name, ID, parent, or school"
              placeholderTextColor={colors.textMuted}
              selectionColor={colors.focus}
              style={[styles.searchInput, { color: colors.text }]}
              value={studentSearch}
            />
            {studentSearch ? (
              <PressableScale
                accessibilityLabel="Clear student search"
                onPress={() => setStudentSearch('')}
                style={[styles.searchClear, { backgroundColor: colors.surfaceSecondary }]}
              >
                <X size={17} color={colors.textSecondary} />
              </PressableScale>
            ) : null}
          </Surface>
          {feeRetryAvailable ? <SecondaryButton colors={colors} label="Retry fee status" onPress={retryFeeStatuses} /> : null}
          {studentSearch ? (
            <Text style={[styles.resultCount, { color: colors.textSecondary }]}>{filteredStudents.length} found</Text>
          ) : null}
        </View>
      )}
      refreshControl={(
        <RefreshControl
          colors={[colors.text]}
          onRefresh={() => void refetch()}
          progressBackgroundColor={colors.surfaceElevated}
          refreshing={isRefetching}
          tintColor={colors.text}
        />
      )}
      renderItem={renderStudent}
      showsVerticalScrollIndicator={false}
    />
  );

  const renderMonthCoverageFees = () => {
    const setupRequired = students.filter((student) => (
      !student.monthCoverageProfile
      || student.monthCoverageProfile.status === 'PENDING_SETUP'
      || !student.monthCoverageProfile.feeStartMonth
    ));
    const activeProfiles = students.filter((student) => student.monthCoverageProfile?.status === 'ACTIVE');
    const closedProfiles = students.filter((student) => student.monthCoverageProfile?.status === 'CLOSED');
    return (
      <>
        <Surface style={styles.feeIntroCard}>
          <View style={[styles.feeIntroIcon, { backgroundColor: colors.surfaceSecondary }]}>
            <CalendarDays size={22} color={colors.text} />
          </View>
          <View style={styles.feeIntroCopy}>
            <Text style={[styles.workflowTitle, { color: colors.text }]}>Month coverage</Text>
            <Text style={[styles.workflowDescription, { color: colors.textSecondary }]}>Setup status comes from each active enrollment’s month-coverage profile.</Text>
          </View>
        </Surface>

        {students.length > 0 ? (
          <>
            <Surface tone="strong" style={styles.coverageSummary}>
              <View style={styles.coverageMetric}>
                <Text style={[styles.coverageValue, { color: setupRequired.length > 0 ? colors.attention : colors.text }]}>{setupRequired.length}</Text>
                <Text style={[styles.coverageLabel, { color: colors.textSecondary }]}>Need setup</Text>
              </View>
              <View style={[styles.coverageDivider, { backgroundColor: colors.border }]} />
              <View style={styles.coverageMetric}>
                <Text style={[styles.coverageValue, { color: colors.text }]}>{activeProfiles.length}</Text>
                <Text style={[styles.coverageLabel, { color: colors.textSecondary }]}>Active profiles</Text>
              </View>
              <View style={[styles.coverageDivider, { backgroundColor: colors.border }]} />
              <View style={styles.coverageMetric}>
                <Text style={[styles.coverageValue, { color: colors.text }]}>{closedProfiles.length}</Text>
                <Text style={[styles.coverageLabel, { color: colors.textSecondary }]}>Closed profiles</Text>
              </View>
            </Surface>

            <View style={styles.sectionHeadingRow}>
              <View style={styles.sectionHeadingCopy}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Enrollment setup</Text>
                <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Confirmed coverage windows for students in this batch.</Text>
              </View>
            </View>

            <View style={styles.cardList}>
              {students.map((student) => {
                const profile = student.monthCoverageProfile;
                const startMonth = formatMonth(profile?.feeStartMonth);
                const endMonth = formatMonth(profile?.feeEndMonth);
                const needsSetup = !profile || profile.status === 'PENDING_SETUP' || !startMonth;
                const isClosed = profile?.status === 'CLOSED';
                const statusLabel = needsSetup ? 'SETUP' : isClosed ? 'CLOSED' : 'ACTIVE';
                const statusColor = needsSetup ? colors.attention : isClosed ? colors.textMuted : colors.positive;
                const detail = needsSetup
                  ? 'Fee start month needs confirmation'
                  : isClosed
                    ? 'Coverage profile closed'
                    : endMonth
                      ? `${startMonth} to ${endMonth}`
                      : `From ${startMonth}`;
                return (
                  <Surface key={student.id} style={styles.coverageStudentRow}>
                    <View style={styles.coverageStudentCopy}>
                      <Text style={[styles.coverageStudentName, { color: colors.text }]}>{student.name}</Text>
                      <Text style={[styles.coverageStudentMeta, { color: colors.textSecondary }]}>{detail}</Text>
                    </View>
                    <View style={[styles.coverageBadge, { backgroundColor: `${statusColor}18` }]}>
                      <Text style={[styles.coverageBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </Surface>
                );
              })}
            </View>
          </>
        ) : (
          <Feedback kind="empty" title="No students yet" description="Invite a student to confirm their first month of coverage." />
        )}

        <PrimaryButton
          colors={colors}
          icon={<ArrowRight size={19} color={colors.heroText} />}
          label="Open fee workspace"
          onPress={() => {
            if (Platform.OS === 'ios') {
              feeSettingsActionRef.current = () => router.push('/(tabs)/fees');
              setShowFeeSettings(false);
            } else {
              setShowFeeSettings(false);
              router.push('/(tabs)/fees');
            }
          }}
        />
      </>
    );
  };

  const errorStatus = getErrorStatus(error);
  const pageLoading = isAuthLoading || (canLoadBatch && isLoading);
  const body = pageLoading ? (
    <ScrollView contentContainerStyle={styles.loadingContent} showsVerticalScrollIndicator={false}>
      <SkeletonLoader width={Math.max(240, width - (Spacing.xl * 2))} height={176} borderRadius={BorderRadius['2xl']} />
      <SkeletonLoader width={Math.max(240, width - (Spacing.xl * 2))} height={58} borderRadius={BorderRadius.lg} />
      <SkeletonLoader width={Math.max(240, width - (Spacing.xl * 2))} height={220} borderRadius={BorderRadius.xl} />
    </ScrollView>
  ) : !batch ? (
    <View style={styles.centeredFeedback}>
      <Feedback
        action={(
          <SecondaryButton colors={colors} label={errorStatus === 404 ? 'Back to batches' : 'Try again'} onPress={() => {
            if (errorStatus === 404) router.back();
            else void refetch();
          }} />
        )}
        description={errorStatus === 404
          ? 'This batch may have been removed or is no longer available.'
          : isError
            ? 'Check your connection and try loading the batch again.'
            : 'The batch could not be found.'}
        kind="error"
        title={errorStatus === 404 ? 'Batch not found' : 'Batch could not load'}
      />
    </View>
  ) : renderStudents();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
      {renderBatchHeader()}
      <View style={styles.body}>{body}</View>

      {batch ? (
        <BatchActionsSheet
          batchName={batch.name}
          isDownloading={isDownloading}
          isRegistrationEnded={Boolean(batch.isRegistrationEnded)}
          isRegistrationOpen={batch.isRegistrationOpen}
          onClose={() => setShowActions(false)}
          onDownloadRoster={() => void handleDownload('pdf')}
          onDownloadStickers={() => void handleDownload('stickers')}
          onEndRegistration={handleEndRegistration}
          onInviteStudent={handleInvite}
          onOpenFeeSetup={() => setShowFeeSettings(true)}
          onOpenKiosk={() => void openKiosk()}
          onOpenQr={() => setShowQr(true)}
          onOpenSettings={openBatchSettings}
          onToggleRegistration={() => void handleToggleRegistration()}
          showFeeSetup
          feeSetupDescription={feeMode === 'MONTH_COVERAGE' ? 'Review coverage months.' : 'Manage fee installments.'}
          visible={showActions}
        />
      ) : null}

      {batch ? (
        <BatchInviteSheet
          batch={batch}
          key={`${accountScope}:${batch.id}`}
          onClose={() => setShowInvite(false)}
          onSuccess={() => void refetch()}
          visible={showInvite}
        />
      ) : null}

      <SheetFrame
        colors={colors}
        keyboard={false}
        onClose={() => setFocusedStudent(null)}
        onDismiss={handleStudentActionsDismissed}
        reduceMotion={reduceMotion}
        subtitle={focusedStudent ? `${focusedStudent.humanId || 'Student'} · ${batch?.name || 'Batch'}` : undefined}
        title="Student profile"
        visible={Boolean(focusedStudent)}
      >
        {focusedStudent ? (
          <>
          <BatchStudentProfile
            key={`${accountScope}:${focusedStudent.id}:${focusedStudent.enrollmentId || ''}`}
            student={students.find(student => student.id === focusedStudent.id) || focusedStudent}
            batchId={batchId!}
            batchName={batch?.name || 'Batch'}
            feeMode={feeMode}
            feeStatus={feeRows[focusedStudent.id]}
            feeLoading={loadingFeeIds.has(focusedStudent.id)}
            onRetryFees={retryFeeStatuses}
          />
          <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>Student actions</Text>
          <View style={styles.studentActionGrid}>
            <PressableScale
              accessibilityLabel={`View performance for ${focusedStudent.name}`}
              onPress={() => runAfterStudentActions(() => setMarksStudent(focusedStudent))}
              style={[styles.studentActionTile, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
              <View style={[styles.studentActionIcon, { backgroundColor: colors.surfaceSecondary }]}>
                <Eye size={21} color={colors.text} />
              </View>
              <Text style={[styles.studentActionLabel, { color: colors.text }]}>Performance</Text>
              <Text style={[styles.studentActionDescription, { color: colors.textSecondary }]}>Recorded scores</Text>
            </PressableScale>
            <PressableScale
              accessibilityLabel={`Call parent of ${focusedStudent.name}`}
              onPress={() => void callParent(focusedStudent)}
              style={[styles.studentActionTile, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
              <View style={[styles.studentActionIcon, { backgroundColor: colors.surfaceSecondary }]}>
                <Phone size={21} color={colors.text} />
              </View>
              <Text style={[styles.studentActionLabel, { color: colors.text }]}>Call parent</Text>
              <Text style={[styles.studentActionDescription, { color: colors.textSecondary }]}>Use saved number</Text>
            </PressableScale>
            <PressableScale
              accessibilityLabel={`Edit ${focusedStudent.name}`}
              onPress={() => runAfterStudentActions(() => openStudentEditor(focusedStudent))}
              style={[styles.studentActionTile, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
              <View style={[styles.studentActionIcon, { backgroundColor: colors.surfaceSecondary }]}>
                <Edit2 size={21} color={colors.text} />
              </View>
              <Text style={[styles.studentActionLabel, { color: colors.text }]}>Edit details</Text>
              <Text style={[styles.studentActionDescription, { color: colors.textSecondary }]}>Student and parent info</Text>
            </PressableScale>
            {feeMode === 'CURRENT_DUE_BASED' ? (
              <PressableScale
                accessibilityLabel={`${hasUnlinkedReceipts(focusedStudent) ? 'Review payments' : 'Record fee payment'} for ${focusedStudent.name}`}
                onPress={() => runAfterStudentActions(() => openInvoice(focusedStudent))}
                style={[styles.studentActionTile, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
              >
                <View style={[styles.studentActionIcon, { backgroundColor: colors.surfaceSecondary }]}>
                  <Receipt size={21} color={colors.text} />
                </View>
                <Text style={[styles.studentActionLabel, { color: colors.text }]}>{hasUnlinkedReceipts(focusedStudent) ? 'Review payments' : 'Record payment'}</Text>
                <Text style={[styles.studentActionDescription, { color: colors.textSecondary }]}>{hasUnlinkedReceipts(focusedStudent) ? 'Previous receipts in Fees' : 'This batch’s fee plans'}</Text>
              </PressableScale>
            ) : null}
          </View>
          </>
        ) : null}
      </SheetFrame>

      <SheetFrame
        colors={colors}
        keyboard={false}
        onClose={() => setMarksStudent(null)}
        reduceMotion={reduceMotion}
        subtitle="Recorded scores and tests after enrollment"
        title={`${marksStudent?.name || 'Student'} performance`}
        visible={Boolean(marksStudent)}
      >
        {marksStudent ? (() => {
          const joinDate = new Date(marksStudent.enrollmentStartedAt || marksStudent.createdAt || 0);
          joinDate.setHours(0, 0, 0, 0);
          const markByTest = new Map(marksStudent.marks.filter((mark) => {
            const test = tests.find((item) => item.id === mark.test.id);
            return test && Number.isFinite(test.maxMarks) && test.maxMarks > 0
              && Number.isFinite(mark.score) && mark.score >= 0 && mark.score <= test.maxMarks;
          }).map((mark) => [mark.test.id, mark]));
          const performanceRows = tests
            .filter((test) => {
              const testDate = new Date(test.date);
              testDate.setHours(0, 0, 0, 0);
              return markByTest.has(test.id) || testDate >= joinDate;
            })
            .map((test) => ({ test, mark: markByTest.get(test.id) }))
            .sort((left, right) => new Date(right.test.date).getTime() - new Date(left.test.date).getTime());
          const average = studentAverageById.get(marksStudent.id) ?? null;
          return (
            <>
              <Surface tone="strong" style={styles.performanceSummary}>
                <View>
                  <Text style={[styles.performanceSummaryLabel, { color: colors.textSecondary }]}>RECORDED AVERAGE</Text>
                  <Text style={[styles.performanceSummaryValue, { color: colors.text }]}>{average === null ? '—' : `${Math.round(average)}%`}</Text>
                </View>
                <Text style={[styles.performanceSummaryMeta, { color: colors.textSecondary }]}>
                  {markByTest.size} recorded {markByTest.size === 1 ? 'test' : 'tests'}
                </Text>
              </Surface>
              {performanceRows.length === 0 ? (
                <Feedback kind="empty" title="No performance records" description="Scores will appear when marks are recorded for this student." />
              ) : (
                <View style={styles.cardList}>
                  {performanceRows.map(({ test, mark }) => (
                    <Surface key={test.id} style={styles.markRow}>
                      <View style={styles.markCopy}>
                        <Text style={[styles.markName, { color: colors.text }]}>{test.name}</Text>
                        <Text style={[styles.markDate, { color: colors.textSecondary }]}>{formatDate(test.date)} · Max {test.maxMarks}</Text>
                      </View>
                      {mark ? (
                        <View style={styles.markScoreWrap}>
                          <Text style={[styles.markScore, { color: colors.text }]}>{mark.score}</Text>
                          <Text style={[styles.markPercent, { color: colors.chart }]}>
                            {test.maxMarks > 0 ? `${Math.round((mark.score / test.maxMarks) * 100)}%` : '—'}
                          </Text>
                        </View>
                      ) : (
                        <View style={[styles.unrecordedBadge, { backgroundColor: colors.surfaceSecondary }]}>
                          <Text style={[styles.unrecordedText, { color: colors.textSecondary }]}>Not recorded</Text>
                        </View>
                      )}
                    </Surface>
                  ))}
                </View>
              )}
            </>
          );
        })() : null}
      </SheetFrame>

      <SheetFrame
        colors={colors}
        onClose={() => setEditStudent(null)}
        reduceMotion={reduceMotion}
        subtitle="Update the student and parent information used by teachers."
        title="Edit student"
        visible={Boolean(editStudent)}
      >
        <InputField colors={colors} label="Student name *" onChangeText={(name) => setEditForm((value) => ({ ...value, name }))} placeholder="Student name" value={editForm.name} />
        <InputField colors={colors} label="Student ID" onChangeText={(humanId) => setEditForm((value) => ({ ...value, humanId }))} placeholder="e.g. STD001" value={editForm.humanId} />
        <InputField colors={colors} label="Parent name" onChangeText={(parentName) => setEditForm((value) => ({ ...value, parentName }))} placeholder="Parent name" value={editForm.parentName} />
        <InputField colors={colors} keyboardType="phone-pad" label="Parent phone" onChangeText={(parentWhatsapp) => setEditForm((value) => ({ ...value, parentWhatsapp }))} placeholder="10-digit phone number" value={editForm.parentWhatsapp} />
        <InputField colors={colors} label="School" onChangeText={(schoolName) => setEditForm((value) => ({ ...value, schoolName }))} placeholder="School name" value={editForm.schoolName} />
        <PrimaryButton
          colors={colors}
          label="Save student"
          loading={pendingAction === 'edit-student'}
          onPress={() => void handleEditStudent()}
        />
      </SheetFrame>

      <SheetFrame
        colors={colors}
        onClose={() => setInvoiceStudent(null)}
        reduceMotion={reduceMotion}
        subtitle={invoiceStudent ? `For ${invoiceStudent.name}` : undefined}
        title="Record fee payment"
        visible={Boolean(invoiceStudent)}
      >
        <Text style={[styles.workflowDescription, { color: colors.textSecondary }]}>Choose an applicable fee plan from this batch. New custom invoices are available in the Fees workspace.</Text>
          <View style={styles.optionList}>
            {(batch?.feeInstallments || [])
              .filter((installment) => invoiceStudent
                ? isBatchInstallmentApplicable(invoiceStudent, installment)
                  && remainingInstallmentAmount(invoiceStudent, installment) > 0.01
                : false)
              .map((installment) => {
                const selected = invoiceForm.existingInstallmentId === installment.id;
                const remaining = invoiceStudent ? remainingInstallmentAmount(invoiceStudent, installment) : installment.amount;
                return (
                  <PressableScale
                    accessibilityLabel={`${installment.name}, ${installment.amount} rupees`}
                    accessibilityState={{ selected }}
                    key={installment.id}
                    onPress={() => setInvoiceForm((value) => ({ ...value, existingInstallmentId: installment.id }))}
                    style={[
                      styles.optionRow,
                      {
                        backgroundColor: selected ? colors.hero : colors.surfaceElevated,
                        borderColor: selected ? colors.hero : colors.border,
                      },
                    ]}
                  >
                    <View style={styles.optionCopy}>
                      <Text style={[styles.optionTitle, { color: selected ? colors.heroText : colors.text }]}>{installment.name}</Text>
                      <Text style={[styles.optionMeta, { color: selected ? colors.heroText : colors.textSecondary }]}>₹{remaining.toLocaleString('en-IN')} remaining</Text>
                    </View>
                    {selected ? <Check size={20} color={colors.heroText} /> : null}
                  </PressableScale>
                );
              })}
            {invoiceStudent && !(batch?.feeInstallments || []).some((installment) => (
              isBatchInstallmentApplicable(invoiceStudent, installment)
              && remainingInstallmentAmount(invoiceStudent, installment) > 0.01
            )) ? (
              <Feedback kind="empty" title="No applicable fee plans" description="Open the Fees workspace to create an invoice or update the student’s fee setup." />
            ) : null}
          </View>

        <PressableScale
          accessibilityLabel="Record this fee plan as paid today"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: invoiceForm.markAsPaid }}
          onPress={() => setInvoiceForm((value) => ({ ...value, markAsPaid: !value.markAsPaid }))}
          style={[styles.checkboxRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
        >
          <View style={[
            styles.checkbox,
            {
              backgroundColor: invoiceForm.markAsPaid ? colors.hero : colors.surfaceSecondary,
              borderColor: invoiceForm.markAsPaid ? colors.hero : colors.border,
            },
          ]}>
            {invoiceForm.markAsPaid ? <Check size={16} color={colors.heroText} /> : null}
          </View>
          <View style={styles.checkboxCopy}>
            <Text style={[styles.optionTitle, { color: colors.text }]}>
              Record this plan as paid today
            </Text>
            <Text style={[styles.optionMeta, { color: colors.textSecondary }]}>Records the payment on today’s date.</Text>
          </View>
        </PressableScale>

        <PrimaryButton
          colors={colors}
          disabled={!invoiceForm.existingInstallmentId || !invoiceForm.markAsPaid}
          label="Record payment"
          loading={pendingAction === 'invoice'}
          onPress={() => void handleCreateInvoice()}
        />
        <SecondaryButton colors={colors} label="Open Fees for a new invoice" onPress={() => {
          setInvoiceStudent(null);
          router.push('/(tabs)/fees');
        }} />
      </SheetFrame>

      <SheetFrame
        colors={colors}
        keyboard={false}
        onClose={() => setShowQr(false)}
        reduceMotion={reduceMotion}
        subtitle={registrationState}
        title="Registration QR"
        visible={showQr}
      >
        <Surface style={styles.qrCard}>
          <View style={styles.qrCodeWrap}>
            {publicRegistrationUrl ? (
              <QRCode
                backgroundColor="#FFFFFF"
                color="#111827"
                size={Math.min(190, width - 120)}
                value={publicRegistrationUrl}
              />
            ) : null}
          </View>
          <Text style={[styles.qrBatchName, { color: colors.text }]}>{batch?.name}</Text>
          <Text selectable style={[styles.qrUrl, { color: colors.textSecondary }]}>{publicRegistrationUrl}</Text>
        </Surface>
        <PrimaryButton
          colors={colors}
          icon={<ArrowRight size={19} color={colors.heroText} />}
          label="Open registration page"
          onPress={() => void openRegistrationPage()}
        />
      </SheetFrame>

      <SheetFrame
        colors={colors}
        onClose={() => setShowBatchSettings(false)}
        reduceMotion={reduceMotion}
        subtitle="Keep the details used across teacher and registration screens accurate."
        title="Batch settings"
        visible={showBatchSettings}
      >
        <InputField colors={colors} label="Batch name *" onChangeText={(name) => setBatchForm((value) => ({ ...value, name }))} placeholder="Batch name" value={batchForm.name} />
        <InputField colors={colors} label="Subject" onChangeText={(subject) => setBatchForm((value) => ({ ...value, subject }))} placeholder="Subject" value={batchForm.subject} />
        <InputField colors={colors} label="Class or grade" onChangeText={(className) => setBatchForm((value) => ({ ...value, className }))} placeholder="e.g. Class 10" value={batchForm.className} />
        <InputField colors={colors} label="Time slot" onChangeText={(timeSlot) => setBatchForm((value) => ({ ...value, timeSlot }))} placeholder="e.g. Mon-Wed-Fri 4 PM" value={batchForm.timeSlot} />
        {user?.productPlan === 'PRO' ? (
          <InputField colors={colors} label="WhatsApp group link" onChangeText={(whatsappGroupLink) => setBatchForm((value) => ({ ...value, whatsappGroupLink }))} placeholder="https://chat.whatsapp.com/..." value={batchForm.whatsappGroupLink} />
        ) : (
          <PressableScale
            accessibilityLabel="WhatsApp group link. Pro feature"
            onPress={() => openProUpgrade({
              feature: 'WhatsApp group links',
              description: 'Upgrade to Pro to add and use a WhatsApp group link for this batch.',
            })}
            style={[styles.proLockedField, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
          >
            <View style={styles.proLockedCopy}>
              <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>WhatsApp group link</Text>
              <Text style={[styles.proLockedValue, { color: colors.text }]}>Available with Pro</Text>
            </View>
            <Text style={[styles.proBadge, { color: colors.background, backgroundColor: colors.text }]}>PRO</Text>
          </PressableScale>
        )}
        {feeMode === 'CURRENT_DUE_BASED' ? (
          <InputField colors={colors} keyboardType="numeric" label="Legacy batch fee" onChangeText={(feeAmount) => setBatchForm((value) => ({ ...value, feeAmount }))} placeholder="Amount in rupees" value={batchForm.feeAmount} />
        ) : null}
        {feeMode === 'MONTH_COVERAGE' ? (
          <Surface style={styles.dateNotice}>
            <CalendarDays size={20} color={colors.textSecondary} />
            <Text style={[styles.dateNoticeText, { color: colors.textSecondary }]}>
              Coverage range: {formatDate(batch?.startDate)} to {formatDate(batch?.endDate)}
            </Text>
          </Surface>
        ) : null}
        <PrimaryButton
          colors={colors}
          label="Save batch"
          loading={pendingAction === 'batch-settings'}
          onPress={() => void handleBatchSettingsSave()}
        />
      </SheetFrame>

      <SheetFrame
        colors={colors}
        onClose={() => setShowFeeSettings(false)}
        onDismiss={handleFeeSettingsDismissed}
        reduceMotion={reduceMotion}
        subtitle={feeMode === 'MONTH_COVERAGE' ? 'Review enrollment coverage dates and setup.' : 'Create and edit the installments available to this batch.'}
        title="Fee setup"
        visible={showFeeSettings}
      >
        {feeMode === 'MONTH_COVERAGE' ? renderMonthCoverageFees() : (<>
        <Surface style={styles.addFeeCard}>
          <Text style={[styles.formSectionTitle, { color: colors.text }]}>Add fee plan</Text>
          <InputField colors={colors} label="Name *" onChangeText={(name) => setFeeForm((value) => ({ ...value, name }))} placeholder="e.g. Term 1" value={feeForm.name} />
          <InputField colors={colors} keyboardType="numeric" label="Amount *" onChangeText={(amount) => setFeeForm((value) => ({ ...value, amount }))} placeholder="Amount in rupees" value={feeForm.amount} />
          <PrimaryButton
            colors={colors}
            icon={<Plus size={18} color={colors.heroText} />}
            label="Add fee plan"
            loading={pendingAction === 'add-installment'}
            onPress={() => void handleAddInstallment()}
          />
        </Surface>

        <Text style={[styles.formSectionTitle, { color: colors.text }]}>Existing plans</Text>
        <View style={styles.optionList}>
          {(batch?.feeInstallments || []).filter((installment) => !installment.studentId).map((installment) => (
            <PressableScale
              accessibilityLabel={`Edit ${installment.name}`}
              key={installment.id}
              onPress={() => openInstallmentEditor(installment)}
              style={[styles.optionRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
            >
              <View style={styles.optionCopy}>
                <Text style={[styles.optionTitle, { color: colors.text }]}>{installment.name}</Text>
                <Text style={[styles.optionMeta, { color: colors.textSecondary }]}>₹{installment.amount.toLocaleString('en-IN')}</Text>
              </View>
              <Edit2 size={18} color={colors.textMuted} />
            </PressableScale>
          ))}
        </View>
        </>)}
      </SheetFrame>

      <SheetFrame
        colors={colors}
        onClose={() => setEditInstallment(null)}
        reduceMotion={reduceMotion}
        subtitle="Changes apply anywhere this plan is assigned."
        title="Edit fee plan"
        visible={Boolean(editInstallment)}
      >
        <InputField colors={colors} label="Name *" onChangeText={(name) => setEditInstallmentForm((value) => ({ ...value, name }))} placeholder="Fee plan name" value={editInstallmentForm.name} />
        <InputField colors={colors} keyboardType="numeric" label="Amount *" onChangeText={(amount) => setEditInstallmentForm((value) => ({ ...value, amount }))} placeholder="Amount in rupees" value={editInstallmentForm.amount} />
        <PrimaryButton
          colors={colors}
          label="Save fee plan"
          loading={pendingAction === 'edit-installment'}
          onPress={() => void handleEditInstallment()}
        />
      </SheetFrame>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1, minHeight: 0 },
  appBar: {
    minHeight: 56,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  appBarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appBarTitleWrap: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.sm },
  appBarTitle: { ...TypeScale.sectionTitle, maxWidth: '100%' },
  identityWrap: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.sm },
  identityCard: {
    borderRadius: BorderRadius['2xl'],
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  identityTopRow: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: Spacing.md },
  identityCopy: { flex: 1, minWidth: 180 },
  identityTitle: { fontSize: FontSize.xl, lineHeight: 30, fontWeight: FontWeight.bold, letterSpacing: -0.5 },
  identitySubtitle: { ...TypeScale.body, marginTop: Spacing.xs },
  statusBadge: {
    maxWidth: 132,
    minHeight: 32,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusBadgeText: { ...TypeScale.caption, flexShrink: 1 },
  identityMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, marginTop: Spacing.md },
  identityMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  identityMetaText: { ...TypeScale.label },
  sectionContent: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing['3xl'], gap: Spacing.lg },
  emptySectionContent: { flexGrow: 1 },
  loadingContent: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, gap: Spacing.lg },
  centeredFeedback: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sectionHeadingCopy: { flex: 1, minWidth: 0 },
  sectionTitle: { ...TypeScale.sectionTitle },
  sectionSubtitle: { ...TypeScale.body, marginTop: 2 },
  workflowTitle: { ...TypeScale.sectionTitle, fontSize: FontSize.base, lineHeight: 21 },
  workflowDescription: { ...TypeScale.body, fontSize: FontSize.sm, lineHeight: 19, marginTop: 3 },
  primaryButton: {
    minHeight: 50,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  primaryButtonText: { ...TypeScale.label, textAlign: 'center' },
  secondaryButton: {
    minHeight: 46,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  secondaryButtonText: { ...TypeScale.label, textAlign: 'center' },
  disabled: { opacity: 0.5 },
  textAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2 },
  textActionLabel: { ...TypeScale.label },
  studentListHeader: { gap: Spacing.md, marginBottom: Spacing.lg },
  roundAction: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  searchSurface: {
    minHeight: 52,
    paddingVertical: 0,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  searchInput: { flex: 1, minHeight: 48, ...TypeScale.body, paddingVertical: 0 },
  searchClear: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  resultCount: { ...TypeScale.caption, paddingHorizontal: Spacing.xs },
  listSeparator: { height: Spacing.sm },
  studentCard: { padding: Spacing.lg, gap: Spacing.md },
  studentIdentityRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FontSize.sm, lineHeight: 18, fontWeight: FontWeight.bold },
  studentCopy: { flex: 1, minWidth: 0 },
  studentName: { ...TypeScale.sectionTitle, fontSize: FontSize.base, lineHeight: 21, flexShrink: 1 },
  idBadge: { borderRadius: BorderRadius.sm, paddingHorizontal: 7, paddingVertical: 3 },
  idBadgeText: { ...TypeScale.caption },
  studentMeta: { ...TypeScale.caption, marginTop: 3 },
  studentSignals: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: Spacing.sm },
  signalBadge: { minHeight: 28, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%' },
  signalText: { ...TypeScale.caption, flexShrink: 1 },
  cardList: { gap: Spacing.sm },
  feeIntroCard: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.md },
  feeIntroIcon: { width: 48, height: 48, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center' },
  feeIntroCopy: { flex: 1, minWidth: 150 },
  feePlanRow: { padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  feePlanIcon: { width: 42, height: 42, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  feePlanCopy: { flex: 1, minWidth: 0 },
  feePlanName: { ...TypeScale.label },
  feePlanMeta: { ...TypeScale.caption, marginTop: 3 },
  feePlanTrailing: { alignItems: 'flex-end', gap: 4 },
  feePlanAmount: { ...TypeScale.label },
  coverageSummary: { flexDirection: 'row', alignItems: 'stretch', padding: Spacing.lg },
  coverageMetric: { flex: 1, alignItems: 'center', justifyContent: 'center', minWidth: 0 },
  coverageValue: { fontSize: FontSize.xl, lineHeight: 30, fontWeight: FontWeight.bold },
  coverageLabel: { ...TypeScale.caption, textAlign: 'center', marginTop: 3 },
  coverageDivider: { width: StyleSheet.hairlineWidth, marginHorizontal: Spacing.sm },
  coverageStudentRow: { padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  coverageStudentCopy: { flex: 1, minWidth: 0 },
  coverageStudentName: { ...TypeScale.label },
  coverageStudentMeta: { ...TypeScale.caption, marginTop: 3 },
  coverageBadge: { minWidth: 54, minHeight: 30, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center' },
  coverageBadgeText: { fontSize: 10, lineHeight: 14, fontWeight: FontWeight.bold, letterSpacing: 0.4 },
  sheetKeyboard: { flex: 1 },
  sheetSafeArea: { flex: 1 },
  sheetHandle: { width: 42, height: 5, borderRadius: 999, alignSelf: 'center', marginTop: Spacing.sm },
  sheetHeader: { minHeight: 70, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sheetHeaderCopy: { flex: 1, minWidth: 0 },
  sheetTitle: { ...TypeScale.sectionTitle },
  sheetSubtitle: { ...TypeScale.caption, marginTop: 3 },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  sheetContent: { padding: Spacing.xl, paddingBottom: Spacing['4xl'], gap: Spacing.lg },
  studentActionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  studentActionTile: { width: '47%', flexGrow: 1, minHeight: 124, borderRadius: BorderRadius.xl, borderWidth: 1, padding: Spacing.lg },
  studentActionIcon: { width: 44, height: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  studentActionLabel: { ...TypeScale.label, fontSize: 15, lineHeight: 20 },
  studentActionDescription: { ...TypeScale.body, fontSize: 13, lineHeight: 18, marginTop: 4 },
  performanceSummary: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: Spacing.lg },
  performanceSummaryLabel: { fontSize: 10, lineHeight: 14, fontWeight: FontWeight.bold, letterSpacing: 0.8 },
  performanceSummaryValue: { fontSize: FontSize['2xl'], lineHeight: 34, fontWeight: FontWeight.bold, marginTop: 3 },
  performanceSummaryMeta: { ...TypeScale.caption, textAlign: 'right' },
  markRow: { padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  markCopy: { flex: 1, minWidth: 0 },
  markName: { ...TypeScale.label },
  markDate: { ...TypeScale.caption, marginTop: 3 },
  markScoreWrap: { alignItems: 'flex-end' },
  markScore: { fontSize: FontSize.lg, lineHeight: 26, fontWeight: FontWeight.bold },
  markPercent: { ...TypeScale.caption },
  unrecordedBadge: { minHeight: 30, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 1 },
  unrecordedText: { ...TypeScale.label, textAlign: 'center' },
  inputGroup: { gap: 7 },
  inputLabel: { ...TypeScale.label },
  proLockedField: { minHeight: 72, borderWidth: 1, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  proLockedCopy: { flex: 1, minWidth: 0, gap: 4 },
  proLockedValue: { ...TypeScale.body },
  proBadge: { ...TypeScale.caption, overflow: 'hidden', borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 4 },
  input: { minHeight: 50, borderRadius: BorderRadius.md, borderWidth: 1, paddingHorizontal: Spacing.md, ...TypeScale.body },
  multilineInput: { minHeight: 100, paddingTop: Spacing.md, textAlignVertical: 'top' },
  modeSwitch: { borderRadius: BorderRadius.lg, padding: 4, flexDirection: 'row', gap: 4 },
  modeButton: { flex: 1, minHeight: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.sm },
  modeButtonText: { ...TypeScale.label, textAlign: 'center' },
  optionList: { gap: Spacing.sm },
  optionRow: { minHeight: 58, borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  optionCopy: { flex: 1, minWidth: 0 },
  optionTitle: { ...TypeScale.label },
  optionMeta: { ...TypeScale.caption, marginTop: 3 },
  checkboxRow: { minHeight: 64, borderRadius: BorderRadius.lg, borderWidth: 1, padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  checkbox: { width: 28, height: 28, borderRadius: BorderRadius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  checkboxCopy: { flex: 1 },
  qrCard: { alignItems: 'center', paddingVertical: Spacing['2xl'] },
  qrCodeWrap: { backgroundColor: '#FFFFFF', borderRadius: BorderRadius.xl, padding: Spacing.lg },
  qrBatchName: { ...TypeScale.sectionTitle, marginTop: Spacing.lg, textAlign: 'center' },
  qrUrl: { ...TypeScale.caption, marginTop: Spacing.sm, textAlign: 'center' },
  dateNotice: { padding: Spacing.md, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  dateNoticeText: { ...TypeScale.body, flex: 1 },
  addFeeCard: { gap: Spacing.md },
  formSectionTitle: { ...TypeScale.sectionTitle },
});
