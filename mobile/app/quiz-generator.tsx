import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Switch, Text, TextInput, View, useColorScheme, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, FileText, Layers3, Paperclip, Save, Sparkles, Wifi, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import api from '../services/api';
import { Feedback, PressableScale, Surface } from '../components/ui';
import { useAccessibilityPreferences } from '../components/ui/useAccessibilityPreferences';
import { BorderRadius, Colors, FontWeight, Shadows, Spacing, TypeScale } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';
import { useProUpgrade } from '../contexts/ProUpgradeContext';
import { isProPlanRequiredError } from '../services/proFeatureGate';

interface Batch { id: string; name: string; className: string | null }
interface GeneratedQuestion {
  id?: string;
  questionText: string;
  marks: number;
  options: string[];
  correctAnswer: string;
  kept?: boolean;
  variantGroup?: string;
}
type GeneratedQuiz = { title: string; totalMarks: number; questions: GeneratedQuestion[] };
type ThemeColors = typeof Colors.light | typeof Colors.dark;
type ReferenceDocument = DocumentPicker.DocumentPickerAsset;

const MAX_REFERENCE_DOCUMENTS = 5;
const MAX_REFERENCE_SIZE = 10 * 1024 * 1024;
const REFERENCE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'];

const PROGRESS_STEPS = [
  'Reading your topic and constraints',
  'Drafting questions',
  'Building answer choices',
  'Creating anti-cheat variants',
  'Preparing your review',
];

function ProgressLoader({ colors }: { colors: ThemeColors }) {
  const [stepIndex, setStepIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setStepIndex(previous => Math.min(previous + 1, PROGRESS_STEPS.length - 1)), 3000);
    return () => clearInterval(interval);
  }, []);
  const progress = Math.min(((stepIndex + 1) / PROGRESS_STEPS.length) * 100, 95);
  return (
    <Surface style={styles.progressCard}>
      <View style={[styles.progressIcon, { backgroundColor: colors.surfaceSecondary }]}>
        <ActivityIndicator color={colors.focus} />
      </View>
      <Text style={[styles.progressTitle, { color: colors.text }]}>Creating your quiz</Text>
      <Text style={[styles.progressStep, { color: colors.textSecondary }]}>{PROGRESS_STEPS[stepIndex]}</Text>
      <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSecondary }]}>
        <View style={[styles.progressFill, { backgroundColor: colors.chart, width: `${progress}%` }]} />
      </View>
      <Text style={[styles.progressHint, { color: colors.textMuted }]}>Keep this screen open while the quiz is generated.</Text>
    </Surface>
  );
}

export default function QuizGeneratorScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { openProUpgrade } = useProUpgrade();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const { fontScale } = useWindowDimensions();
  const { reduceMotion } = useAccessibilityPreferences();
  const compactFields = fontScale > 1.15;
  const [topic, setTopic] = useState('');
  const [grade, setGrade] = useState('');
  const [difficulty, setDifficulty] = useState('Medium');
  const [questionCount, setQuestionCount] = useState('10');
  const [comments, setComments] = useState('');
  const [referenceDocuments, setReferenceDocuments] = useState<ReferenceDocument[]>([]);
  const [withVariants, setWithVariants] = useState(true);
  const [generatedQuiz, setGeneratedQuiz] = useState<GeneratedQuiz | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [timeLimitMins, setTimeLimitMins] = useState('30');

  const { data: batches = [] } = useQuery<Batch[]>({
    queryKey: ['batches'],
    queryFn: async () => (await api.get('/batches')).data,
    enabled: user?.productPlan !== 'BASIC',
  });
  const difficulties = useMemo(() => ['Easy', 'Medium', 'Hard', 'Olympiad'], []);
  const canGenerate = topic.trim().length > 0 && grade.trim().length > 0 && !generating;

  useEffect(() => {
    if (user?.productPlan !== 'BASIC') return;
    openProUpgrade({
      feature: 'AI quiz generation',
      description: 'Upgrade to Pro to generate quizzes from documents, publish them online, and use quiz credits.',
    });
  }, [openProUpgrade, user?.productPlan]);

  if (user?.productPlan === 'BASIC') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.header}>
          <PressableScale accessibilityLabel="Back to quizzes" onPress={() => router.back()} style={[styles.iconButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <ArrowLeft size={21} color={colors.text} />
          </PressableScale>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={[styles.headerTitle, { color: colors.text }]}>Generate quiz</Text>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Pro feature</Text>
          </View>
        </View>
        <View style={styles.planGuardContent}>
          <Surface tone="strong" style={[styles.planGuardCard, { backgroundColor: colors.hero, borderColor: colors.borderLight }]}>
            <View style={[styles.progressIcon, { backgroundColor: colors.heroEnd }]}>
              <Sparkles size={22} color={colors.heroText} />
            </View>
            <Text style={[styles.planGuardTitle, { color: colors.heroText }]}>AI quiz generation is included with Pro</Text>
            <Text style={[styles.planGuardDescription, { color: colors.heroText }]}>Basic keeps batches, tests, marks, and fees available offline. Pro adds document-assisted quiz generation, online delivery, and quiz credits.</Text>
          </Surface>
          <Feedback kind="empty" title="Use Tests on Basic" description="Create and mark regular tests from the Tests workspace." />
          <PressableScale
            accessibilityLabel="Compare Basic and Pro plans"
            haptic="selection"
            onPress={() => openProUpgrade({
              feature: 'AI quiz generation',
              description: 'Upgrade to Pro to generate quizzes from documents, publish them online, and use quiz credits.',
            })}
            style={[styles.planGuardButton, { backgroundColor: colors.text }]}
          >
            <Text style={[styles.planGuardButtonText, { color: colors.background }]}>Compare Basic and Pro</Text>
          </PressableScale>
        </View>
      </SafeAreaView>
    );
  }

  const pickReferenceDocuments = async () => {
    const availableSlots = MAX_REFERENCE_DOCUMENTS - referenceDocuments.length;
    if (availableSlots <= 0) {
      Alert.alert('Five documents selected', 'Remove a document before attaching another one.');
      return;
    }

    const result = await DocumentPicker.getDocumentAsync({
      type: REFERENCE_TYPES,
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;

    const accepted: ReferenceDocument[] = [];
    const rejected: string[] = [];
    for (const document of result.assets) {
      if (accepted.length >= availableSlots) {
        rejected.push(`${document.name}: maximum ${MAX_REFERENCE_DOCUMENTS} documents`);
        continue;
      }
      if (document.mimeType && !REFERENCE_TYPES.includes(document.mimeType)) {
        rejected.push(`${document.name}: unsupported type`);
        continue;
      }
      if (typeof document.size === 'number' && document.size > MAX_REFERENCE_SIZE) {
        rejected.push(`${document.name}: larger than 10 MB`);
        continue;
      }
      const duplicate = [...referenceDocuments, ...accepted].some(existing => existing.name === document.name && existing.size === document.size);
      if (!duplicate) accepted.push(document);
    }
    setReferenceDocuments(current => [...current, ...accepted]);
    if (rejected.length) Alert.alert('Some documents were not attached', rejected.join('\n'));
  };

  const handleGenerate = async () => {
    if (!topic.trim() || !grade.trim()) {
      Alert.alert('Add the quiz details', 'Enter a topic and class before generating the quiz.');
      return;
    }
    setGenerating(true);
    setGeneratedQuiz(null);
    try {
      const formData = new FormData();
      formData.append('topic', topic.trim());
      formData.append('grade', grade.trim());
      formData.append('difficulty', difficulty === 'Olympiad' ? 'Olympiad / Competitive' : difficulty);
      formData.append('questionCount', String(Number.parseInt(questionCount, 10) || 10));
      formData.append('withVariants', String(withVariants));
      if (comments.trim()) formData.append('comments', comments.trim());
      referenceDocuments.forEach(document => {
        formData.append('files', {
          uri: document.uri,
          name: document.name,
          type: document.mimeType || 'application/octet-stream',
        } as any);
      });
      const response = await api.post('/tests/generate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000,
      });
      let data = response.data;
      if (data?.jobId) {
        let status = 'pending';
        while (status === 'pending' || status === 'processing') {
          await new Promise(resolve => setTimeout(resolve, 2500));
          const statusData = (await api.get(`/tests/generate/status/${data.jobId}`)).data;
          if (statusData.status === 'completed') { data = statusData.result; break; }
          if (statusData.status === 'error') throw new Error(statusData.error || 'Quiz generation failed');
          status = statusData.status;
        }
      }
      if (!data || !Array.isArray(data.questions)) throw new Error('The generator returned an invalid quiz. Please try again.');
      const questions = data.questions.map((question: GeneratedQuestion) => ({ ...question, kept: true }));
      setGeneratedQuiz({ ...data, questions });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error: any) {
      if (isProPlanRequiredError(error)) return;
      Alert.alert('Quiz could not be generated', error?.response?.data?.error || error?.message || 'Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const toggleQuestion = (index: number) => {
    if (!generatedQuiz) return;
    const questions = generatedQuiz.questions.map((question, questionIndex) => questionIndex === index ? { ...question, kept: !question.kept } : question);
    const totalMarks = questions.reduce((total, question) => total + (question.kept ? question.marks : 0), 0);
    setGeneratedQuiz({ ...generatedQuiz, questions, totalMarks });
  };

  const handlePublish = async () => {
    if (!generatedQuiz) return;
    if (!selectedBatchId) { Alert.alert('Select a batch', 'Choose the batch that should receive this quiz.'); return; }
    if (!generatedQuiz.questions.some(question => question.kept)) {
      Alert.alert('Select at least one question', 'A quiz cannot be published without questions.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/tests/online', {
        title: generatedQuiz.title,
        topic: topic.trim(),
        difficulty,
        timeLimitMins: Number.parseInt(timeLimitMins, 10) || 30,
        totalMarks: generatedQuiz.totalMarks,
        availableFrom: new Date().toISOString(),
        availableUntil: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        batchIds: [selectedBatchId],
        questions: generatedQuiz.questions.filter(question => question.kept),
        studentQuestionCount: Number.parseInt(questionCount, 10) || null,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (error: any) {
      if (isProPlanRequiredError(error)) return;
      Alert.alert('Quiz could not be published', error?.response?.data?.error || 'Please try again.');
    } finally { setSaving(false); }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <PressableScale accessibilityLabel="Back to quizzes" onPress={() => router.back()} style={[styles.iconButton, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
          <ArrowLeft size={21} color={colors.text} />
        </PressableScale>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={[styles.headerTitle, { color: colors.text }]}>Generate quiz</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Create, review, then publish</Text>
        </View>
        <View style={[styles.onlineBadge, { backgroundColor: colors.surfaceSecondary }]}>
          <Wifi size={14} color={colors.focus} />
          <Text style={[styles.onlineBadgeText, { color: colors.textSecondary }]}>Online</Text>
        </View>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {!generatedQuiz ? (
            <View style={styles.form}>
              <Field label="Topic or subject" colors={colors}>
                <TextInput accessibilityLabel="Quiz topic or subject" style={[styles.input, inputColors(colors)]} placeholder="Linear equations in two variables" placeholderTextColor={colors.textMuted} value={topic} onChangeText={setTopic} />
              </Field>
              <View style={[styles.fieldRow, compactFields && styles.fieldRowStacked]}>
                <Field label="Class" colors={colors} style={styles.flex}>
                  <TextInput accessibilityLabel="Quiz class" style={[styles.input, inputColors(colors)]} placeholder="Class 10" placeholderTextColor={colors.textMuted} value={grade} onChangeText={setGrade} />
                </Field>
                <Field label="Questions" colors={colors} style={styles.flex}>
                  <TextInput accessibilityLabel="Number of questions" style={[styles.input, inputColors(colors)]} keyboardType="number-pad" value={questionCount} onChangeText={setQuestionCount} />
                </Field>
              </View>
              <Field label="Difficulty" colors={colors}>
                <View style={styles.chipRow}>{difficulties.map(item => <ChoiceChip key={item} label={item} selected={difficulty === item} colors={colors} onPress={() => setDifficulty(item)} />)}</View>
              </Field>
              <Field label="Teacher instructions · optional" colors={colors}>
                <TextInput accessibilityLabel="Optional instructions for quiz generation" style={[styles.input, styles.multilineInput, inputColors(colors)]} placeholder="Focus on word problems involving speed." placeholderTextColor={colors.textMuted} multiline value={comments} onChangeText={setComments} />
              </Field>
              <Field label="Reference documents · optional" colors={colors}>
                <PressableScale
                  accessibilityLabel={`Attach reference documents. ${referenceDocuments.length} of ${MAX_REFERENCE_DOCUMENTS} selected`}
                  onPress={pickReferenceDocuments}
                  style={[styles.attachButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  <View style={[styles.attachIcon, { backgroundColor: colors.surfaceSecondary }]}><Paperclip size={20} color={colors.focus} /></View>
                  <View style={styles.attachCopy}>
                    <Text style={[styles.attachTitle, { color: colors.text }]}>{referenceDocuments.length ? 'Attach more documents' : 'Attach documents'}</Text>
                    <Text style={[styles.attachHint, { color: colors.textSecondary }]}>Up to 5 PDFs, images, or text files · 10 MB each</Text>
                  </View>
                  <Text style={[styles.attachCount, { color: colors.textSecondary }]}>{referenceDocuments.length}/{MAX_REFERENCE_DOCUMENTS}</Text>
                </PressableScale>
                {referenceDocuments.map((document, index) => (
                  <Surface key={`${document.uri}-${index}`} style={styles.documentRow}>
                    <View style={[styles.documentIcon, { backgroundColor: colors.surfaceSecondary }]}><FileText size={18} color={colors.focus} /></View>
                    <View style={styles.documentCopy}>
                      <Text numberOfLines={1} style={[styles.documentName, { color: colors.text }]}>{document.name}</Text>
                      <Text style={[styles.documentSize, { color: colors.textSecondary }]}>{formatFileSize(document.size)}</Text>
                    </View>
                    <PressableScale
                      accessibilityLabel={`Remove ${document.name}`}
                      onPress={() => setReferenceDocuments(current => current.filter((_, currentIndex) => currentIndex !== index))}
                      style={[styles.removeDocument, { backgroundColor: colors.surfaceSecondary }]}
                    >
                      <X size={17} color={colors.textSecondary} />
                    </PressableScale>
                  </Surface>
                ))}
              </Field>
              <Surface style={styles.variantCard}>
                <View style={[styles.variantIcon, { backgroundColor: colors.surfaceSecondary }]}><Layers3 size={20} color={colors.focus} /></View>
                <View style={styles.variantCopy}>
                  <Text style={[styles.variantTitle, { color: colors.text }]}>Anti-cheat variants</Text>
                  <Text style={[styles.variantDescription, { color: colors.textSecondary }]}>Create equivalent versions of each concept.</Text>
                </View>
                <Switch accessibilityLabel="Generate anti-cheat variants" value={withVariants} onValueChange={setWithVariants} trackColor={{ false: colors.border, true: colors.chart }} thumbColor={colors.surface} />
              </Surface>
              {generating ? <ProgressLoader colors={colors} /> : (
                <PrimaryButton label="Generate quiz" disabled={!canGenerate} colors={colors} reduceMotion={reduceMotion} onPress={handleGenerate} icon={<Sparkles size={20} color={colors.background} />} />
              )}
            </View>
          ) : (
            <View style={styles.reviewArea}>
              <Surface style={styles.reviewSummary}>
                <View style={[styles.successIcon, { backgroundColor: `${colors.positive}18` }]}><Check size={20} color={colors.positive} /></View>
                <View style={styles.reviewSummaryCopy}>
                  <Text style={[styles.reviewEyebrow, { color: colors.positive }]}>Ready for teacher review</Text>
                  <TextInput accessibilityLabel="Quiz title" style={[styles.titleInput, { color: colors.text, borderColor: colors.border }]} value={generatedQuiz.title} onChangeText={title => setGeneratedQuiz({ ...generatedQuiz, title })} />
                  <Text style={[styles.reviewMeta, { color: colors.textSecondary }]}>{generatedQuiz.totalMarks} marks · {generatedQuiz.questions.filter(question => question.kept).length} selected</Text>
                </View>
              </Surface>
              <Field label="Assign to batch" colors={colors}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
                  {batches.map(batch => <ChoiceChip key={batch.id} label={batch.name} selected={selectedBatchId === batch.id} colors={colors} onPress={() => setSelectedBatchId(batch.id)} />)}
                </ScrollView>
              </Field>
              <Field label="Time limit in minutes" colors={colors}>
                <TextInput accessibilityLabel="Quiz time limit in minutes" style={[styles.input, inputColors(colors)]} keyboardType="number-pad" value={timeLimitMins} onChangeText={setTimeLimitMins} />
              </Field>
              <View style={styles.questionHeadingRow}>
                <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.text }]}>Questions</Text>
                <Text style={[styles.questionCount, { color: colors.textSecondary }]}>{generatedQuiz.questions.length} generated</Text>
              </View>
              {generatedQuiz.questions.map((question, index) => (
                <QuestionCard key={question.id || `${question.questionText}-${index}`} question={question} index={index} colors={colors} onToggle={() => toggleQuestion(index)} />
              ))}
              <PrimaryButton label="Publish quiz" disabled={saving || !selectedBatchId} loading={saving} colors={colors} reduceMotion={reduceMotion} onPress={handlePublish} icon={<Save size={20} color={colors.background} />} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, colors, children, style }: { label: string; colors: ThemeColors; children: React.ReactNode; style?: object }) {
  return <View style={[styles.fieldGroup, style]}><Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>{children}</View>;
}

function ChoiceChip({ label, selected, colors, onPress }: { label: string; selected: boolean; colors: ThemeColors; onPress: () => void }) {
  return (
    <PressableScale accessibilityLabel={label} accessibilityState={{ selected }} haptic="selection" onPress={onPress} style={[styles.chip, { backgroundColor: selected ? colors.text : colors.surface, borderColor: selected ? colors.text : colors.border }]}>
      <Text style={[styles.chipText, { color: selected ? colors.background : colors.textSecondary }]}>{label}</Text>
    </PressableScale>
  );
}

function PrimaryButton({ label, disabled, loading, colors, reduceMotion, onPress, icon }: { label: string; disabled: boolean; loading?: boolean; colors: ThemeColors; reduceMotion: boolean; onPress: () => void; icon: React.ReactNode }) {
  return (
    <PressableScale accessibilityLabel={label} disabled={disabled} haptic="commit" onPress={onPress} style={[styles.primaryButton, { backgroundColor: colors.text, opacity: disabled ? 0.45 : 1 }, !reduceMotion && Shadows.md]}>
      {loading ? <ActivityIndicator color={colors.background} /> : <>{icon}<Text style={[styles.primaryButtonText, { color: colors.background }]}>{label}</Text></>}
    </PressableScale>
  );
}

function QuestionCard({ question, index, colors, onToggle }: { question: GeneratedQuestion; index: number; colors: ThemeColors; onToggle: () => void }) {
  const selected = !!question.kept;
  return (
    <Surface style={[styles.questionCard, !selected && styles.questionCardMuted]}>
      <View style={styles.questionTopRow}>
        <Text style={[styles.questionNumber, { color: colors.textSecondary }]}>Question {index + 1} · {question.marks} marks</Text>
        <PressableScale accessibilityLabel={`${selected ? 'Remove' : 'Keep'} question ${index + 1}`} accessibilityState={{ selected }} onPress={onToggle} style={[styles.keepButton, { backgroundColor: selected ? `${colors.positive}18` : colors.surfaceSecondary, borderColor: selected ? colors.positive : colors.border }]}>
          <Text style={[styles.keepButtonText, { color: selected ? colors.positive : colors.textSecondary }]}>{selected ? 'Selected' : 'Discarded'}</Text>
        </PressableScale>
      </View>
      <Text style={[styles.questionText, { color: colors.text }]}>{question.questionText}</Text>
      {question.options?.length ? (
        <View style={styles.optionsList}>{question.options.map((option, optionIndex) => {
          const letter = String.fromCharCode(65 + optionIndex);
          const correct = question.correctAnswer === option || question.correctAnswer === letter;
          return <View key={`${option}-${optionIndex}`} style={styles.optionRow}><View style={[styles.optionLetter, { backgroundColor: correct ? `${colors.positive}18` : colors.surfaceSecondary }]}><Text style={[styles.optionLetterText, { color: correct ? colors.positive : colors.textSecondary }]}>{letter}</Text></View><Text style={[styles.optionText, { color: correct ? colors.text : colors.textSecondary, fontWeight: correct ? FontWeight.semibold : FontWeight.regular }]}>{option}</Text></View>;
        })}</View>
      ) : <Text style={[styles.answerText, { color: colors.positive }]}>Answer: {question.correctAnswer}</Text>}
    </Surface>
  );
}

const inputColors = (colors: ThemeColors) => ({ backgroundColor: colors.surface, borderColor: colors.border, color: colors.text });
const formatFileSize = (size?: number | null) => {
  if (typeof size !== 'number') return 'Size unavailable';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const styles = StyleSheet.create({
  container: { flex: 1 }, flex: { flex: 1 },
  header: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: BorderRadius.full },
  headerCopy: { flex: 1, minWidth: 0 }, headerTitle: { ...TypeScale.sectionTitle, fontSize: 19, lineHeight: 24 }, headerSubtitle: { ...TypeScale.caption, marginTop: 1 },
  onlineBadge: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, paddingHorizontal: Spacing.md, borderRadius: BorderRadius.full }, onlineBadgeText: TypeScale.caption,
  content: { paddingHorizontal: Spacing.xl, paddingTop: Spacing.md, paddingBottom: Spacing['4xl'] }, form: { gap: Spacing.xl }, reviewArea: { gap: Spacing.xl },
  planGuardContent: { flex: 1, paddingHorizontal: Spacing.xl, paddingTop: Spacing.lg, gap: Spacing.xl },
  planGuardCard: { alignItems: 'center', padding: Spacing['2xl'], borderRadius: BorderRadius.xl },
  planGuardTitle: { ...TypeScale.sectionTitle, textAlign: 'center' },
  planGuardDescription: { ...TypeScale.body, textAlign: 'center', opacity: 0.82, marginTop: Spacing.sm },
  planGuardButton: { minHeight: 52, borderRadius: BorderRadius.lg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg },
  planGuardButtonText: { ...TypeScale.label },
  fieldRow: { flexDirection: 'row', gap: Spacing.md }, fieldRowStacked: { flexDirection: 'column' }, fieldGroup: { gap: Spacing.sm }, label: { ...TypeScale.label },
  input: { minHeight: 54, borderWidth: 1, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, fontSize: 16, lineHeight: 22 }, multilineInput: { minHeight: 96, textAlignVertical: 'top' },
  attachButton: { minHeight: 76, flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderWidth: 1, borderStyle: 'dashed', borderRadius: BorderRadius.lg },
  attachIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.md, marginRight: Spacing.md },
  attachCopy: { flex: 1, minWidth: 0 }, attachTitle: { ...TypeScale.label, fontSize: 15, lineHeight: 20 }, attachHint: { ...TypeScale.caption, marginTop: 2 }, attachCount: { ...TypeScale.label, marginLeft: Spacing.sm },
  documentRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', padding: Spacing.sm, borderRadius: BorderRadius.lg },
  documentIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.md, marginRight: Spacing.md }, documentCopy: { flex: 1, minWidth: 0 }, documentName: { ...TypeScale.label }, documentSize: { ...TypeScale.caption, marginTop: 2 }, removeDocument: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.full, marginLeft: Spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm }, horizontalChips: { gap: Spacing.sm, paddingBottom: Spacing.xs },
  chip: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.lg, borderWidth: 1, borderRadius: BorderRadius.full }, chipText: { ...TypeScale.label, fontWeight: FontWeight.semibold },
  variantCard: { minHeight: 82, flexDirection: 'row', alignItems: 'center', padding: Spacing.lg, borderRadius: BorderRadius.xl }, variantIcon: { width: 44, height: 44, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md }, variantCopy: { flex: 1, minWidth: 0, marginRight: Spacing.sm }, variantTitle: { ...TypeScale.label, fontSize: 15, lineHeight: 20 }, variantDescription: { ...TypeScale.caption, marginTop: 3 },
  primaryButton: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.xl }, primaryButtonText: { fontSize: 16, lineHeight: 22, fontWeight: FontWeight.bold },
  progressCard: { alignItems: 'center', padding: Spacing['2xl'], borderRadius: BorderRadius.xl }, progressIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.full, marginBottom: Spacing.md }, progressTitle: { ...TypeScale.sectionTitle }, progressStep: { ...TypeScale.body, textAlign: 'center', marginTop: Spacing.xs }, progressTrack: { width: '100%', height: 6, overflow: 'hidden', borderRadius: BorderRadius.full, marginTop: Spacing.lg }, progressFill: { height: '100%', borderRadius: BorderRadius.full }, progressHint: { ...TypeScale.caption, textAlign: 'center', marginTop: Spacing.md },
  reviewSummary: { flexDirection: 'row', padding: Spacing.lg, borderRadius: BorderRadius.xl }, successIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.full, marginRight: Spacing.md }, reviewSummaryCopy: { flex: 1, minWidth: 0 }, reviewEyebrow: { ...TypeScale.caption, fontWeight: FontWeight.bold, marginBottom: Spacing.xs }, titleInput: { fontSize: 20, lineHeight: 26, fontWeight: FontWeight.bold, borderBottomWidth: 1, paddingVertical: Spacing.xs }, reviewMeta: { ...TypeScale.caption, marginTop: Spacing.sm },
  questionHeadingRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.md }, sectionTitle: TypeScale.sectionTitle, questionCount: TypeScale.caption,
  questionCard: { padding: Spacing.lg, borderRadius: BorderRadius.xl }, questionCardMuted: { opacity: 0.58 }, questionTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, marginBottom: Spacing.sm }, questionNumber: { ...TypeScale.caption, flex: 1 }, keepButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.md, borderWidth: 1, borderRadius: BorderRadius.full }, keepButtonText: { ...TypeScale.caption, fontWeight: FontWeight.bold }, questionText: { ...TypeScale.body, fontWeight: FontWeight.medium }, optionsList: { gap: Spacing.sm, marginTop: Spacing.md }, optionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm }, optionLetter: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.sm }, optionLetterText: { ...TypeScale.caption, fontWeight: FontWeight.bold }, optionText: { ...TypeScale.body, flex: 1, fontSize: 14, lineHeight: 20 }, answerText: { ...TypeScale.label, marginTop: Spacing.md },
});
