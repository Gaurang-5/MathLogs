import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import { BarChart3, TrendingUp, ShieldAlert, BookOpen, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react-native';
import api from '../../services/api';

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827',
  emerald: '#10b981', emeraldLight: '#d1fae5', amber: '#f59e0b', amberLight: '#fef3c7',
  red: '#ef4444', redLight: '#fee2e2', border: 'rgba(0,0,0,0.06)', shadow: 'rgba(0,0,0,0.06)',
};

interface QuizAnalyticsData {
    quiz: { id: string; title: string; totalMarks: number; };
    stats: { totalSubmissions: number; averageScore: number; highestScore: number; lowestScore: number; };
    scoreDistribution: { label: string; count: number }[];
    questionDifficulty: {
        id: string; questionText: string; orderIndex: number; marks: number;
        attempts: number; correctCount: number; incorrectCount: number; failureRate: number;
    }[];
    integrityReport: {
        studentId: string; studentName: string; humanId?: string | null;
        totalFlags: number; eventBreakdown: Record<string, number>;
    }[];
}

interface Props { quizId: string; }

const MetricCard = ({ label, value }: { label: string; value: string | number }) => (
    <View style={s.metricCard}>
        <Text style={s.metricLabel}>{label}</Text>
        <Text style={s.metricValue}>{value}</Text>
    </View>
);

const FailureBadge = ({ rate }: { rate: number }) => {
    const isCritical = rate >= 70;
    const isModerate = rate >= 40;
    const bgColor = isCritical ? T.redLight : isModerate ? T.amberLight : T.emeraldLight;
    const textColor = isCritical ? T.red : isModerate ? T.amber : T.emerald;
    
    return (
        <View style={[s.failureBadge, { backgroundColor: bgColor, borderColor: textColor }]}>
            <Text style={[s.failureBadgeText, { color: textColor }]}>{rate}% Fail</Text>
        </View>
    );
};

export default function QuizAnalytics({ quizId }: Props) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<QuizAnalyticsData | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'questions' | 'integrity'>('overview');
    const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            try {
                const res = await api.get(`/tests/online/${quizId}/analytics`);
                if (mounted) setData(res.data);
            } catch (err: any) {
                if (mounted) setError(err?.response?.data?.error || 'Failed to load analytics');
            } finally {
                if (mounted) setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [quizId]);

    const topHardestQuestions = useMemo(() => data?.questionDifficulty.slice(0, 3) || [], [data]);

    if (loading) {
        return (
            <View style={s.center}>
                <ActivityIndicator size="large" color={T.emerald} />
                <Text style={s.loadingText}>Generating analytics...</Text>
            </View>
        );
    }

    if (error || !data) {
        return (
            <View style={s.center}>
                <AlertTriangle size={32} color={T.red} />
                <Text style={s.errorText}>{error || 'Something went wrong'}</Text>
            </View>
        );
    }

    if (data.stats.totalSubmissions === 0) {
        return (
            <View style={s.center}>
                <View style={s.iconWrapper}>
                    <TrendingUp size={32} color={T.emerald} />
                </View>
                <Text style={s.emptyTitle}>No submissions yet</Text>
                <Text style={s.emptySub}>Analytics will appear once students submit.</Text>
            </View>
        );
    }

    const maxDistCount = Math.max(...data.scoreDistribution.map(d => d.count), 1);

    return (
        <ScrollView style={s.container} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {/* Metrics */}
            <View style={s.metricsGrid}>
                <MetricCard label="Average Score" value={`${data.stats.averageScore}/${data.quiz.totalMarks}`} />
                <MetricCard label="Submissions" value={data.stats.totalSubmissions} />
                <MetricCard label="Highest" value={data.stats.highestScore} />
                <MetricCard label="Lowest" value={data.stats.lowestScore} />
            </View>

            {/* Tabs */}
            <View style={s.tabsContainer}>
                {(['overview', 'questions', 'integrity'] as const).map(tab => (
                    <TouchableOpacity 
                        key={tab} 
                        style={[s.tab, activeTab === tab && s.tabActive]}
                        onPress={() => setActiveTab(tab)}
                    >
                        <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
                            {tab === 'questions' ? 'Questions' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Content */}
            {activeTab === 'overview' && (
                <View style={s.sectionContainer}>
                    {/* Distribution */}
                    <View style={s.card}>
                        <View style={s.cardHeader}>
                            <Text style={s.cardTitle}>Score Distribution</Text>
                        </View>
                        <View style={s.distContainer}>
                            {data.scoreDistribution.map((dist, i) => {
                                const heightPct = (dist.count / maxDistCount) * 100;
                                return (
                                    <View key={i} style={s.distBarContainer}>
                                        <Text style={s.distBarVal}>{dist.count}</Text>
                                        <View style={s.distBarBg}>
                                            <View style={[s.distBarFill, { height: `${heightPct}%`, backgroundColor: T.emerald }]} />
                                        </View>
                                        <Text style={s.distBarLabel}>{dist.label}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>

                    {/* Hardest Questions */}
                    <View style={s.card}>
                        <View style={s.cardHeader}>
                            <Text style={s.cardTitle}>Top 3 Hardest Questions</Text>
                        </View>
                        {topHardestQuestions.map((q, i) => (
                            <View key={q.id} style={[s.hardQuestionRow, i === topHardestQuestions.length - 1 && s.noBorderBottom]}>
                                <View style={s.hqTop}>
                                    <Text style={s.hqText} numberOfLines={2}>{i + 1}. {q.questionText}</Text>
                                    <FailureBadge rate={q.failureRate} />
                                </View>
                                <Text style={s.hqSub}>
                                    {q.incorrectCount} wrong · {q.correctCount} correct · {q.attempts} attempts
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            {activeTab === 'questions' && (
                <View style={s.card}>
                    <View style={s.cardHeader}>
                        <Text style={s.cardTitle}>Question Breakdown</Text>
                    </View>
                    {data.questionDifficulty.map((q, i) => {
                        const isExpanded = expandedQuestionId === q.id;
                        const barCorrect = q.attempts > 0 ? (q.correctCount / q.attempts) * 100 : 0;
                        const barWrong = 100 - barCorrect;

                        return (
                            <View key={q.id} style={[s.questionRow, i === data.questionDifficulty.length - 1 && s.noBorderBottom]}>
                                <TouchableOpacity 
                                    style={s.qClickable}
                                    onPress={() => setExpandedQuestionId(isExpanded ? null : q.id)}
                                >
                                    <View style={s.qTop}>
                                        <View style={s.qNumBadge}><Text style={s.qNumBadgeText}>{i + 1}</Text></View>
                                        <View style={{ flex: 1, paddingRight: 8 }}>
                                            <Text style={s.qText} numberOfLines={2}>{q.questionText}</Text>
                                        </View>
                                        <FailureBadge rate={q.failureRate} />
                                        {isExpanded ? <ChevronUp size={16} color={T.textSec} /> : <ChevronDown size={16} color={T.textSec} />}
                                    </View>
                                    {q.attempts > 0 && (
                                        <View style={s.qMiniBar}>
                                            <View style={[s.qMiniBarSeg, { backgroundColor: T.emerald, width: `${barCorrect}%` }]} />
                                            <View style={[s.qMiniBarSeg, { backgroundColor: T.red, width: `${barWrong}%` }]} />
                                        </View>
                                    )}
                                </TouchableOpacity>

                                {isExpanded && (
                                    <View style={s.qExpanded}>
                                        <View style={s.qStatsGrid}>
                                            <View style={s.qStat}><Text style={s.qStatLabel}>Attempts</Text><Text style={s.qStatVal}>{q.attempts}</Text></View>
                                            <View style={s.qStat}><Text style={s.qStatLabel}>Correct</Text><Text style={[s.qStatVal, { color: T.emerald }]}>{q.correctCount}</Text></View>
                                            <View style={s.qStat}><Text style={s.qStatLabel}>Wrong</Text><Text style={[s.qStatVal, { color: T.red }]}>{q.incorrectCount}</Text></View>
                                            <View style={s.qStat}><Text style={s.qStatLabel}>Marks</Text><Text style={s.qStatVal}>{q.marks}</Text></View>
                                        </View>
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>
            )}

            {activeTab === 'integrity' && (
                <View style={s.card}>
                    <View style={s.cardHeader}>
                        <ShieldAlert size={18} color={T.red} style={{ marginRight: 8 }} />
                        <Text style={s.cardTitle}>Integrity Report</Text>
                    </View>
                    {data.integrityReport.length === 0 ? (
                        <View style={{ padding: 24, alignItems: 'center' }}>
                            <CheckCircle2 size={32} color={T.emerald} />
                            <Text style={{ marginTop: 8, color: T.textSec, fontWeight: '500' }}>No cheating flags recorded.</Text>
                        </View>
                    ) : (
                        data.integrityReport.map((rep, i) => (
                            <View key={rep.studentId} style={[s.integrityRow, i === data.integrityReport.length - 1 && s.noBorderBottom]}>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.intName}>{rep.studentName}</Text>
                                    <Text style={s.intId}>{rep.humanId || 'No ID'}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[s.intFlags, { color: rep.totalFlags >= 3 ? T.red : T.amber }]}>
                                        {rep.totalFlags} Flags
                                    </Text>
                                    <Text style={s.intBreakdown}>
                                        {Object.entries(rep.eventBreakdown).map(([k, v]) => `${k}:${v}`).join(', ')}
                                    </Text>
                                </View>
                            </View>
                        ))
                    )}
                </View>
            )}
        </ScrollView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: T.bg },
    content: { padding: 16, paddingBottom: 40 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 300, backgroundColor: T.white, borderRadius: 16 },
    loadingText: { marginTop: 12, fontSize: 14, color: T.textSec, fontWeight: '600' },
    errorText: { marginTop: 12, fontSize: 16, color: T.red, fontWeight: '700' },
    
    iconWrapper: { width: 64, height: 64, borderRadius: 20, backgroundColor: T.emeraldLight, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    emptyTitle: { fontSize: 18, fontWeight: '800', color: T.text },
    emptySub: { fontSize: 14, color: T.textSec, marginTop: 4 },

    metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    metricCard: { flex: 1, minWidth: '45%', backgroundColor: T.white, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: T.border },
    metricLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: T.textMuted, textTransform: 'uppercase', marginBottom: 4 },
    metricValue: { fontSize: 22, fontWeight: '800', color: T.text },

    tabsContainer: { flexDirection: 'row', backgroundColor: T.white, borderRadius: 12, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: T.border },
    tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
    tabActive: { backgroundColor: T.accent },
    tabText: { fontSize: 13, fontWeight: '700', color: T.textSec },
    tabTextActive: { color: T.white },

    sectionContainer: { gap: 16 },
    card: { backgroundColor: T.white, borderRadius: 16, borderWidth: 1, borderColor: T.border, overflow: 'hidden' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: T.border, backgroundColor: T.white },
    cardTitle: { fontSize: 15, fontWeight: '800', color: T.text },
    noBorderBottom: { borderBottomWidth: 0 },

    distContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 160, padding: 16, paddingTop: 32 },
    distBarContainer: { alignItems: 'center', flex: 1 },
    distBarVal: { fontSize: 10, fontWeight: '700', color: T.textSec, marginBottom: 4 },
    distBarBg: { width: 24, height: 100, backgroundColor: T.bg, borderRadius: 4, justifyContent: 'flex-end', overflow: 'hidden' },
    distBarFill: { width: '100%', borderRadius: 4 },
    distBarLabel: { fontSize: 10, fontWeight: '600', color: T.textMuted, marginTop: 6 },

    hardQuestionRow: { padding: 16, borderBottomWidth: 1, borderBottomColor: T.border },
    hqTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
    hqText: { flex: 1, fontSize: 14, fontWeight: '600', color: T.text, lineHeight: 20 },
    hqSub: { fontSize: 12, color: T.textSec, fontWeight: '500' },

    failureBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
    failureBadgeText: { fontSize: 10, fontWeight: '800' },

    questionRow: { borderBottomWidth: 1, borderBottomColor: T.border },
    qClickable: { padding: 16 },
    qTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    qNumBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' },
    qNumBadgeText: { fontSize: 10, fontWeight: '800', color: T.textSec },
    qText: { fontSize: 14, fontWeight: '500', color: T.text, lineHeight: 20 },
    qMiniBar: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 12, width: '100%' },
    qMiniBarSeg: { height: '100%' },
    
    qExpanded: { padding: 16, paddingTop: 0, paddingLeft: 48 },
    qStatsGrid: { flexDirection: 'row', gap: 8 },
    qStat: { flex: 1, backgroundColor: T.bg, borderRadius: 8, padding: 8, alignItems: 'center' },
    qStatLabel: { fontSize: 10, color: T.textSec, fontWeight: '600', marginBottom: 2 },
    qStatVal: { fontSize: 14, fontWeight: '800', color: T.text },

    integrityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: T.border },
    intName: { fontSize: 14, fontWeight: '700', color: T.text, marginBottom: 2 },
    intId: { fontSize: 12, color: T.textSec, fontWeight: '500' },
    intFlags: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
    intBreakdown: { fontSize: 10, color: T.textMuted, maxWidth: 120, textAlign: 'right' }
});
