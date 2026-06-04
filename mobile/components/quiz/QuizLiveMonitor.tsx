import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, Alert, Dimensions, Platform } from 'react-native';
import { Search, RefreshCw, ShieldAlert, Monitor, CheckCircle2, User, Clock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react-native';
import api from '../../services/api';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827',
  emerald: '#10b981', emeraldLight: '#d1fae5', amber: '#f59e0b', amberLight: '#fef3c7',
  red: '#ef4444', redLight: '#fee2e2', border: 'rgba(0,0,0,0.06)', shadow: 'rgba(0,0,0,0.06)',
};

interface StudentData {
    id: string;
    student: {
        id: string;
        name: string;
        humanId: string | null;
    };
    startedAt: string;
    submittedAt: string | null;
    score: number | null;
    answeredCount: number;
    totalQuestions: number;
    remainingSeconds: number;
    isTimeExpired: boolean;
    isOffline: boolean;
    cheatingEventsCount: number;
    cheatingEvents: {
        id: string;
        eventType: string;
        timestamp: string;
        metadata: any;
    }[];
}

interface MonitorData {
    quiz: {
        id: string;
        title: string;
        timeLimitMins: number;
        totalQuestions: number;
    };
    students: StudentData[];
}

interface Props {
    quizId: string;
}

const StudentTimer = ({ student, timeLimitMins }: { student: StudentData; timeLimitMins: number }) => {
    const [secondsLeft, setSecondsLeft] = useState(student.remainingSeconds);

    useEffect(() => {
        setSecondsLeft(student.remainingSeconds);
    }, [student.remainingSeconds]);

    useEffect(() => {
        if (student.submittedAt || secondsLeft <= 0) return;
        const timer = setInterval(() => setSecondsLeft(prev => Math.max(0, prev - 1)), 1000);
        return () => clearInterval(timer);
    }, [student.submittedAt, secondsLeft]);

    if (student.submittedAt) {
        return (
            <View style={[s.timerBadge, { backgroundColor: T.emeraldLight, borderColor: T.emerald }]}>
                <CheckCircle2 size={12} color={T.emerald} />
                <Text style={[s.timerText, { color: T.emerald }]}>Completed</Text>
            </View>
        );
    }

    if (secondsLeft <= 0) {
        return (
            <View style={[s.timerBadge, { backgroundColor: T.redLight, borderColor: T.red }]}>
                <Clock size={12} color={T.red} />
                <Text style={[s.timerText, { color: T.red }]}>Awaiting Auto-Submit</Text>
            </View>
        );
    }

    const minutes = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const formatted = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    
    const isCritical = secondsLeft < 60;
    const isUrgent = secondsLeft < 300;

    const bgColor = isCritical ? T.red : isUrgent ? T.amberLight : T.white;
    const textColor = isCritical ? T.white : isUrgent ? T.amber : T.text;
    const borderColor = isCritical ? T.red : isUrgent ? T.amber : T.border;

    return (
        <View style={[s.timerBadge, { backgroundColor: bgColor, borderColor: borderColor }]}>
            <Clock size={12} color={textColor} />
            <Text style={[s.timerText, { color: textColor }]}>{formatted} left</Text>
        </View>
    );
};

export default function QuizLiveMonitor({ quizId }: Props) {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<MonitorData | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'active' | 'offline' | 'completed' | 'flagged'>('all');
    const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);

    const loadData = useCallback(async (isRefresh = false) => {
        if (!isRefresh) setLoading(true);
        else setRefreshing(true);

        try {
            const res = await api.get(`/tests/online/${quizId}/monitor`);
            setData(res.data);
            setError(null);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Failed to load monitoring data');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [quizId]);

    useEffect(() => {
        loadData();
        const interval = setInterval(() => loadData(true), 5000);
        return () => clearInterval(interval);
    }, [loadData]);

    const stats = useMemo(() => {
        if (!data) return { total: 0, active: 0, offline: 0, completed: 0, flagged: 0 };
        return {
            total: data.students.length,
            active: data.students.filter(s => !s.submittedAt && !s.isOffline).length,
            offline: data.students.filter(s => !s.submittedAt && s.isOffline).length,
            completed: data.students.filter(s => s.submittedAt !== null).length,
            flagged: data.students.filter(s => s.cheatingEventsCount > 0).length
        };
    }, [data]);

    const filteredStudents = useMemo(() => {
        if (!data) return [];
        return data.students.filter(s => {
            const matchName = s.student.name.toLowerCase().includes(searchQuery.toLowerCase());
            const matchId = (s.student.humanId || '').toLowerCase().includes(searchQuery.toLowerCase());
            if (!matchName && !matchId) return false;

            switch (activeTab) {
                case 'active': return !s.submittedAt && !s.isOffline;
                case 'offline': return !s.submittedAt && s.isOffline;
                case 'completed': return s.submittedAt !== null;
                case 'flagged': return s.cheatingEventsCount > 0;
                default: return true;
            }
        });
    }, [data, searchQuery, activeTab]);

    if (loading && !data) {
        return (
            <View style={s.center}>
                <ActivityIndicator size="large" color={T.emerald} />
                <Text style={s.loadingText}>Connecting to live monitor...</Text>
            </View>
        );
    }

    if (error && !data) {
        return (
            <View style={s.center}>
                <AlertTriangle size={32} color={T.red} />
                <Text style={s.errorText}>{error}</Text>
                <TouchableOpacity style={s.retryBtn} onPress={() => loadData()}>
                    <Text style={s.retryBtnText}>Try Again</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={s.container}>
            {/* Stats Row */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.statsRow}>
                <View style={s.statCard}>
                    <Text style={s.statLabel}>ENROLLED</Text>
                    <Text style={s.statValue}>{stats.total}</Text>
                </View>
                <View style={s.statCard}>
                    <Text style={[s.statLabel, { color: T.emerald }]}>ACTIVE</Text>
                    <Text style={s.statValue}>{stats.active}</Text>
                </View>
                <View style={s.statCard}>
                    <Text style={[s.statLabel, { color: T.amber }]}>OFFLINE</Text>
                    <Text style={s.statValue}>{stats.offline}</Text>
                </View>
                <View style={s.statCard}>
                    <Text style={[s.statLabel, { color: T.textMuted }]}>COMPLETED</Text>
                    <Text style={s.statValue}>{stats.completed}</Text>
                </View>
                <View style={[s.statCard, { backgroundColor: T.redLight, borderColor: T.redLight }]}>
                    <Text style={[s.statLabel, { color: T.red }]}>FLAGGED</Text>
                    <Text style={[s.statValue, { color: T.red }]}>{stats.flagged}</Text>
                </View>
            </ScrollView>

            {/* Controls */}
            <View style={s.controlsContainer}>
                <View style={s.searchContainer}>
                    <Search size={18} color={T.textMuted} style={s.searchIcon} />
                    <TextInput
                        style={s.searchInput}
                        placeholder="Search student..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholderTextColor={T.textMuted}
                    />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabsContainer}>
                    {(['all', 'active', 'offline', 'completed', 'flagged'] as const).map(tab => (
                        <TouchableOpacity 
                            key={tab} 
                            style={[s.tab, activeTab === tab && s.tabActive]}
                            onPress={() => {
                                setActiveTab(tab);
                                Haptics.selectionAsync();
                            }}
                        >
                            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* List */}
            {filteredStudents.length === 0 ? (
                <View style={s.emptyState}>
                    <User size={32} color={T.textMuted} />
                    <Text style={s.emptyStateTitle}>No students found</Text>
                    <Text style={s.emptyStateSub}>Try tweaking your filters</Text>
                </View>
            ) : (
                <View style={s.listContainer}>
                    {filteredStudents.map(student => {
                        const isCompleted = !!student.submittedAt;
                        const hasWarnings = student.cheatingEventsCount > 0;
                        const isExpanded = expandedStudentId === student.id;
                        
                        let statusColor = T.textMuted;
                        let statusText = 'Offline';
                        if (isCompleted) { statusColor = T.emerald; statusText = 'Completed'; }
                        else if (student.isOffline) { statusColor = T.amber; statusText = 'Offline'; }
                        else { statusColor = T.emerald; statusText = 'Taking'; }

                        const progress = student.totalQuestions > 0 ? (student.answeredCount / student.totalQuestions) * 100 : 0;

                        return (
                            <View key={student.id} style={[
                                s.studentCard, 
                                hasWarnings && { borderColor: T.amberLight, backgroundColor: `${T.amberLight}40` },
                                hasWarnings && student.cheatingEventsCount >= 3 && { borderColor: T.redLight, backgroundColor: `${T.redLight}40` }
                            ]}>
                                <View style={s.studentHeader}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.studentName} numberOfLines={1}>{student.student.name}</Text>
                                        <Text style={s.studentId}>{student.student.humanId || 'No ID'}</Text>
                                    </View>
                                    <View style={[s.statusBadge, { borderColor: statusColor }]}>
                                        <View style={[s.statusDot, { backgroundColor: statusColor }]} />
                                        <Text style={[s.statusText, { color: statusColor }]}>{statusText}</Text>
                                    </View>
                                </View>

                                <View style={s.progressContainer}>
                                    <View style={s.progressHeader}>
                                        <Text style={s.progressLabel}>Progress</Text>
                                        <Text style={s.progressValue}>{student.answeredCount} / {student.totalQuestions} Answered</Text>
                                    </View>
                                    <View style={s.progressBarBg}>
                                        <View style={[s.progressBarFill, { width: `${progress}%`, backgroundColor: isCompleted ? T.emerald : T.accent }]} />
                                    </View>
                                </View>

                                <View style={s.metricsRow}>
                                    <StudentTimer student={student} timeLimitMins={data?.quiz.timeLimitMins || 0} />
                                    {isCompleted && student.score !== null && (
                                        <View style={s.scoreContainer}>
                                            <Text style={s.scoreLabel}>Score</Text>
                                            <Text style={s.scoreValue}>{student.score.toFixed(1)}</Text>
                                        </View>
                                    )}
                                </View>

                                {hasWarnings && (
                                    <View style={s.warningsContainer}>
                                        <TouchableOpacity 
                                            style={[s.warningBtn, student.cheatingEventsCount >= 3 ? s.warningBtnSevere : s.warningBtnModerate]}
                                            onPress={() => {
                                                setExpandedStudentId(isExpanded ? null : student.id);
                                                Haptics.selectionAsync();
                                            }}
                                        >
                                            <View style={s.warningBtnLeft}>
                                                <ShieldAlert size={14} color={student.cheatingEventsCount >= 3 ? T.red : T.amber} />
                                                <Text style={[s.warningBtnText, { color: student.cheatingEventsCount >= 3 ? T.red : T.amber }]}>
                                                    Flags: {student.cheatingEventsCount}
                                                </Text>
                                            </View>
                                            {isExpanded ? <ChevronUp size={14} color={T.textSec} /> : <ChevronDown size={14} color={T.textSec} />}
                                        </TouchableOpacity>

                                        {isExpanded && (
                                            <View style={s.warningLogs}>
                                                {student.cheatingEvents.map(evt => (
                                                    <View key={evt.id} style={s.logItem}>
                                                        <View style={s.logHeader}>
                                                            <Text style={s.logType}>{evt.eventType.replace('_', ' ')}</Text>
                                                            <Text style={s.logTime}>{new Date(evt.timestamp).toLocaleTimeString()}</Text>
                                                        </View>
                                                        {evt.metadata?.hiddenAt && (
                                                            <Text style={s.logMeta}>
                                                                Away at {new Date(evt.metadata.hiddenAt).toLocaleTimeString()}
                                                            </Text>
                                                        )}
                                                    </View>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: T.white, borderRadius: 16, borderWidth: 1, borderColor: T.border, overflow: 'hidden' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, minHeight: 300 },
    loadingText: { marginTop: 12, fontSize: 14, color: T.textSec, fontWeight: '600' },
    errorText: { marginTop: 12, fontSize: 16, color: T.red, fontWeight: '700', textAlign: 'center' },
    retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: T.emerald, borderRadius: 12 },
    retryBtnText: { color: T.white, fontWeight: '700', fontSize: 14 },
    
    statsRow: { padding: 16, paddingBottom: 8, gap: 10 },
    statCard: { 
        padding: 12, backgroundColor: T.white, borderRadius: 12, borderWidth: 1, borderColor: T.border,
        minWidth: 90, alignItems: 'center', justifyContent: 'center'
    },
    statLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, color: T.textSec, marginBottom: 4 },
    statValue: { fontSize: 20, fontWeight: '800', color: T.text },

    controlsContainer: { paddingHorizontal: 16, paddingBottom: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: T.border },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.bg, borderRadius: 12, paddingHorizontal: 12, height: 44 },
    searchIcon: { marginRight: 8 },
    searchInput: { flex: 1, fontSize: 14, color: T.text, fontWeight: '500' },
    
    tabsContainer: { gap: 8 },
    tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: T.bg },
    tabActive: { backgroundColor: T.accent },
    tabText: { fontSize: 12, fontWeight: '700', color: T.textSec },
    tabTextActive: { color: T.white },

    emptyState: { alignItems: 'center', justifyContent: 'center', padding: 40 },
    emptyStateTitle: { fontSize: 16, fontWeight: '700', color: T.text, marginTop: 12 },
    emptyStateSub: { fontSize: 13, color: T.textSec, marginTop: 4 },

    listContainer: { padding: 16, gap: 12 },
    studentCard: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: T.border, backgroundColor: T.white },
    studentHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
    studentName: { fontSize: 16, fontWeight: '700', color: T.text },
    studentId: { fontSize: 12, fontWeight: '600', color: T.textSec, marginTop: 2 },
    
    statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 100, borderWidth: 1, backgroundColor: T.white },
    statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
    statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },

    progressContainer: { marginBottom: 16 },
    progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    progressLabel: { fontSize: 12, fontWeight: '600', color: T.textSec },
    progressValue: { fontSize: 12, fontWeight: '700', color: T.text },
    progressBarBg: { height: 6, backgroundColor: T.bg, borderRadius: 3, overflow: 'hidden' },
    progressBarFill: { height: '100%', borderRadius: 3 },

    metricsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: T.border, paddingTop: 12 },
    
    timerBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, gap: 6 },
    timerText: { fontSize: 12, fontWeight: '700' },
    
    scoreContainer: { alignItems: 'flex-end' },
    scoreLabel: { fontSize: 9, fontWeight: '800', color: T.textSec, textTransform: 'uppercase' },
    scoreValue: { fontSize: 18, fontWeight: '800', color: T.emerald },

    warningsContainer: { marginTop: 12, borderTopWidth: 1, borderTopColor: T.border, paddingTop: 12 },
    warningBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
    warningBtnModerate: { backgroundColor: T.amberLight, borderColor: T.amber },
    warningBtnSevere: { backgroundColor: T.redLight, borderColor: T.red },
    warningBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    warningBtnText: { fontSize: 12, fontWeight: '700' },
    
    warningLogs: { marginTop: 8, backgroundColor: T.bg, borderRadius: 10, padding: 12, gap: 8 },
    logItem: { borderBottomWidth: 1, borderBottomColor: T.border, paddingBottom: 8 },
    logHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    logType: { fontSize: 11, fontWeight: '700', color: T.red, textTransform: 'capitalize' },
    logTime: { fontSize: 10, color: T.textSec, fontWeight: '500' },
    logMeta: { fontSize: 10, color: T.textSec }
});
