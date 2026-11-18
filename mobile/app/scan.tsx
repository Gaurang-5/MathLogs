import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, TextInput, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions, type LensInfo } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, X, Check, ChevronDown, CheckCircle2, Layers3, Trash2 } from 'lucide-react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { captureMarksSticker, createResearchCaptureId } from '../services/stickerCapture';
import { PressableScale } from '../components/ui';
import { useAccessibilityPreferences } from '../components/ui/useAccessibilityPreferences';
import { StickerCameraControls } from '../components/StickerCameraControls';
import { Colors } from '../constants/theme';
import api from '../services/api';
import { executeOrQueueMutation, offlineQuery } from '../services/offlineSync';
import { validateMark } from '../utils/marks';
import { upsertQueuedMark, validateQueuedMarks, type QueuedMark } from '../utils/multiScan';
import { isProPlanRequiredError } from '../services/proFeatureGate';

const T = {
  bg: '#000000', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827', emerald: '#10b981',
  blue: '#3b82f6', red: '#ef4444', border: 'rgba(255,255,255,0.2)'
};

interface StudentData {
  id: string;
  name: string;
  humanId: string | null;
  batch?: { name: string };
  marks?: Array<{ testId: string; score: number }>;
}

interface ScanTest {
  id: string;
  name: string;
  subject: string;
  maxMarks: number;
}

type ScanMode = 'single' | 'multi';

interface SaveReceipt {
  count: number;
  description: string;
  testName: string;
}

export default function GlobalScanScreen() {
  const { testId: initialTestId } = useLocalSearchParams<{ testId?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const cameraRef = React.useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [lenses, setLenses] = useState<LensInfo[]>([]);
  const [selectedLens, setSelectedLens] = useState<string | undefined>();
  const [cameraVersion, setCameraVersion] = useState(0);
  const [ocrError, setOcrError] = useState('');
  const [readStatus, setReadStatus] = useState<'read' | 'needs_review' | null>(null);
  const captureLock = React.useRef(false);
  const captureRequest = React.useRef<AbortController | null>(null);
  const { reduceMotion } = useAccessibilityPreferences();
  useEffect(() => () => { captureRequest.current?.abort(); }, []);
  const [student, setStudent] = useState<StudentData | null>(null);
  const [score, setScore] = useState('');
  const [existingMark, setExistingMark] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = React.useRef(false);
  const [researchCaptureId, setResearchCaptureId] = useState<string | null>(null);
  const researchStartedAt = React.useRef<number | null>(null);
  const [lastSaved, setLastSaved] = useState<SaveReceipt | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>('single');
  const [queuedMarks, setQueuedMarks] = useState<QueuedMark[]>([]);
  const [isQueueReviewOpen, setIsQueueReviewOpen] = useState(false);
  const [batchSaveError, setBatchSaveError] = useState('');

  const [selectedTestId, setSelectedTestId] = useState<string>('');
  const [isTestDropdownOpen, setIsTestDropdownOpen] = useState(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission]);

  const testsQuery = useQuery<ScanTest[]>({
    queryKey: ['tests'],
    queryFn: () => offlineQuery('tests', async () => (await api.get('/tests')).data),
  });
  const tests = testsQuery.data ?? [];

  useEffect(() => {
    if (!selectedTestId && initialTestId && tests.some(test => test.id === initialTestId)) {
      setSelectedTestId(initialTestId);
    }
  }, [initialTestId, selectedTestId, tests]);

  const selectedTest = tests.find(t => t.id === selectedTestId);

  const clearCurrentReview = () => {
    setStudent(null);
    setScore('');
    setExistingMark(null);
    setReadStatus(null);
    setOcrError('');
    setResearchCaptureId(null);
    researchStartedAt.current = null;
  };

  const recordResearchOutcome = (captureId: string | null, outcome: 'RETAKE' | 'CANCELLED') => {
    if (captureId) void api.post(`/sticker-research/${captureId}/outcome`, { outcome }).catch(() => undefined);
  };

  const closeScanner = () => {
    const close = () => {
      abandonResearchCapture('CANCELLED');
      queuedMarks.forEach(item => recordResearchOutcome(item.researchCaptureId, 'CANCELLED'));
      captureRequest.current?.abort();
      router.back();
    };
    if (queuedMarks.length === 0) {
      close();
      return;
    }
    Alert.alert(
      'Discard scanned marks?',
      `${queuedMarks.length} reviewed ${queuedMarks.length === 1 ? 'mark has' : 'marks have'} not been saved.`,
      [
        { text: 'Keep scanning', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: close },
      ],
    );
  };

  const handleCapture = async () => {
    const captureTestId = selectedTestId;
    if (captureLock.current || processing || student || !cameraReady || !cameraRef.current || !captureTestId) return;
    captureLock.current = true;
    const captureId = createResearchCaptureId();
    setResearchCaptureId(captureId);
    researchStartedAt.current = Date.now();
    const request = new AbortController();
    captureRequest.current = request;
    setProcessing(true);
    setScore('');
    setReadStatus(null);
    setOcrError('');
    setExistingMark(null);
    try {
      const result = await captureMarksSticker(cameraRef.current, captureTestId, request.signal, captureId, identified => {
        if (request.signal.aborted || captureRequest.current !== request) return;
        setStudent(identified);
        setExistingMark(identified.marks?.find(mark => mark.testId === captureTestId)?.score ?? null);
      });
      if (request.signal.aborted) return;
      const validation = validateMark(result.score, selectedTest?.maxMarks);
      setScore(validation.ok ? result.score : '');
      setReadStatus(validation.ok ? 'read' : 'needs_review');
      setOcrError(result.error || (!validation.ok && result.score !== '' ? `${validation.message} Check the photo and enter the correct mark.` : ''));
      setStudent(result.student);
      setResearchCaptureId(result.researchCaptureId || captureId);
      setExistingMark(result.student.marks?.find((mark: { testId: string; score: number }) => mark.testId === captureTestId)?.score ?? null);
    } catch (error: any) {
      if (!request.signal.aborted && !isProPlanRequiredError(error)) {
        Alert.alert('Capture failed', error.response?.data?.error || error.message || 'Please try again.');
      }
    } finally {
      if (captureRequest.current === request) { setProcessing(false); captureLock.current = false; }
      request.abort();
    }
  };

  const handleSave = async () => {
    if (saveLock.current || !student || !score || !selectedTestId) return;

    const validation = validateMark(score, selectedTest?.maxMarks);
    if (!validation.ok) {
      setOcrError(validation.message);
      return;
    }
    captureRequest.current?.abort();
    setProcessing(false);
    saveLock.current = true;
    setIsSaving(true);
    try {
      const result = await executeOrQueueMutation({ method: 'POST', url: '/marks', data: {
        testId: selectedTestId,
        studentId: student.id,
        score: validation.score,
        ...(researchCaptureId ? {
          researchCaptureId,
          researchReviewDurationMs: researchStartedAt.current == null ? undefined : Math.max(0, Date.now() - researchStartedAt.current),
          researchIdentitySource: 'qr',
        } : {}),
      } });
      setLastSaved({
        count: 1,
        description: result.status === 'queued'
          ? `${student.name} · ${validation.score} marks · saved offline`
          : `${student.name} · ${validation.score} marks`,
        testName: selectedTest?.name ?? 'test',
      });
      if (result.status === 'synced') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['tests'] }),
          queryClient.invalidateQueries({ queryKey: ['test', selectedTestId] }),
        ]);
      }
      clearCurrentReview();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to save marks.');
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  const addCurrentMarkToQueue = () => {
    if (!student || !selectedTestId) return;
    const validation = validateMark(score, selectedTest?.maxMarks);
    if (!validation.ok) {
      setOcrError(validation.message);
      return;
    }
    captureRequest.current?.abort();
    const next: QueuedMark = {
      studentId: student.id,
      studentName: student.name,
      humanId: student.humanId,
      batchName: student.batch?.name || 'No batch',
      score: String(validation.score),
      existingMark,
      researchCaptureId,
      researchReviewDurationMs: researchStartedAt.current == null ? undefined : Math.max(0, Date.now() - researchStartedAt.current),
    };
    const result = upsertQueuedMark(queuedMarks, next);
    if (result.replaced?.researchCaptureId && result.replaced.researchCaptureId !== next.researchCaptureId) {
      recordResearchOutcome(result.replaced.researchCaptureId, 'RETAKE');
    }
    setQueuedMarks(result.queue);
    setBatchSaveError('');
    clearCurrentReview();
  };

  const updateQueuedScore = (studentId: string, nextScore: string) => {
    setBatchSaveError('');
    setQueuedMarks(current => current.map(item => item.studentId === studentId
      ? { ...item, score: nextScore.replace(/[^0-9.]/g, '') }
      : item));
  };

  const removeQueuedMark = (studentId: string) => {
    const removed = queuedMarks.find(item => item.studentId === studentId);
    recordResearchOutcome(removed?.researchCaptureId ?? null, 'CANCELLED');
    setQueuedMarks(current => current.filter(item => item.studentId !== studentId));
    setBatchSaveError('');
  };

  const saveQueuedMarks = async () => {
    if (saveLock.current || !selectedTestId || queuedMarks.length === 0) return;
    const validated = validateQueuedMarks(queuedMarks, selectedTest?.maxMarks);
    const invalid = validated.find(result => !result.validation.ok);
    if (invalid && !invalid.validation.ok) {
      setBatchSaveError(`${invalid.item.studentName}: ${invalid.validation.message}`);
      return;
    }

    saveLock.current = true;
    setIsSaving(true);
    setBatchSaveError('');
    const succeeded = new Set<string>();
    const failures: string[] = [];
    for (const result of validated) {
      if (!result.validation.ok) continue;
      try {
        await executeOrQueueMutation({ method: 'POST', url: '/marks', data: {
          testId: selectedTestId,
          studentId: result.item.studentId,
          score: result.validation.score,
          ...(result.item.researchCaptureId ? {
            researchCaptureId: result.item.researchCaptureId,
            researchReviewDurationMs: result.item.researchReviewDurationMs,
            researchIdentitySource: 'qr',
          } : {}),
        } });
        succeeded.add(result.item.studentId);
      } catch (error: any) {
        failures.push(`${result.item.studentName}: ${error.response?.data?.error || 'could not save'}`);
      }
    }

    const remaining = queuedMarks.filter(item => !succeeded.has(item.studentId));
    setQueuedMarks(remaining);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['tests'] }),
      queryClient.invalidateQueries({ queryKey: ['test', selectedTestId] }),
    ]);
    if (failures.length > 0) {
      setBatchSaveError(`${succeeded.size} saved. ${failures.join(' ')}`);
    } else {
      setIsQueueReviewOpen(false);
      setLastSaved({
        count: succeeded.size,
        description: `${succeeded.size} ${succeeded.size === 1 ? 'student' : 'students'} reviewed and saved`,
        testName: selectedTest?.name ?? 'test',
      });
    }
    saveLock.current = false;
    setIsSaving(false);
  };

  const abandonResearchCapture = (outcome: 'RETAKE' | 'CANCELLED') => {
    recordResearchOutcome(researchCaptureId, outcome);
    setResearchCaptureId(null);
    researchStartedAt.current = null;
  };

  if (!permission) return <View style={s.container} />;
  if (!permission.granted) return (
    <SafeAreaView style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{ color: T.white }}>No access to camera</Text>
      <TouchableOpacity onPress={requestPermission} style={{ marginTop: 20 }} accessibilityRole="button" accessibilityLabel="Grant camera permission">
         <Text style={{ color: T.blue }}>Grant Permission</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={closeScanner} style={{ marginTop: 20 }} accessibilityRole="button" accessibilityLabel="Go back">
         <Text style={{ color: T.textMuted }}>Go Back</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );

  return (
    <View style={s.container}>
      <CameraView 
        key={`${selectedLens ?? 'automatic'}-${cameraVersion}`}
        ref={cameraRef}
        autofocus="off"
        selectedLens={selectedLens}
        onAvailableLensesChanged={({ lenses: available }) => setLenses(available)}
        style={StyleSheet.absoluteFill}
        facing="back"
        onCameraReady={() => setCameraReady(true)}
        onMountError={() => { setCameraReady(false); Alert.alert('Camera unavailable', 'Close the scanner and try again.'); }}
      />

      <SafeAreaView edges={['top', 'bottom']} style={s.overlay}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={closeScanner} accessibilityRole="button" accessibilityLabel="Close marks scanner">
            <ChevronLeft size={28} color={T.white} />
          </TouchableOpacity>
          <View style={s.titleWrap}>
            <Text style={s.title}>Scan Marks</Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 16, zIndex: 100 }}>
          <TouchableOpacity 
            style={s.testDropdownBtn}
            disabled={processing || !!student || !!lastSaved || queuedMarks.length > 0 || testsQuery.isLoading}
            onPress={() => setIsTestDropdownOpen(!isTestDropdownOpen)}
            accessibilityRole="button"
            accessibilityLabel={selectedTest ? `Selected test ${selectedTest.name}. Change test.` : 'Select a test before scanning'}
            accessibilityState={{ disabled: processing || !!student || !!lastSaved || queuedMarks.length > 0 || testsQuery.isLoading, expanded: isTestDropdownOpen }}
          >
            <Text style={[s.testDropdownText, !selectedTest && { color: T.textMuted }]}>
              {selectedTest ? `${selectedTest.name} · ${selectedTest.maxMarks} marks` : testsQuery.isLoading ? 'Loading tests…' : 'Select a test first'}
            </Text>
            <ChevronDown size={20} color={T.white} />
          </TouchableOpacity>

          {isTestDropdownOpen && (
            <View style={s.testDropdownList}>
              <ScrollView style={{ maxHeight: 200 }}>
                {testsQuery.isError ? (
                  <TouchableOpacity style={s.testDropdownItem} onPress={() => void testsQuery.refetch()} accessibilityRole="button">
                    <Text style={s.testDropdownItemText}>Tests could not load · Tap to retry</Text>
                  </TouchableOpacity>
                ) : null}
                {!testsQuery.isLoading && !testsQuery.isError && tests.length === 0 ? (
                  <View style={s.testDropdownItem}><Text style={s.testDropdownItemText}>Create a test before scanning marks.</Text></View>
                ) : null}
                {tests.map(t => (
                  <TouchableOpacity 
                    key={t.id} 
                    style={s.testDropdownItem}
                    onPress={() => {
                      setSelectedTestId(t.id);
                      setIsTestDropdownOpen(false);
                      setLastSaved(null);
                    }}
                  >
                    <Text style={[s.testDropdownItemText, selectedTestId === t.id && { color: T.emerald }]}>{t.name} - {t.subject}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <View accessibilityRole="tablist" style={s.modeSelector}>
            {(['single', 'multi'] as const).map(mode => {
              const selected = scanMode === mode;
              return (
                <PressableScale
                  key={mode}
                  accessibilityRole="tab"
                  accessibilityLabel={mode === 'single' ? 'Single scan mode' : 'Multi scan mode'}
                  accessibilityState={{ selected, disabled: processing || !!student || queuedMarks.length > 0 || !!lastSaved }}
                  disabled={processing || !!student || queuedMarks.length > 0 || !!lastSaved}
                  haptic="selection"
                  onPress={() => setScanMode(mode)}
                  style={[s.modeOption, selected && s.modeOptionSelected]}
                >
                  {mode === 'multi' ? <Layers3 size={16} color={selected ? T.text : T.white} /> : null}
                  <Text style={[s.modeLabel, selected && s.modeLabelSelected]}>{mode === 'single' ? 'Single' : 'Multi'}</Text>
                </PressableScale>
              );
            })}
          </View>
        </View>

        <StickerCameraControls lenses={lenses} selectedLens={selectedLens} disabled={processing || !!student}
          onSelect={lens => { if (lens !== selectedLens) { setCameraReady(false); setSelectedLens(lens); } }}
          onRestart={() => { setCameraReady(false); setCameraVersion(version => version + 1); }} />
        <View style={s.targetArea}>
           <View style={s.targetBox}>
              <View style={[s.corner, s.topLeft]} />
              <View style={[s.corner, s.topRight]} />
              <View style={[s.corner, s.bottomLeft]} />
              <View style={[s.corner, s.bottomRight]} />
           </View>
           <Text style={s.targetText}>
             {selectedTest ? 'Keep one whole sticker visible, then tap Capture.' : 'Select a test to start scanning'}
           </Text>
        </View>
        <View style={s.captureControls}>
          {scanMode === 'multi' && queuedMarks.length > 0 ? (
            <PressableScale
              accessibilityLabel={`Review ${queuedMarks.length} queued marks`}
              onPress={() => setIsQueueReviewOpen(true)}
              style={s.reviewQueueButton}
            >
              <Layers3 size={19} color={T.white} />
              <Text style={s.reviewQueueText}>Review {queuedMarks.length}</Text>
            </PressableScale>
          ) : null}
          <PressableScale onPress={handleCapture} disabled={!cameraReady || processing || !!student || !!lastSaved || !selectedTestId || isTestDropdownOpen}
            accessibilityLabel="Capture sticker" accessibilityState={{ disabled: !cameraReady || processing || !!student || !!lastSaved || !selectedTestId || isTestDropdownOpen, busy: processing }}
            style={[s.captureButton, (!cameraReady || processing || !!student || !!lastSaved || !selectedTestId || isTestDropdownOpen) && { opacity: 0.5 }]}>
            <Text style={s.captureText}>{processing ? 'Reading captured marks…' : scanMode === 'multi' && queuedMarks.length > 0 ? 'Capture next sticker' : 'Capture'}</Text>
          </PressableScale>
        </View>
      </SafeAreaView>

      {student && selectedTest && (
        <Animated.View entering={reduceMotion ? undefined : SlideInDown.duration(200)} style={s.modalContainer}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.modalContent}>
              <View style={s.modalHeader}>
                <Text style={s.modalTitle}>Enter Marks</Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retake sticker photo" style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }} disabled={isSaving} onPress={() => { abandonResearchCapture('RETAKE'); captureRequest.current?.abort(); setStudent(null); setScore(''); setExistingMark(null); setProcessing(false); }}>
                  <X size={24} color={T.textSec} />
                </TouchableOpacity>
              </View>

              <View style={s.stInfo}>
                 <Text style={s.stName}>{student.name}</Text>
                 <Text style={s.stBatch}>{student.batch?.name || 'N/A'}</Text>
              </View>

              {existingMark !== null && (
                <View style={s.warnBox}>
                   <Text style={s.warnText}>A mark already exists: {existingMark}. Saving will update it.</Text>
                </View>
              )}

              <Text accessibilityRole="text" style={{ color: Colors.light.textSecondary, textAlign: 'center', marginBottom: 16 }}>
                {processing && readStatus === null ? 'Reading marks… You can enter them now.' : ocrError || (readStatus === 'read' ? 'Read successfully. Confirm the marks before saving.' : 'Needs review. Enter the marks or retake the photo.')}
              </Text>
              <View style={s.inputWrap}>
                <TextInput style={s.scoreInput} placeholder="0" placeholderTextColor={T.textMuted}
                  keyboardType="decimal-pad"  value={score} editable={!isSaving} onChangeText={value => { captureRequest.current?.abort(); setProcessing(false); setReadStatus(null); setOcrError(''); setScore(value.replace(/[^0-9.]/g, '')); }} accessibilityLabel="Obtained marks" />
                <Text style={s.maxMarksText}>/ {selectedTest.maxMarks}</Text>
              </View>

              <TouchableOpacity 
                style={[s.saveBtn, (processing || isSaving) && { opacity: 0.5 }]}
                onPress={scanMode === 'multi' ? addCurrentMarkToQueue : handleSave}
                disabled={processing || isSaving || !score}
                accessibilityRole="button"
                accessibilityLabel={scanMode === 'multi' ? 'Add reviewed mark to batch' : 'Save mark'}
              >
                <Text style={s.saveBtnText}>{isSaving ? 'Saving…' : processing ? 'Reading marks…' : scanMode === 'multi' ? `Add to batch${queuedMarks.length ? ` · ${queuedMarks.length + 1}` : ''}` : 'Save Marks'}</Text>
                {!processing && !isSaving && <Check size={20} color={T.white} />}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      )}

      {isQueueReviewOpen && !student && selectedTest ? (
        <Animated.View entering={reduceMotion ? undefined : SlideInDown.duration(200)} style={s.modalContainer}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.queueSheet}>
              <View style={s.modalHeader}>
                <View>
                  <Text accessibilityRole="header" style={s.modalTitle}>Review batch</Text>
                  <Text style={s.queueSubtitle}>{queuedMarks.length} {queuedMarks.length === 1 ? 'student' : 'students'} · {selectedTest.name}</Text>
                </View>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Close batch review"
                  style={s.iconButton}
                  disabled={isSaving}
                  onPress={() => setIsQueueReviewOpen(false)}
                >
                  <X size={24} color={T.textSec} />
                </TouchableOpacity>
              </View>

              <ScrollView style={s.queueList} contentContainerStyle={s.queueListContent} keyboardShouldPersistTaps="handled">
                {queuedMarks.map((item, index) => {
                  const validation = validateMark(item.score, selectedTest.maxMarks);
                  return (
                    <View key={item.studentId} style={s.queueRow}>
                      <View style={s.queueIndex}><Text style={s.queueIndexText}>{index + 1}</Text></View>
                      <View style={s.queueIdentity}>
                        <Text numberOfLines={1} style={s.queueName}>{item.studentName}</Text>
                        <Text numberOfLines={1} style={s.queueMeta}>
                          {item.humanId || item.batchName}{item.existingMark !== null ? ` · Updates ${item.existingMark}` : ''}
                        </Text>
                        {!validation.ok ? <Text style={s.queueError}>{validation.message}</Text> : null}
                      </View>
                      <View style={s.queueScoreWrap}>
                        <TextInput
                          accessibilityLabel={`Marks for ${item.studentName}`}
                          editable={!isSaving}
                          keyboardType="decimal-pad"
                          onChangeText={value => updateQueuedScore(item.studentId, value)}
                          style={[s.queueScore, !validation.ok && s.queueScoreInvalid]}
                          value={item.score}
                        />
                        <Text style={s.queueMax}>/{selectedTest.maxMarks}</Text>
                      </View>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item.studentName} from batch`}
                        disabled={isSaving}
                        onPress={() => removeQueuedMark(item.studentId)}
                        style={s.removeButton}
                      >
                        <Trash2 size={20} color={T.red} />
                      </TouchableOpacity>
                    </View>
                  );
                })}
                {queuedMarks.length === 0 ? (
                  <View style={s.emptyQueue}>
                    <Text style={s.emptyQueueTitle}>No marks in this batch</Text>
                    <Text style={s.emptyQueueText}>Close this review and capture a sticker.</Text>
                  </View>
                ) : null}
              </ScrollView>

              {batchSaveError ? <Text accessibilityRole="alert" style={s.batchSaveError}>{batchSaveError}</Text> : null}
              <View style={s.queueActions}>
                <PressableScale
                  accessibilityLabel="Scan another sticker"
                  disabled={isSaving}
                  onPress={() => setIsQueueReviewOpen(false)}
                  style={s.scanMoreButton}
                >
                  <Text style={s.scanMoreText}>Scan more</Text>
                </PressableScale>
                <PressableScale
                  accessibilityLabel={`Save ${queuedMarks.length} reviewed marks`}
                  accessibilityState={{ disabled: isSaving || queuedMarks.length === 0, busy: isSaving }}
                  disabled={isSaving || queuedMarks.length === 0}
                  onPress={saveQueuedMarks}
                  style={[s.saveBatchButton, (isSaving || queuedMarks.length === 0) && { opacity: 0.5 }]}
                >
                  <Text style={s.saveBatchText}>{isSaving ? 'Saving batch…' : `Save ${queuedMarks.length} marks`}</Text>
                </PressableScale>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Animated.View>
      ) : null}

      {lastSaved && !student ? (
        <Animated.View entering={reduceMotion ? undefined : SlideInDown.duration(200)} style={s.modalContainer}>
          <View style={s.successSheet}>
            <View style={s.successIcon}><CheckCircle2 size={34} color={T.emerald} /></View>
            <Text accessibilityRole="header" style={s.successTitle}>{lastSaved.count === 1 ? 'Mark saved' : `${lastSaved.count} marks saved`}</Text>
            <Text style={s.successText}>{lastSaved.description} · {lastSaved.testName}</Text>
            <View style={s.successActions}>
              <PressableScale
                accessibilityLabel="Finish scanning marks"
                onPress={() => router.back()}
                style={s.doneButton}
              >
                <Text style={s.doneButtonText}>Done</Text>
              </PressableScale>
              <PressableScale
                accessibilityLabel={scanMode === 'multi' ? 'Scan another batch' : 'Scan the next student'}
                haptic="selection"
                onPress={() => setLastSaved(null)}
                style={s.nextButton}
              >
                <Text style={s.nextButtonText}>{scanMode === 'multi' ? 'Scan another batch' : 'Scan next'}</Text>
              </PressableScale>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  captureControls: { paddingHorizontal: 24, paddingBottom: 16, gap: 10 },
  captureButton: { backgroundColor: Colors.light.surfaceElevated, borderRadius: 16, minHeight: 56, alignItems: 'center', justifyContent: 'center', padding: 16 },
  captureText: { color: Colors.light.text, fontSize: 18, fontWeight: '600' },
  reviewQueueButton: { minHeight: 48, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)' },
  reviewQueueText: { color: T.white, fontSize: 15, fontWeight: '700' },
  container: { flex: 1, backgroundColor: T.bg },
  overlay: { flex: 1, justifyContent: 'space-between', backgroundColor: 'transparent' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 56 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 22 },
  titleWrap: { flex: 1, alignItems: 'center', marginRight: 44 },
  title: { color: T.white, fontSize: 18, fontWeight: '700' },
  
  testDropdownBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  testDropdownText: { color: T.white, fontSize: 16, fontWeight: '600' },
  testDropdownList: { position: 'absolute', top: 60, left: 16, right: 16, backgroundColor: T.white, borderRadius: 12, paddingVertical: 8, maxHeight: 200 },
  testDropdownItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border },
  testDropdownItemText: { fontSize: 15, fontWeight: '600', color: T.text },
  modeSelector: { marginTop: 10, flexDirection: 'row', padding: 4, gap: 4, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  modeOption: { flex: 1, minHeight: 42, borderRadius: 10, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center' },
  modeOptionSelected: { backgroundColor: T.white },
  modeLabel: { color: T.white, fontSize: 14, fontWeight: '700' },
  modeLabelSelected: { color: T.text },

  targetArea: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 24 },
  targetBox: { width: '85%', maxWidth: 420, aspectRatio: 39 / 21, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 24, position: 'relative' },
  corner: { position: 'absolute', width: 32, height: 32, borderColor: T.white },
  topLeft: { top: -2, left: -2, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 24 },
  topRight: { top: -2, right: -2, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 24 },
  bottomLeft: { bottom: -2, left: -2, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 24 },
  bottomRight: { bottom: -2, right: -2, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 24 },
  targetText: { color: T.white, marginTop: 40, fontSize: 14, fontWeight: '500', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, overflow: 'hidden' },

  modalContainer: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: T.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: T.text },
  
  stInfo: { backgroundColor: '#F5F5F7', padding: 16, borderRadius: 16, marginBottom: 16 },
  stName: { fontSize: 18, fontWeight: '700', color: T.text, marginBottom: 4 },
  stBatch: { fontSize: 13, color: T.textSec, fontWeight: '600' },
  
  warnBox: { backgroundColor: '#FEF2F2', padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' },
  warnText: { color: T.red, fontWeight: '600', textAlign: 'center', fontSize: 14 },

  inputWrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 24, gap: 12 },
  scoreInput: { fontSize: 56, fontWeight: '900', color: T.text, textAlign: 'center', minWidth: 100 },
  maxMarksText: { fontSize: 24, color: T.textMuted, fontWeight: '700', marginTop: 16 },

  saveBtn: { backgroundColor: T.emerald, height: 60, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: T.emerald, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 4 },
  saveBtnText: { color: T.white, fontSize: 18, fontWeight: '700' },
  successSheet: { backgroundColor: T.white, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, alignItems: 'center' },
  successIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(16,185,129,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successTitle: { color: T.text, fontSize: 22, fontWeight: '800' },
  successText: { color: T.textSec, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8 },
  successActions: { width: '100%', flexDirection: 'row', gap: 12, marginTop: 24 },
  doneButton: { flex: 1, minHeight: 52, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  doneButtonText: { color: T.text, fontSize: 15, fontWeight: '700' },
  nextButton: { flex: 1.4, minHeight: 52, borderRadius: 16, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' },
  nextButtonText: { color: T.white, fontSize: 15, fontWeight: '700' },

  queueSheet: { backgroundColor: T.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 22, paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 22, maxHeight: '88%' },
  queueSubtitle: { color: T.textSec, fontSize: 13, lineHeight: 19, marginTop: 3 },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  queueList: { maxHeight: 420 },
  queueListContent: { gap: 10, paddingBottom: 8 },
  queueRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, padding: 10, backgroundColor: '#FAFAFA' },
  queueIndex: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
  queueIndexText: { color: T.text, fontSize: 12, fontWeight: '800' },
  queueIdentity: { flex: 1, minWidth: 0 },
  queueName: { color: T.text, fontSize: 15, fontWeight: '700' },
  queueMeta: { color: T.textSec, fontSize: 11, lineHeight: 16, marginTop: 2 },
  queueError: { color: T.red, fontSize: 11, lineHeight: 15, marginTop: 2 },
  queueScoreWrap: { alignItems: 'center' },
  queueScore: { width: 58, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: T.white, color: T.text, textAlign: 'center', fontSize: 17, fontWeight: '800', paddingHorizontal: 6 },
  queueScoreInvalid: { borderColor: T.red, backgroundColor: '#FEF2F2' },
  queueMax: { color: T.textMuted, fontSize: 10, marginTop: 2 },
  removeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  emptyQueue: { paddingVertical: 36, alignItems: 'center' },
  emptyQueueTitle: { color: T.text, fontSize: 16, fontWeight: '700' },
  emptyQueueText: { color: T.textSec, fontSize: 13, marginTop: 5 },
  batchSaveError: { color: T.red, backgroundColor: '#FEF2F2', borderRadius: 12, padding: 10, fontSize: 12, lineHeight: 17, marginTop: 10 },
  queueActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  scanMoreButton: { flex: 1, minHeight: 54, borderRadius: 15, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  scanMoreText: { color: T.text, fontSize: 15, fontWeight: '700' },
  saveBatchButton: { flex: 1.5, minHeight: 54, borderRadius: 15, backgroundColor: T.emerald, alignItems: 'center', justifyContent: 'center' },
  saveBatchText: { color: T.white, fontSize: 15, fontWeight: '800' },


});
