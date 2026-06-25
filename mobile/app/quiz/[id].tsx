import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Modal, Platform,
  RefreshControl, TextInput, SafeAreaView
} from 'react-native';
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

import QuizLiveMonitor from '../../components/quiz/QuizLiveMonitor';
import QuizAnalytics from '../../components/quiz/QuizAnalytics';
import QuizSubmissionInspector, { InspectorData } from '../../components/quiz/QuizSubmissionInspector';

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827',
  emerald: '#10b981', amber: '#f59e0b', red: '#ef4444',
  border: 'rgba(0,0,0,0.06)', shadow: 'rgba(0,0,0,0.06)',
};

export default function QuizDashboardScreen() {
  const router = useRouter();
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
    queryFn: async () => {
      const res = await api.get('/tests/online');
      return res.data;
    },
  });

  const quiz = quizzes?.find(q => q.id === id);

  if (isLoading || !quiz) {
    return (
      <SafeAreaView style={s.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <ArrowLeft size={20} color={T.text} />
          </TouchableOpacity>
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
        const docDir = (FileSystem as any).documentDirectory;
        const fileUri = `${docDir}${quiz.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${type}.pdf`;
        
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
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={T.text} />
        </TouchableOpacity>
        <TouchableOpacity style={s.headerIconBtn} onPress={() => setShowOptions(true)}>
          <MoreVertical size={20} color={T.text} />
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={s.content} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={T.accent} />}
      >
        <View style={s.titleSection}>
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
        </View>

        <View style={s.statsGrid}>
          <View style={s.statBox}>
            <Text style={s.statLabel}>QUESTIONS</Text>
            <Text style={s.statVal}>{quiz.studentQuestionCount || 0}</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statLabel}>WEIGHTING</Text>
            <Text style={s.statVal}>{quiz.totalMarks}</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statLabel}>LIMIT</Text>
            <Text style={s.statVal}>{quiz.timeLimitMins}m</Text>
          </View>
          <View style={s.statBox}>
            <Text style={s.statLabel}>STARTS</Text>
            <Text style={[s.statVal, { fontSize: 13, lineHeight: 18 }]} numberOfLines={2}>
              {quiz.availableFrom ? new Date(quiz.availableFrom).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Instant'}
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[s.finalizeBtn, quiz.isFinalized && s.finalizeBtnDisabled]} 
          onPress={handleFinalize}
          disabled={quiz.isFinalized || finalizing}
        >
          {finalizing ? (
            <ActivityIndicator color={T.white} />
          ) : (
            <>
              {quiz.isFinalized ? <CheckCircle size={18} color={T.white} /> : <Lock size={18} color={T.emerald} />}
              <Text style={s.finalizeBtnText}>{quiz.isFinalized ? 'Marks Finalized' : 'Finalize Quiz Marks'}</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={s.tabsRow}>
          <TouchableOpacity 
            style={[s.tab, activeTab === 'monitor' && s.tabActive]} 
            onPress={() => { setActiveTab('monitor'); Haptics.selectionAsync(); }}
          >
            <Monitor size={16} color={activeTab === 'monitor' ? T.emerald : T.textSec} />
            <Text style={[s.tabText, activeTab === 'monitor' && s.tabTextActive]}>Monitor</Text>
            {!quiz.isFinalized && <View style={s.liveDot} />}
          </TouchableOpacity>
          <TouchableOpacity 
            style={[s.tab, activeTab === 'analytics' && s.tabActive]} 
            onPress={() => { setActiveTab('analytics'); Haptics.selectionAsync(); }}
          >
            <BarChart3 size={16} color={activeTab === 'analytics' ? T.emerald : T.textSec} />
            <Text style={[s.tabText, activeTab === 'analytics' && s.tabTextActive]}>Analytics</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[s.tab, activeTab === 'submissions' && s.tabActive]} 
            onPress={() => { setActiveTab('submissions'); Haptics.selectionAsync(); }}
          >
            <Users size={16} color={activeTab === 'submissions' ? T.emerald : T.textSec} />
            <Text style={[s.tabText, activeTab === 'submissions' && s.tabTextActive]}>Students</Text>
            <View style={s.badgeCount}>
              <Text style={s.badgeCountText}>{submissions.length}</Text>
            </View>
          </TouchableOpacity>
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
                let stColor = T.textMuted;
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border 
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.white, alignItems: 'center', justifyContent: 'center' },
  headerIconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.white, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: T.border },
  
  content: { padding: 24, paddingBottom: 100 },
  titleSection: { marginBottom: 24 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  badgeLive: { backgroundColor: `${T.emerald}10`, borderColor: `${T.emerald}30` },
  badgeFinal: { backgroundColor: T.border, borderColor: T.textMuted },
  badgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  badgeTextLive: { color: T.emerald },
  badgeTextFinal: { color: T.textSec },
  
  title: { fontSize: 24, fontWeight: '800', color: T.text, marginBottom: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaText: { fontSize: 13, color: T.textSec, fontWeight: '600' },
  
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statBox: { 
    flex: 1, minWidth: '45%', backgroundColor: T.white, padding: 16, 
    borderRadius: 16, borderWidth: 1, borderColor: T.border,
    ...Platform.select({ ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 }, android: { elevation: 2 } })
  },
  statLabel: { fontSize: 10, fontWeight: '800', color: T.textMuted, letterSpacing: 1, marginBottom: 4 },
  statVal: { fontSize: 20, fontWeight: '800', color: T.text },

  finalizeBtn: {
    backgroundColor: T.accent, height: 56, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 24, shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1, shadowRadius: 12, elevation: 4,
  },
  finalizeBtnDisabled: { opacity: 0.6 },
  finalizeBtnText: { color: T.white, fontSize: 16, fontWeight: '700' },
  
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.border, marginBottom: 20 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: T.emerald },
  tabText: { fontSize: 14, fontWeight: '600', color: T.textSec },
  tabTextActive: { color: T.emerald },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: T.emerald },
  badgeCount: { backgroundColor: T.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  badgeCountText: { fontSize: 10, fontWeight: '800', color: T.textSec },
  
  tabContent: { flex: 1, minHeight: 400 },

  studentsList: { backgroundColor: T.white, borderRadius: 16, borderWidth: 1, borderColor: T.border, overflow: 'hidden' },
  studentRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: T.border },
  studentName: { fontSize: 15, fontWeight: '600', color: T.text, marginBottom: 4 },
  studentStatus: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  scoreWrap: { backgroundColor: T.bg, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  scoreText: { fontSize: 16, fontWeight: '800', color: T.text },
  inspectBtn: { padding: 8, backgroundColor: T.bg, borderRadius: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  actionSheet: { backgroundColor: T.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, paddingHorizontal: 20 },
  actionSheetHeader: { paddingVertical: 20, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: T.border },
  actionSheetTitle: { fontSize: 16, fontWeight: '800', color: T.text },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 16 },
  actionBtnText: { fontSize: 16, fontWeight: '600', color: T.text },

  rescheduleModal: { backgroundColor: T.white, margin: 20, borderRadius: 24, padding: 24, alignSelf: 'center', width: '90%', marginTop: 'auto', marginBottom: 'auto' },
  rescheduleTitle: { fontSize: 18, fontWeight: '800', color: T.text, marginBottom: 4 },
  rescheduleSub: { fontSize: 12, color: T.textSec, marginBottom: 20 },
  inputLabel: { fontSize: 12, fontWeight: '800', color: T.textMuted, textTransform: 'uppercase', marginBottom: 8 },
  input: { backgroundColor: T.bg, borderRadius: 12, padding: 16, fontSize: 16, color: T.text, marginBottom: 16, borderWidth: 1, borderColor: T.border },
  rescheduleBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  rescheduleCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: T.bg, alignItems: 'center' },
  rescheduleCancelText: { fontSize: 15, fontWeight: '700', color: T.textSec },
  rescheduleSubmitBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: T.accent, alignItems: 'center' },
  rescheduleSubmitText: { fontSize: 15, fontWeight: '700', color: T.white }
});
