import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Modal, Platform,
  RefreshControl, TextInput, useColorScheme
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Lock, Trash2, CheckCircle,
  Monitor, BarChart3, Users, Clock, CalendarDays, Eye, MoreVertical, FileText, Download
} from 'lucide-react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import api from '../../services/api';
import { offlineQuery } from '../../services/offlineSync';

import QuizLiveMonitor from '../../components/quiz/QuizLiveMonitor';
import QuizAnalytics from '../../components/quiz/QuizAnalytics';
import QuizSubmissionInspector, { InspectorData } from '../../components/quiz/QuizSubmissionInspector';
import { PressableScale, Surface, TEACHER_TAB_CONTENT_INSET } from '../../components/ui';
import { BorderRadius, Colors, Spacing, TypeScale } from '../../constants/theme';

export default function QuizDashboardScreen() {
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const T = useMemo(() => ({
    bg: colors.background,
    white: colors.heroText,
    text: colors.text,
    textSec: colors.textSecondary,
    textMuted: colors.textMuted,
    accent: colors.hero,
    emerald: colors.positive,
    amber: colors.attention,
    red: Colors.error,
    border: colors.border,
    shadow: colors.shadow,
    surface: colors.surface,
    surfaceSecondary: colors.surfaceSecondary,
  }), [colors]);
  const s = useMemo(() => makeStyles(T), [T]);
  const { id } = useLocalSearchParams();
  const [activeTab, setActiveTab] = useState<'monitor' | 'analytics' | 'submissions'>('monitor');
  const [finalizing, setFinalizing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Modals state
  const [showOptions, setShowOptions] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [rescheduleFrom, setRescheduleFrom] = useState('');
  const [rescheduleUntil, setRescheduleUntil] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [inspectorData, setInspectorData] = useState<InspectorData | null>(null);

  const { data: quizzes, isLoading, refetch, isRefetching } = useQuery<any[]>({
    queryKey: ['quizzes'],
    queryFn: () => offlineQuery('online-quizzes', async () => (await api.get('/tests/online')).data),
  });

  const quiz = quizzes?.find(q => q.id === id);

  if (isLoading || !quiz) {
    return (
      <SafeAreaView style={s.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={s.header}>
          <PressableScale style={s.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to quizzes">
            <ArrowLeft size={20} color={T.text} />
          </PressableScale>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={T.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const enrolledStudents = quiz.batch?.students || [];
  const submissions = quiz.submissions || [];
  const completedCount = submissions.filter((s: any) => s.submittedAt !== null).length;
  const activeCount = submissions.filter((s: any) => s.startedAt !== null && s.submittedAt === null).length;
  const unattemptedCount = Math.max(0, enrolledStudents.length - (completedCount + activeCount));
  
  const hasSubmissions = submissions.length > 0;
  
  const isEditDeleteLocked = () => {
    if (!quiz.availableFrom) return false;
    const now = new Date();
    const startTime = new Date(quiz.availableFrom);
    return (startTime.getTime() - now.getTime()) <= 10 * 60 * 1000;
  };
  const locked = isEditDeleteLocked();

  const handleFinalize = async () => {
    if (quiz.isFinalized) return;
    Alert.alert(
      'Finalize Quiz Marks',
      'This will lock late attempts and broadcast marks via WhatsApp. This action is permanent.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Finalize & Broadcast', 
          style: 'destructive',
          onPress: async () => {
            setFinalizing(true);
            try {
              await api.post(`/tests/online/${quiz.id}/finalize`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              refetch();
            } catch (error: any) {
              Alert.alert('Error', error?.response?.data?.error || 'Failed to finalize quiz');
            } finally {
              setFinalizing(false);
            }
          }
        }
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Quiz',
      `This will permanently delete "${quiz.title}" and all its questions.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await api.delete(`/tests/online/${quiz.id}`);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              router.back();
            } catch (error: any) {
              Alert.alert('Error', error?.response?.data?.error || 'Failed to delete quiz');
              setDeleting(false);
            }
          }
        }
      ]
    );
  };

  const handleRescheduleSubmit = async () => {
    if (!rescheduleFrom || !rescheduleUntil) {
        Alert.alert('Error', 'Please fill in both dates');
        return;
    }
    setRescheduling(true);
    try {
        await api.patch(`/tests/online/${quiz.id}`, {
            availableFrom: new Date(rescheduleFrom).toISOString(),
            availableUntil: new Date(rescheduleUntil).toISOString()
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowReschedule(false);
        refetch();
    } catch (err: any) {
        Alert.alert('Error', err?.response?.data?.error || 'Failed to reschedule');
    } finally {
        setRescheduling(false);
    }
  };

  const downloadPDF = async (type: 'pdf' | 'results' | 'integrity') => {
    setShowOptions(false);
    try {
        const fileUri = `${FileSystem.Paths.document.uri}${quiz.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${type}.pdf`;
        
        // Setup API url
        const url = `${api.defaults.baseURL}/tests/online/${quiz.id}/${type === 'pdf' ? 'pdf' : type === 'results' ? 'report' : 'integrity/report'}`;
        
        // We cannot easily use api.get for binary files in RN with axios directly unless responseType=blob works well with Expo FileSystem.
        // It's safer to use expo-file-system downloadAsync
        const token = api.defaults.headers.common['Authorization'];
        
        const { uri, status } = await FileSystem.downloadAsync(url, fileUri, {
            headers: {
                Authorization: typeof token === 'string' ? token : '',
            }
        });

        if (status !== 200) {
            throw new Error('Download failed from server');
        }

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
            await Sharing.shareAsync(uri);
        } else {
            Alert.alert('Success', `File downloaded to: ${uri}`);
        }
    } catch (error: any) {
        Alert.alert('Download Error', error.message || 'Failed to download file');
    }
  };

  const openReschedule = () => {
      setShowOptions(false);
      setRescheduleFrom(quiz.availableFrom ? new Date(quiz.availableFrom).toISOString().slice(0, 16) : '');
      setRescheduleUntil(quiz.availableUntil ? new Date(quiz.availableUntil).toISOString().slice(0, 16) : '');
      setShowReschedule(true);
  };

  return (
    <SafeAreaView style={s.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={s.header}>
        <PressableScale style={s.backBtn} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back to quizzes">
          <ArrowLeft size={20} color={T.text} />
        </PressableScale>
        <View style={s.headerTitleWrap}>
          <Text style={s.headerEyebrow}>{quiz.isFinalized ? 'FINALIZED QUIZ' : 'LIVE QUIZ'}</Text>
          <Text style={s.headerTitle} numberOfLines={1}>{quiz.title}</Text>
        </View>
        <PressableScale style={s.headerIconBtn} onPress={() => setShowOptions(true)} accessibilityRole="button" accessibilityLabel="Quiz options">
          <MoreVertical size={20} color={T.text} />
        </PressableScale>
      </View>

      <ScrollView 
        contentContainerStyle={s.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { void refetch(); }} tintColor={T.accent} />}
      >
        <Surface style={s.titleSection} tone="strong">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <View style={[s.badge, quiz.isFinalized ? s.badgeFinal : s.badgeLive]}>
              <Text style={[s.badgeText, quiz.isFinalized ? s.badgeTextFinal : s.badgeTextLive]}>
                {quiz.isFinalized ? 'FINALIZED' : 'ONLINE WORKSPACE'}
              </Text>
            </View>
          </View>
          
          <Text style={s.title}>{quiz.title}</Text>
          <View style={s.metaRow}>
            <Text style={s.metaText}>Batch: {quiz.batch?.name || 'General'}</Text>
            {quiz.topic && <Text style={s.metaText}>• {quiz.topic}</Text>}
            {quiz.difficulty && <Text style={s.metaText}>• {quiz.difficulty}</Text>}
          </View>
        </Surface>

        <View style={s.statsGrid}>
          <Surface style={s.statBox}>
            <Text style={s.statLabel}>QUESTIONS</Text>
            <Text style={s.statVal}>{quiz.studentQuestionCount || 0}</Text>
          </Surface>
          <Surface style={s.statBox}>
            <Text style={s.statLabel}>WEIGHTING</Text>
            <Text style={s.statVal}>{quiz.totalMarks}</Text>
          </Surface>
          <Surface style={s.statBox}>
            <Text style={s.statLabel}>LIMIT</Text>
            <Text style={s.statVal}>{quiz.timeLimitMins}m</Text>
          </Surface>
          <Surface style={s.statBox}>
            <Text style={s.statLabel}>STARTS</Text>
            <Text style={[s.statVal, { fontSize: 13, lineHeight: 18 }]} numberOfLines={2}>
              {quiz.availableFrom ? new Date(quiz.availableFrom).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Instant'}
            </Text>
          </Surface>
        </View>

        <PressableScale
          style={[s.finalizeBtn, quiz.isFinalized && s.finalizeBtnDisabled]} 
          onPress={handleFinalize}
          disabled={quiz.isFinalized || finalizing}
          haptic="commit"
          accessibilityLabel={quiz.isFinalized ? 'Quiz marks finalized' : 'Finalize quiz marks'}
        >
          {finalizing ? (
            <ActivityIndicator color={T.white} />
          ) : (
            <>
              {quiz.isFinalized ? <CheckCircle size={18} color={T.white} /> : <Lock size={18} color={T.emerald} />}
              <Text style={s.finalizeBtnText}>{quiz.isFinalized ? 'Marks Finalized' : 'Finalize Quiz Marks'}</Text>
            </>
          )}
        </PressableScale>

        <View style={s.tabsRow}>
          <PressableScale
            style={[s.tab, activeTab === 'monitor' && s.tabActive]} 
            onPress={() => { setActiveTab('monitor'); Haptics.selectionAsync(); }}
          >
            <Monitor size={16} color={activeTab === 'monitor' ? T.emerald : T.textSec} />
            <Text style={[s.tabText, activeTab === 'monitor' && s.tabTextActive]}>Monitor</Text>
            {!quiz.isFinalized && <View style={s.liveDot} />}
          </PressableScale>
          <PressableScale
            style={[s.tab, activeTab === 'analytics' && s.tabActive]} 
            onPress={() => { setActiveTab('analytics'); Haptics.selectionAsync(); }}
          >
            <BarChart3 size={16} color={activeTab === 'analytics' ? T.emerald : T.textSec} />
            <Text style={[s.tabText, activeTab === 'analytics' && s.tabTextActive]}>Analytics</Text>
          </PressableScale>
          <PressableScale
            style={[s.tab, activeTab === 'submissions' && s.tabActive]} 
            onPress={() => { setActiveTab('submissions'); Haptics.selectionAsync(); }}
          >
            <Users size={16} color={activeTab === 'submissions' ? T.emerald : T.textSec} />
            <Text style={[s.tabText, activeTab === 'submissions' && s.tabTextActive]}>Students</Text>
            <View style={s.badgeCount}>
              <Text style={s.badgeCountText}>{submissions.length}</Text>
            </View>
          </PressableScale>
        </View>

        <View style={s.tabContent}>
          {activeTab === 'monitor' && <QuizLiveMonitor quizId={quiz.id} />}
          {activeTab === 'analytics' && <QuizAnalytics quizId={quiz.id} />}
          {activeTab === 'submissions' && (
            <View style={s.studentsList}>
              {enrolledStudents.map((student: any) => {
                const sub = submissions.find((s: any) => s.studentId === student.id);
                const isCompleted = !!sub?.submittedAt;
                const isActive = !!sub?.startedAt && !sub?.submittedAt;
                
                let stLabel = 'Not Started';
                let stColor: string = T.textMuted;
                if (isCompleted) { stLabel = 'Completed'; stColor = T.emerald; }
                else if (isActive) { stLabel = 'Active'; stColor = T.amber; }

                return (
                  <View key={student.id} style={s.studentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.studentName}>{student.name}</Text>
                      <Text style={[s.studentStatus, { color: stColor }]}>{stLabel}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={s.scoreWrap}>
                        <Text style={s.scoreText}>
                            {isCompleted ? `${sub.score}/${quiz.totalMarks}` : '-'}
                        </Text>
                        </View>
                        <TouchableOpacity 
                            style={s.inspectBtn}
                            disabled={!sub}
                            onPress={() => setInspectorData({
                                studentName: student.name,
                                studentId: student.id,
                                humanId: student.humanId,
                                submission: sub || null
                            })}
                        >
                            <Eye size={18} color={sub ? T.textSec : T.border} />
                        </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Inspector Modal */}
      <QuizSubmissionInspector 
        visible={!!inspectorData} 
        onClose={() => setInspectorData(null)} 
        data={inspectorData} 
        quiz={quiz} 
      />

      {/* Options Action Sheet Modal */}
      <Modal visible={showOptions} transparent animationType="fade" onRequestClose={() => setShowOptions(false)}>
          <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowOptions(false)}>
              <View style={s.actionSheet}>
                  <View style={s.actionSheetHeader}>
                      <Text style={s.actionSheetTitle}>Quiz Options</Text>
                  </View>
                  
                  <TouchableOpacity style={s.actionBtn} onPress={() => downloadPDF('pdf')}>
                      <FileText size={20} color={T.text} />
                      <Text style={s.actionBtnText}>Download Questions PDF</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={s.actionBtn} onPress={() => downloadPDF('results')}>
                      <Download size={20} color={T.text} />
                      <Text style={s.actionBtnText}>Download Result PDF</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={s.actionBtn} onPress={openReschedule}>
                      <CalendarDays size={20} color={T.text} />
                      <Text style={s.actionBtnText}>Reschedule Quiz</Text>
                  </TouchableOpacity>

                  {!quiz.isFinalized && !(locked || hasSubmissions) && (
                      <TouchableOpacity style={[s.actionBtn, { borderTopWidth: 1, borderTopColor: T.border }]} onPress={() => { setShowOptions(false); handleDelete(); }}>
                          <Trash2 size={20} color={T.red} />
                          <Text style={[s.actionBtnText, { color: T.red }]}>Delete Quiz</Text>
                      </TouchableOpacity>
                  )}
              </View>
          </TouchableOpacity>
      </Modal>

      {/* Reschedule Modal */}
      <Modal visible={showReschedule} transparent animationType="fade" onRequestClose={() => setShowReschedule(false)}>
          <View style={s.modalOverlay}>
              <View style={s.rescheduleModal}>
                  <Text style={s.rescheduleTitle}>Reschedule Quiz</Text>
                  <Text style={s.rescheduleSub}>Update the availability window. ISO format (YYYY-MM-DDTHH:mm)</Text>
                  
                  <Text style={s.inputLabel}>Available From</Text>
                  <TextInput
                      style={s.input}
                      value={rescheduleFrom}
                      onChangeText={setRescheduleFrom}
                      placeholder="YYYY-MM-DDTHH:mm"
                  />
                  
                  <Text style={s.inputLabel}>Available Until</Text>
                  <TextInput
                      style={s.input}
                      value={rescheduleUntil}
                      onChangeText={setRescheduleUntil}
                      placeholder="YYYY-MM-DDTHH:mm"
                  />

                  <View style={s.rescheduleBtns}>
                      <TouchableOpacity style={s.rescheduleCancelBtn} onPress={() => setShowReschedule(false)}>
                          <Text style={s.rescheduleCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.rescheduleSubmitBtn} onPress={handleRescheduleSubmit} disabled={rescheduling}>
                          {rescheduling ? <ActivityIndicator color={T.white} /> : <Text style={s.rescheduleSubmitText}>Save Changes</Text>}
                      </TouchableOpacity>
                  </View>
              </View>
          </View>
      </Modal>
    </SafeAreaView>
  );
}

const makeStyles = (T: {
  bg: string; white: string; text: string; textSec: string; textMuted: string;
  accent: string; emerald: string; amber: string; red: string; border: string;
  shadow: string; surface: string; surfaceSecondary: string;
}) => StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
  },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
  headerIconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
  headerTitleWrap: { flex: 1, paddingHorizontal: Spacing.md, alignItems: 'center' },
  headerEyebrow: { fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 1, color: T.textMuted },
  headerTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: T.text, maxWidth: '100%' },
  
  content: { padding: Spacing.xl, paddingBottom: TEACHER_TAB_CONTENT_INSET, gap: Spacing.lg },
  titleSection: { padding: Spacing.xl, marginBottom: 0, backgroundColor: T.accent, borderColor: 'transparent' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  badgeLive: { backgroundColor: `${T.emerald}10`, borderColor: `${T.emerald}30` },
  badgeFinal: { backgroundColor: T.border, borderColor: T.textMuted },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  badgeTextLive: { color: T.emerald },
  badgeTextFinal: { color: T.textSec },
  
  title: { ...TypeScale.pageTitle, color: T.white, marginBottom: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaText: { fontSize: 13, color: T.white, opacity: 0.72, fontWeight: '600' },
  
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 0 },
  statBox: { 
    flex: 1, minWidth: '45%', backgroundColor: T.surface, padding: 16,
    borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: T.border,
    ...Platform.select({ ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 }, android: { elevation: 2 } })
  },
  statLabel: { fontSize: 10, fontWeight: '800', color: T.textMuted, letterSpacing: 1, marginBottom: 4 },
  statVal: { fontSize: 20, fontWeight: '800', color: T.text },

  finalizeBtn: {
    backgroundColor: T.accent, height: 56, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 0, shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1, shadowRadius: 12, elevation: 4,
  },
  finalizeBtnDisabled: { opacity: 0.6 },
  finalizeBtnText: { color: T.white, fontSize: 16, fontWeight: '700' },
  
  tabsRow: { flexDirection: 'row', padding: 4, borderRadius: BorderRadius.lg, backgroundColor: T.surfaceSecondary, marginBottom: 0 },
  tab: { flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6, borderRadius: BorderRadius.md },
  tabActive: { backgroundColor: T.surface },
  tabText: { fontSize: 14, fontWeight: '600', color: T.textSec },
  tabTextActive: { color: T.emerald },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.emerald },
  badgeCount: { backgroundColor: T.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  badgeCountText: { fontSize: 10, fontWeight: '800', color: T.textSec },
  
  tabContent: { flex: 1, minHeight: 400 },

  studentsList: { backgroundColor: T.surface, borderRadius: 16, borderWidth: 1, borderColor: T.border, overflow: 'hidden' },
  studentRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: T.border },
  studentName: { fontSize: 15, fontWeight: '600', color: T.text, marginBottom: 4 },
  studentStatus: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  scoreWrap: { backgroundColor: T.bg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  scoreText: { fontSize: 16, fontWeight: '800', color: T.text },
  inspectBtn: { padding: 8, backgroundColor: T.bg, borderRadius: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'flex-end' },
  actionSheet: { backgroundColor: T.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, paddingHorizontal: 20 },
  actionSheetHeader: { paddingVertical: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: T.border },
  actionSheetTitle: { fontSize: 16, fontWeight: '800', color: T.text },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 16 },
  actionBtnText: { fontSize: 16, fontWeight: '600', color: T.text },

  rescheduleModal: { backgroundColor: T.surface, margin: 20, borderRadius: 24, padding: 24, alignSelf: 'center', width: '90%', marginTop: 'auto', marginBottom: 'auto' },
  rescheduleTitle: { fontSize: 18, fontWeight: '800', color: T.text, marginBottom: 4 },
  rescheduleSub: { fontSize: 12, color: T.textSec, marginBottom: 20 },
  inputLabel: { fontSize: 12, fontWeight: '800', color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: T.surfaceSecondary, borderRadius: 12, padding: 16, fontSize: 16, color: T.text, marginBottom: 16, borderWidth: 1, borderColor: T.border },
  rescheduleBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  rescheduleCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: T.surfaceSecondary, alignItems: 'center' },
  rescheduleCancelText: { fontSize: 15, fontWeight: '700', color: T.textSec },
  rescheduleSubmitBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: T.accent, alignItems: 'center' },
  rescheduleSubmitText: { fontSize: 15, fontWeight: '700', color: T.white }
});
