import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Platform, Dimensions, Alert, Modal, TextInput, KeyboardAvoidingView,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, FileText, Calendar, BarChart2, Scan, Hash, Users, X, PenLine, Check, Edit2 } from 'lucide-react-native';
import api from '../../services/api';
import { SkeletonLoader, BrandButton } from '../../components/ui';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827',
  emerald: '#10b981', amber: '#f59e0b', red: '#ef4444', blue: '#3b82f6',
  border: 'rgba(0,0,0,0.06)', shadow: 'rgba(0,0,0,0.06)',
};

interface TestDetails {
  id: string;
  name: string;
  subject: string;
  className: string | null;
  date: string;
  maxMarks: number;
  batches?: Array<{ id: string; name: string; students: Array<{ id: string; name: string; humanId: string | null }> }>;
  marks: Array<{
    id: string;
    student: { id: string; name: string; humanId: string | null; batch?: { name: string } };
    score: number;
  }>;
}

export default function TestDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: test, isLoading } = useQuery<TestDetails>({
    queryKey: ['test', id],
    queryFn: async () => {
      const res = await api.get(`/tests/${id}`);
      return res.data;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const students = useMemo(() => test?.marks || [], [test]);

  const [editingMark, setEditingMark] = useState<{ studentId: string; studentName: string; score: string } | null>(null);

  // ── Manual marks entry state ──
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [marksInput, setMarksInput] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [candidateStudents, setCandidateStudents] = useState<Array<{ id: string; name: string; humanId: string | null; batchName: string }>>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  const openManualEntry = useCallback(async () => {
    // Pre-fill existing marks
    const pre: Record<string, string> = {};
    test?.marks.forEach(m => { pre[m.student.id] = String(m.score); });
    setMarksInput(pre);
    setIsManualOpen(true);
    setLoadingCandidates(true);
    try {
      // Fetch ungraded eligible students
      const res = await api.get(`/tests/${id}/eligible-students`);
      const eligible: Array<{ id: string; name: string; humanId: string | null; batchName: string }> = res.data;
      // Merge with already-graded students (for editing)
      const gradedStudents = (test?.marks || []).map(m => ({
        id: m.student.id, name: m.student.name,
        humanId: m.student.humanId, batchName: m.student.batch?.name || '',
      }));
      const allIds = new Set(eligible.map(s => s.id));
      const merged = [...gradedStudents.filter(s => !allIds.has(s.id)), ...eligible];
      // Sort alphabetically
      merged.sort((a, b) => a.name.localeCompare(b.name));
      setCandidateStudents(merged);
    } catch {
      setCandidateStudents((test?.marks || []).map(m => ({
        id: m.student.id, name: m.student.name,
        humanId: m.student.humanId, batchName: m.student.batch?.name || '',
      })));
    } finally {
      setLoadingCandidates(false);
    }
  }, [test, id]);

  const handleSubmitMarks = useCallback(async () => {
    const entries = Object.entries(marksInput).filter(([, v]) => v !== '' && !isNaN(Number(v)));
    if (entries.length === 0) {
      Alert.alert('No marks', 'Enter at least one student score.');
      return;
    }
    // Validate max marks
    const invalid = entries.find(([, v]) => Number(v) > (test?.maxMarks ?? Infinity));
    if (invalid) {
      Alert.alert('Invalid', `Score cannot exceed max marks (${test?.maxMarks}).`);
      return;
    }
    setSubmitting(true);
    try {
      await Promise.all(entries.map(([studentId, score]) =>
        api.post('/marks', { studentId, testId: id, score: Number(score) })
      ));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await queryClient.refetchQueries({ queryKey: ['test', id] });
      setIsManualOpen(false);
      Alert.alert('Saved ✅', `${entries.length} marks saved successfully.`);
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to save marks.');
    } finally {
      setSubmitting(false);
    }
  }, [marksInput, test, id]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.navBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={T.text} />
        </TouchableOpacity>
        <Text style={s.navTitle} numberOfLines={1}>{test?.name || 'Test Details'}</Text>
        <View style={s.navRight} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        {isLoading ? (
          <View style={{ gap: 16 }}>
            <SkeletonLoader width={width - 32} height={180} borderRadius={24} />
            <SkeletonLoader width={width - 32} height={200} borderRadius={20} />
          </View>
        ) : !test ? (
          <View style={s.empty}>
            <FileText size={48} color={T.textMuted} />
            <Text style={s.emptyTitle}>Test not found</Text>
          </View>
        ) : (
          <View>
            <Animated.View entering={FadeInDown.duration(400)} style={s.heroCard}>
              <View style={s.heroTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.heroName}>{test.name}</Text>
                  <View style={s.heroMetaRow}>
                    <Text style={s.heroPill}>{test.subject}</Text>
                    {test.className && <Text style={[s.heroPill, { backgroundColor: `${T.accent}15`, color: T.accent }]}>{test.className}</Text>}
                  </View>
                </View>
              </View>

              <View style={s.heroStatsRow}>
                <View style={s.heroStat}>
                  <Calendar size={16} color={T.textSec} style={{ marginRight: 6 }} />
                  <Text style={s.heroStatText}>{new Date(test.date).toLocaleDateString()}</Text>
                </View>
                <View style={s.heroStat}>
                  <Hash size={16} color={T.textSec} style={{ marginRight: 6 }} />
                  <Text style={s.heroStatText}>Max: {test.maxMarks}</Text>
                </View>
                <View style={s.heroStat}>
                  <Users size={16} color={T.textSec} style={{ marginRight: 6 }} />
                  <Text style={s.heroStatText}>{students.length} Graded</Text>
                </View>
              </View>

              {/* Quick Actions */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickActionsScroll}>
                <TouchableOpacity
                  style={[s.qActionBtn, { backgroundColor: T.accent, borderColor: T.accent }]}
                  onPress={() => router.push(`/test/scan?testId=${id}&maxMarks=${test.maxMarks}`)}
                >
                  <Scan size={16} color={T.white} />
                  <Text style={[s.qActionText, { color: T.white }]}>Scan OMR</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.qActionBtn, { backgroundColor: `${T.blue}12`, borderColor: `${T.blue}30` }]}
                  onPress={openManualEntry}
                >
                  <PenLine size={16} color={T.blue} />
                  <Text style={[s.qActionText, { color: T.blue }]}>Enter Marks</Text>
                </TouchableOpacity>
              </ScrollView>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(100)} style={s.studentsContainer}>
              <Text style={s.sectionTitle}>Student Performance</Text>
              <View style={s.studentsList}>
                {students.length === 0 ? (
                  <View style={{ padding: 40, alignItems: 'center', backgroundColor: T.white, borderRadius: 20 }}>
                    <BarChart2 size={40} color={T.textMuted} style={{ marginBottom: 12, opacity: 0.5 }} />
                    <Text style={{ color: T.textSec, fontWeight: '600' }}>No marks recorded yet.</Text>
                    <TouchableOpacity
                      style={{ marginTop: 16, backgroundColor: T.accent, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 }}
                      onPress={openManualEntry}
                    >
                      <Text style={{ color: T.white, fontWeight: '700' }}>Enter Marks Manually</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                   students.map((mark) => (
                    <View key={mark.id} style={s.studentCard}>
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={s.stName}>{mark.student.name}</Text>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {mark.student.humanId && (
                            <View style={s.stIdPill}>
                              <Text style={s.stIdText}>{mark.student.humanId}</Text>
                            </View>
                          )}
                          {mark.student.batch?.name && (
                            <View style={s.stIdPill}>
                              <Text style={s.stIdText}>{mark.student.batch.name}</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[s.scoreValue, { color: mark.score < test.maxMarks * 0.4 ? T.red : T.emerald }]}>{mark.score}</Text>
                          <Text style={s.scoreMax}>/ {test.maxMarks}</Text>
                        </View>
                        <TouchableOpacity
                          style={{ padding: 8, backgroundColor: `${T.accent}10`, borderRadius: 10 }}
                          onPress={() => setEditingMark({
                            studentId: mark.student.id,
                            studentName: mark.student.name,
                            score: String(mark.score)
                          })}
                        >
                          <Edit2 size={15} color={T.accent} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </Animated.View>
          </View>
        )}
      </ScrollView>

      {/* ── Manual Marks Entry Modal ── */}
      <Modal visible={isManualOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsManualOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: T.border }}>
              <View>
                <Text style={{ fontSize: 18, fontWeight: '800', color: T.text }}>Enter Marks</Text>
                <Text style={{ fontSize: 12, color: T.textSec, marginTop: 2 }}>Max: {test?.maxMarks} marks per student</Text>
              </View>
              <TouchableOpacity onPress={() => setIsManualOpen(false)} style={{ padding: 8 }}>
                <X size={22} color={T.text} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={candidateStudents}
              keyExtractor={item => item.id}
              contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 120 }}
              ListHeaderComponent={loadingCandidates ? (
                <View style={{ gap: 10, marginBottom: 8 }}>
                  {[1,2,3].map(i => <SkeletonLoader key={i} width={width - 32} height={60} borderRadius={16} />)}
                </View>
              ) : null}
              ListEmptyComponent={!loadingCandidates ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Text style={{ color: T.textSec }}>No students found. Attach a batch to this test first.</Text>
                </View>
              ) : null}
              renderItem={({ item }) => (
                <View style={[s.studentCard, { paddingVertical: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.stName}>{item.name}</Text>
                    <Text style={{ fontSize: 11, color: T.textSec }}>{item.batchName}{item.humanId ? ` • ${item.humanId}` : ''}</Text>
                  </View>
                  <TextInput
                    style={s.marksInput}
                    placeholder="–"
                    placeholderTextColor={T.textMuted}
                    keyboardType="numeric"
                    value={marksInput[item.id] || ''}
                    onChangeText={t => setMarksInput(prev => ({ ...prev, [item.id]: t }))}
                    maxLength={4}
                  />
                </View>
              )}
            />

            <View style={{ padding: 16, paddingBottom: 32, borderTopWidth: 1, borderTopColor: T.border, backgroundColor: T.white }}>
              <TouchableOpacity
                style={[s.submitBtn, submitting && { opacity: 0.6 }]}
                onPress={handleSubmitMarks}
                disabled={submitting}
                activeOpacity={0.85}
              >
                <Check size={18} color={T.white} />
                <Text style={s.submitBtnText}>{submitting ? 'Saving…' : 'Save All Marks'}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ── Edit Student Mark Modal ── */}
      <Modal visible={!!editingMark} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <KeyboardAvoidingView style={s.modalContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Edit Mark</Text>
              <TouchableOpacity onPress={() => setEditingMark(null)} style={s.modalClose}>
                <X size={20} color={T.text} />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: T.text, marginBottom: 4 }}>{editingMark?.studentName}</Text>
              <Text style={{ fontSize: 13, color: T.textSec, marginBottom: 16 }}>Max marks: {test?.maxMarks}</Text>
              
              <Text style={s.inputLabel}>Score</Text>
              <TextInput
                style={s.input}
                value={editingMark?.score || ''}
                onChangeText={t => setEditingMark(prev => prev ? { ...prev, score: t } : null)}
                keyboardType="numeric"
                autoFocus
                placeholder="Enter score"
              />
              <BrandButton
                title="Save Changes"
                onPress={async () => {
                  if (!editingMark) return;
                  const scoreNum = Number(editingMark.score);
                  if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > (test?.maxMarks ?? Infinity)) {
                    Alert.alert('Invalid score', `Score must be between 0 and ${test?.maxMarks}`);
                    return;
                  }
                  try {
                    await api.post('/marks', { studentId: editingMark.studentId, testId: id, score: scoreNum });
                    await queryClient.refetchQueries({ queryKey: ['test', id] });
                    setEditingMark(null);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } catch (e: any) {
                    Alert.alert('Error', 'Failed to update score');
                  }
                }}
                style={{ marginTop: 16 }}
              />
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 56 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -12 },
  navTitle: { fontSize: 17, fontWeight: '700', color: T.text, flex: 1, textAlign: 'center' },
  navRight: { width: 44, alignItems: 'flex-end', justifyContent: 'center' },
  scrollContent: { padding: 16, paddingBottom: 120 },

  empty: { padding: 40, alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyTitle: { fontSize: 18, color: T.textMuted, fontWeight: '700', marginTop: 12 },

  heroCard: {
    backgroundColor: T.white, borderRadius: 24, padding: 20,
    borderWidth: 1, borderColor: T.border, marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 1, shadowRadius: 24 },
      android: { elevation: 4 },
    }),
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  heroName: { fontSize: 24, fontWeight: '800', color: T.text, marginBottom: 8, letterSpacing: -0.5 },
  heroMetaRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  heroPill: { backgroundColor: T.bg, color: T.textSec, fontSize: 11, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },

  heroStatsRow: { flexDirection: 'row', gap: 16, marginBottom: 20, flexWrap: 'wrap' },
  heroStat: { flexDirection: 'row', alignItems: 'center' },
  heroStatText: { fontSize: 13, color: T.textSec, fontWeight: '600' },

  quickActionsScroll: { gap: 8, paddingBottom: 4 },
  qActionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.bg, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, gap: 6, borderWidth: 1, borderColor: T.border },
  qActionText: { fontSize: 13, fontWeight: '700', color: T.text },

  sectionTitle: { fontSize: 18, fontWeight: '800', color: T.text, marginBottom: 12, marginLeft: 4, letterSpacing: -0.3 },
  studentsContainer: { marginBottom: 24 },
  studentsList: { gap: 10 },
  studentCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: T.white, borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },
  stName: { fontSize: 15, fontWeight: '700', color: T.text, marginBottom: 4 },
  stIdPill: { backgroundColor: T.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: T.border },
  stIdText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 10, color: T.textSec, fontWeight: '600' },
  scoreValue: { fontSize: 22, fontWeight: '800' },
  scoreMax: { fontSize: 11, color: T.textSec, fontWeight: '700', marginTop: 2 },

  marksInput: {
    width: 64, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: T.border,
    backgroundColor: T.bg, textAlign: 'center', fontSize: 18, fontWeight: '800', color: T.text,
  },

  submitBtn: {
    backgroundColor: T.accent, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitBtnText: { color: T.white, fontSize: 16, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: T.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: T.border },
  modalTitle: { fontSize: 18, fontWeight: '800', color: T.text },
  modalClose: { padding: 4 },
  inputLabel: { fontSize: 13, color: T.textSec, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: T.bg, borderRadius: 12, height: 50, paddingHorizontal: 16, fontSize: 16, color: T.text, fontWeight: '600', borderWidth: 1, borderColor: T.border, marginBottom: 16 },
});
