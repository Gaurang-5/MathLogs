import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, Switch, Dimensions, KeyboardAvoidingView,
  Platform, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, ArrowLeft, Loader2, Layers, AlertCircle, Save } from 'lucide-react-native';
import api from '../services/api';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827',
  emerald: '#10b981', amber: '#f59e0b', red: '#ef4444',
  border: 'rgba(0,0,0,0.06)', shadow: 'rgba(0,0,0,0.06)',
};

interface Batch {
  id: string;
  name: string;
  className: string | null;
}

interface GeneratedQuestion {
  id?: string;
  questionText: string;
  marks: number;
  options: string[];
  correctAnswer: string;
  kept?: boolean;
  variantGroup?: string;
}

export default function QuizGeneratorScreen() {
  const router = useRouter();
  
  // Form State
  const [topic, setTopic] = useState('');
  const [grade, setGrade] = useState('');
  const [difficulty, setDifficulty] = useState('Medium');
  const [questionCount, setQuestionCount] = useState('10');
  const [comments, setComments] = useState('');
  const [withVariants, setWithVariants] = useState(true);
  
  // State for Step 2 (Review)
  const [generatedTest, setGeneratedTest] = useState<{ title: string; totalMarks: number; questions: GeneratedQuestion[] } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Save specific state
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');
  const [timeLimitMins, setTimeLimitMins] = useState('30');
  
  const { data: batches = [] } = useQuery<Batch[]>({
    queryKey: ['batches'],
    queryFn: async () => {
      const res = await api.get('/batches');
      return res.data;
    },
  });

  const difficulties = ['Easy', 'Medium', 'Hard', 'Olympiad'];

  const handleGenerate = async () => {
    if (!topic || !grade) {
      alert('Please fill out Topic and Grade');
      return;
    }
    
    setGenerating(true);
    setGeneratedTest(null);

    try {
      // In React Native, FormData works slightly differently but simple strings work the same
      const formData = new FormData();
      formData.append('topic', topic);
      formData.append('grade', grade);
      formData.append('difficulty', difficulty === 'Olympiad' ? 'Olympiad / Competitive' : difficulty);
      formData.append('questionCount', questionCount);
      formData.append('withVariants', String(withVariants));
      if (comments.trim()) {
        formData.append('comments', comments.trim());
      }

      const res = await api.post('/tests/generate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const questions: GeneratedQuestion[] = (res.data.questions || []).map((q: any) => ({ ...q, kept: false }));
      setGeneratedTest({ ...res.data, questions });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to generate test');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveTest = async () => {
    if (!generatedTest) return;
    if (!selectedBatchId) {
      alert('Please select a batch to assign the quiz to.');
      return;
    }
    
    setSaving(true);
    try {
      // For mobile MVP, setting availableFrom to now and availableUntil to 2 hours from now by default
      const fromDate = new Date();
      const untilDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
      
      await api.post('/tests/online', {
        title: generatedTest.title,
        topic,
        difficulty,
        timeLimitMins: parseInt(timeLimitMins) || 30,
        totalMarks: generatedTest.totalMarks,
        availableFrom: fromDate.toISOString(),
        availableUntil: untilDate.toISOString(),
        batchIds: [selectedBatchId],
        questions: generatedTest.questions,
        studentQuestionCount: parseInt(questionCount) || null
      });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to save test');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={20} color={T.text} />
        </TouchableOpacity>
        <View style={s.headerTitleWrap}>
          <Sparkles size={18} color={T.emerald} />
          <Text style={s.headerTitle}>AI Test Generator</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {!generatedTest ? (
            <View style={s.form}>
              <View style={s.inputGroup}>
                <Text style={s.label}>Topic / Subject</Text>
                <TextInput
                  style={s.input}
                  placeholder="e.g. Linear Equations in Two Variables"
                  placeholderTextColor={T.textMuted}
                  value={topic}
                  onChangeText={setTopic}
                />
              </View>

              <View style={s.row}>
                <View style={[s.inputGroup, { flex: 1 }]}>
                  <Text style={s.label}>Grade / Class</Text>
                  <TextInput
                    style={s.input}
                    placeholder="e.g. 10th Grade"
                    placeholderTextColor={T.textMuted}
                    value={grade}
                    onChangeText={setGrade}
                  />
                </View>
                <View style={[s.inputGroup, { flex: 1 }]}>
                  <Text style={s.label}>No. of Questions</Text>
                  <TextInput
                    style={s.input}
                    keyboardType="numeric"
                    value={questionCount}
                    onChangeText={setQuestionCount}
                  />
                </View>
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>Difficulty</Text>
                <View style={s.chipRow}>
                  {difficulties.map(d => (
                    <TouchableOpacity
                      key={d}
                      style={[s.chip, difficulty === d && s.chipActive]}
                      onPress={() => setDifficulty(d)}
                    >
                      <Text style={[s.chipText, difficulty === d && s.chipTextActive]}>{d}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              
              <View style={s.inputGroup}>
                <Text style={s.label}>Custom Prompt (Optional)</Text>
                <TextInput
                  style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]}
                  placeholder="e.g. Focus on word problems involving speed."
                  placeholderTextColor={T.textMuted}
                  multiline
                  value={comments}
                  onChangeText={setComments}
                />
              </View>

              <View style={s.switchGroup}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Layers size={16} color={T.text} />
                    <Text style={s.switchLabel}>Generate Variants (Anti-Cheat)</Text>
                  </View>
                  <Text style={s.switchDesc}>Creates two versions of each concept to prevent cheating.</Text>
                </View>
                <Switch 
                  value={withVariants} 
                  onValueChange={setWithVariants} 
                  trackColor={{ false: T.textMuted, true: T.emerald }}
                  thumbColor={T.white}
                />
              </View>

              <TouchableOpacity 
                style={[s.generateBtn, (!topic || !grade) && s.generateBtnDisabled]} 
                onPress={handleGenerate}
                disabled={generating || !topic || !grade}
              >
                {generating ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator color={T.white} />
                    <Text style={s.generateBtnText}>Generating with AI...</Text>
                  </View>
                ) : (
                  <>
                    <Sparkles size={20} color={T.white} />
                    <Text style={s.generateBtnText}>Generate with AI</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.reviewArea}>
              <View style={s.successBanner}>
                <Text style={s.successBannerText}>✅ Test generated successfully!</Text>
                <TextInput 
                  style={s.titleInput} 
                  value={generatedTest.title}
                  onChangeText={t => setGeneratedTest({...generatedTest, title: t})}
                />
                <Text style={s.successBannerSub}>
                  Total Marks: {generatedTest.totalMarks} • {generatedTest.questions.length} Questions
                </Text>
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>Assign to Batch</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                  {batches.map(b => (
                    <TouchableOpacity
                      key={b.id}
                      style={[s.batchChip, selectedBatchId === b.id && s.batchChipActive]}
                      onPress={() => setSelectedBatchId(b.id)}
                    >
                      <Text style={[s.batchChipText, selectedBatchId === b.id && s.batchChipTextActive]}>
                        {b.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={s.inputGroup}>
                <Text style={s.label}>Time Limit (Minutes)</Text>
                <TextInput
                  style={s.input}
                  keyboardType="numeric"
                  value={timeLimitMins}
                  onChangeText={setTimeLimitMins}
                />
              </View>
              
              <View style={{ paddingVertical: 12 }}>
                <Text style={s.label}>Generated Questions Preview</Text>
                {generatedTest.questions.slice(0, 3).map((q, i) => (
                  <View key={i} style={s.questionCard}>
                    <Text style={s.qLabel}>Q{i + 1} ({q.marks} Marks)</Text>
                    <Text style={s.qText}>{q.questionText}</Text>
                  </View>
                ))}
                {generatedTest.questions.length > 3 && (
                  <Text style={s.moreQuestionsText}>+ {generatedTest.questions.length - 3} more questions</Text>
                )}
              </View>

              <TouchableOpacity 
                style={s.saveBtn} 
                onPress={handleSaveTest}
                disabled={saving || !selectedBatchId}
              >
                {saving ? (
                  <ActivityIndicator color={T.white} />
                ) : (
                  <>
                    <Save size={20} color={T.white} />
                    <Text style={s.saveBtnText}>Save & Publish Quiz</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: { 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: T.border 
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.white, alignItems: 'center', justifyContent: 'center' },
  headerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: T.text },
  
  content: { padding: 24, paddingBottom: 100 },
  form: { gap: 20 },
  row: { flexDirection: 'row', gap: 16 },
  inputGroup: { gap: 8 },
  label: { fontSize: 12, fontWeight: '700', color: T.textSec, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 4 },
  input: { 
    backgroundColor: T.white, borderWidth: 1, borderColor: T.border, borderRadius: 16, 
    paddingHorizontal: 16, height: 56, fontSize: 16, color: T.text, fontWeight: '500' 
  },
  
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { 
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, 
    backgroundColor: T.white, borderWidth: 1, borderColor: T.border 
  },
  chipActive: { backgroundColor: T.accent, borderColor: T.accent },
  chipText: { fontSize: 14, fontWeight: '600', color: T.textSec },
  chipTextActive: { color: T.white },

  switchGroup: { 
    flexDirection: 'row', alignItems: 'center', gap: 16, 
    backgroundColor: T.white, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: T.border 
  },
  switchLabel: { fontSize: 15, fontWeight: '700', color: T.text },
  switchDesc: { fontSize: 12, color: T.textSec, marginTop: 4, paddingLeft: 22 },

  generateBtn: {
    backgroundColor: T.accent, height: 60, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12, shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1, shadowRadius: 12, elevation: 4,
  },
  generateBtnDisabled: { opacity: 0.5 },
  generateBtnText: { color: T.white, fontSize: 17, fontWeight: '700' },
  
  reviewArea: { gap: 20 },
  successBanner: { backgroundColor: `${T.emerald}10`, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: `${T.emerald}30` },
  successBannerText: { color: T.emerald, fontWeight: '700', marginBottom: 8 },
  titleInput: { fontSize: 20, fontWeight: '800', color: T.text, borderBottomWidth: 1, borderBottomColor: T.border, paddingBottom: 4 },
  successBannerSub: { fontSize: 13, color: T.textSec, marginTop: 8, fontWeight: '600' },
  
  batchChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, backgroundColor: T.white, borderWidth: 1, borderColor: T.border },
  batchChipActive: { backgroundColor: T.emerald, borderColor: T.emerald },
  batchChipText: { fontSize: 14, fontWeight: '600', color: T.textSec },
  batchChipTextActive: { color: T.white },
  
  questionCard: { backgroundColor: T.white, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: T.border, marginBottom: 10 },
  qLabel: { fontSize: 11, fontWeight: '700', color: T.textMuted, marginBottom: 6 },
  qText: { fontSize: 15, color: T.text, fontWeight: '500', lineHeight: 22 },
  moreQuestionsText: { textAlign: 'center', color: T.textSec, fontWeight: '600', fontSize: 13, marginTop: 8 },
  
  saveBtn: {
    backgroundColor: T.emerald, height: 60, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 12, shadowColor: T.emerald, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 4,
  },
  saveBtnText: { color: T.white, fontSize: 17, fontWeight: '700' }
});
