import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, SafeAreaView } from 'react-native';
import { X, CheckCircle2, AlertCircle } from 'lucide-react-native';

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827',
  emerald: '#10b981', emeraldLight: '#d1fae5', amber: '#f59e0b', amberLight: '#fef3c7',
  red: '#ef4444', redLight: '#fee2e2', border: 'rgba(0,0,0,0.06)', shadow: 'rgba(0,0,0,0.06)',
};

interface Question {
    id: string;
    questionText: string;
    options: string | string[];
    correctOption: string;
    marks: number;
}

interface Answer {
    questionId: string;
    selectedOption: string;
    isCorrect: boolean;
    marksObtained: number;
}

interface QuizSubmission {
    id: string;
    studentId: string;
    startedAt: string | null;
    submittedAt: string | null;
    score: number | null;
    answers?: Answer[];
}

export interface InspectorData {
    studentName: string;
    studentId: string;
    humanId: string | null;
    submission: QuizSubmission | null;
}

interface Props {
    visible: boolean;
    onClose: () => void;
    data: InspectorData | null;
    quiz: {
        totalMarks: number;
        questions?: Question[];
        isFinalized?: boolean;
    } | null;
}

export default function QuizSubmissionInspector({ visible, onClose, data, quiz }: Props) {
    if (!data || !quiz) return null;

    const { submission } = data;
    const questions = quiz.questions || [];

    const isSubmitted = !!submission?.submittedAt;
    const isLocked = !isSubmitted && !!submission?.startedAt && quiz.isFinalized;
    
    let totalScoreText = 'Unsubmitted / Active';
    if (isSubmitted) {
        totalScoreText = `${submission.score?.toFixed(1)} / ${quiz.totalMarks} marks`;
    } else if (isLocked) {
        totalScoreText = `0.0 / ${quiz.totalMarks} (Locked)`;
    }

    let timelineText = 'No timeline';
    if (submission?.submittedAt) {
        timelineText = `Submitted: ${new Date(submission.submittedAt).toLocaleTimeString()}`;
    } else if (submission?.startedAt) {
        timelineText = `Started: ${new Date(submission.startedAt).toLocaleTimeString()}`;
    }

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <SafeAreaView style={s.container}>
                {/* Header */}
                <View style={s.header}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.headerSup}>STUDENT RESPONSE TELEMETRY</Text>
                        <Text style={s.headerTitle} numberOfLines={1}>{data.studentName}</Text>
                        <Text style={s.headerSub}>ID: {data.humanId || 'N/A'}</Text>
                    </View>
                    <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                        <X size={24} color={T.text} />
                    </TouchableOpacity>
                </View>

                <ScrollView style={s.scrollView} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
                    {/* Stats Grid */}
                    <View style={s.statsGrid}>
                        <View style={s.statBox}>
                            <Text style={s.statLabel}>STUDENT TOTAL SCORE</Text>
                            <Text style={[s.statVal, { color: T.emerald }]}>{totalScoreText}</Text>
                        </View>
                        <View style={s.statBox}>
                            <Text style={s.statLabel}>SUBMISSION TIMELINE</Text>
                            <Text style={[s.statVal, { color: T.text }]}>{timelineText}</Text>
                        </View>
                    </View>

                    {/* Answers */}
                    <View style={s.sectionHeader}>
                        <Text style={s.sectionTitle}>Detailed Answer Sheet</Text>
                    </View>

                    {questions.map((q, idx) => {
                        const ans = submission?.answers?.find(a => a.questionId === q.id);
                        let parsedOptions: string[] = [];
                        try {
                            parsedOptions = typeof q.options === 'string' ? JSON.parse(q.options) : Array.isArray(q.options) ? q.options : [];
                        } catch { parsedOptions = []; }

                        const isCorrect = ans?.isCorrect;
                        const headerBg = ans ? (isCorrect ? T.emeraldLight : T.redLight) : T.bg;
                        const badgeBg = ans ? (isCorrect ? T.emerald : T.red) : T.textMuted;
                        const badgeText = ans ? (isCorrect ? `+${ans.marksObtained}` : '0') : 'Not answered';

                        return (
                            <View key={q.id} style={s.questionCard}>
                                <View style={[s.qHeader, { backgroundColor: headerBg }]}>
                                    <Text style={s.qNum}>Q{idx + 1}</Text>
                                    <View style={[s.qBadge, { backgroundColor: badgeBg }]}>
                                        <Text style={s.qBadgeText}>{badgeText}</Text>
                                    </View>
                                </View>
                                
                                <View style={s.qBody}>
                                    <Text style={s.qText}>{q.questionText}</Text>
                                    <View style={s.optionsList}>
                                        {parsedOptions.map((opt) => {
                                            const isCorrectOpt = opt === q.correctOption;
                                            const isSelectedOpt = opt === ans?.selectedOption;
                                            
                                            let optBorder = T.border;
                                            let optBg = T.white;
                                            let optTextColor = T.textSec;

                                            if (isCorrectOpt) {
                                                optBg = T.emeraldLight;
                                                optBorder = T.emerald;
                                                optTextColor = T.emerald;
                                            } else if (isSelectedOpt && !isCorrect) {
                                                optBg = T.redLight;
                                                optBorder = T.red;
                                                optTextColor = T.red;
                                            }

                                            return (
                                                <View key={opt} style={[s.optionItem, { backgroundColor: optBg, borderColor: optBorder }]}>
                                                    <Text style={[s.optionText, { color: optTextColor }]} numberOfLines={2}>
                                                        {opt}
                                                    </Text>
                                                    <View style={s.optTags}>
                                                        {isCorrectOpt && <Text style={[s.optTag, { color: T.emerald }]}>CORRECT</Text>}
                                                        {isSelectedOpt && (
                                                            <View style={[s.studentTag, { backgroundColor: isCorrect ? T.emerald : T.red }]}>
                                                                <Text style={s.studentTagText}>STUDENT</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </View>
                            </View>
                        );
                    })}
                </ScrollView>
            </SafeAreaView>
        </Modal>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: T.bg },
    header: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: T.white, borderBottomWidth: 1, borderBottomColor: T.border },
    headerSup: { fontSize: 10, fontWeight: '800', color: T.emerald, letterSpacing: 0.5, marginBottom: 2 },
    headerTitle: { fontSize: 18, fontWeight: '800', color: T.text },
    headerSub: { fontSize: 12, fontWeight: '600', color: T.textSec, marginTop: 2 },
    closeBtn: { padding: 8, backgroundColor: T.bg, borderRadius: 20, marginLeft: 16 },

    scrollView: { flex: 1 },
    content: { padding: 16, paddingBottom: 40, gap: 20 },

    statsGrid: { flexDirection: 'row', gap: 12 },
    statBox: { flex: 1, backgroundColor: T.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: T.border },
    statLabel: { fontSize: 9, fontWeight: '800', color: T.textMuted, letterSpacing: 0.5, marginBottom: 6 },
    statVal: { fontSize: 14, fontWeight: '800' },

    sectionHeader: { borderBottomWidth: 1, borderBottomColor: T.border, paddingBottom: 8 },
    sectionTitle: { fontSize: 12, fontWeight: '800', color: T.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

    questionCard: { backgroundColor: T.white, borderRadius: 16, borderWidth: 1, borderColor: T.border, overflow: 'hidden' },
    qHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border },
    qNum: { fontSize: 13, fontWeight: '800', color: T.textSec },
    qBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100 },
    qBadgeText: { fontSize: 11, fontWeight: '800', color: T.white },

    qBody: { padding: 16 },
    qText: { fontSize: 15, fontWeight: '600', color: T.text, lineHeight: 22, marginBottom: 16 },
    
    optionsList: { gap: 8 },
    optionItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, gap: 12 },
    optionText: { flex: 1, fontSize: 13, fontWeight: '600' },
    
    optTags: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    optTag: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
    studentTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    studentTagText: { fontSize: 9, fontWeight: '800', color: T.white, letterSpacing: 0.5 }
});
