import { useEffect, useState, useMemo } from 'react';
import { X, Loader, Search, RefreshCw, ShieldAlert, Monitor, CheckCircle2, User, Clock, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';

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

interface QuizLiveMonitorProps {
    quizId: string;
    onClose?: () => void;
}

// Live ticking timer for a single student card
function StudentTimer({ student, timeLimitMins }: { student: StudentData; timeLimitMins: number }) {
    const [secondsLeft, setSecondsLeft] = useState(student.remainingSeconds);

    useEffect(() => {
        setSecondsLeft(student.remainingSeconds);
    }, [student.remainingSeconds]);

    useEffect(() => {
        if (student.submittedAt || secondsLeft <= 0) return;

        const timer = setInterval(() => {
            setSecondsLeft((prev) => Math.max(0, prev - 1));
        }, 1000);

        return () => clearInterval(timer);
    }, [student.submittedAt, secondsLeft]);

    if (student.submittedAt) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Completed
            </span>
        );
    }

    if (secondsLeft <= 0) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100 animate-pulse">
                <Clock className="w-3.5 h-3.5" />
                Awaiting Auto-Submit
            </span>
        );
    }

    const minutes = Math.floor(secondsLeft / 60);
    const secs = secondsLeft % 60;
    const formatted = `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const isUrgent = secondsLeft < 300; // < 5 minutes
    const isCritical = secondsLeft < 60; // < 1 minute

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
            isCritical
                ? 'bg-rose-600 text-white border-rose-700 animate-pulse'
                : isUrgent
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-neutral-100 text-neutral-700 border border-neutral-200'
        }`}>
            <Clock className="w-3.5 h-3.5" />
            {formatted} left
        </span>
    );
}

export default function QuizLiveMonitor({ quizId, onClose }: QuizLiveMonitorProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<MonitorData | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'active' | 'offline' | 'completed' | 'flagged'>('all');
    const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const loadMonitorData = async (silent = false) => {
        if (!silent) setLoading(true);
        else setIsRefreshing(true);
        try {
            const res = await api.get<MonitorData>(`/tests/online/${quizId}/monitor`);
            setData(res);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load monitoring data');
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    // Auto-refresh every 5 seconds for absolute live accuracy
    useEffect(() => {
        loadMonitorData();

        const interval = setInterval(() => {
            loadMonitorData(true);
        }, 5000);

        return () => clearInterval(interval);
    }, [quizId]);

    // Statistics aggregation
    const stats = useMemo(() => {
        if (!data) return { total: 0, active: 0, offline: 0, completed: 0, flagged: 0 };
        const students = data.students;
        return {
            total: students.length,
            active: students.filter((s) => !s.submittedAt && !s.isOffline).length,
            offline: students.filter((s) => !s.submittedAt && s.isOffline).length,
            completed: students.filter((s) => s.submittedAt !== null).length,
            flagged: students.filter((s) => s.cheatingEventsCount > 0).length
        };
    }, [data]);

    // Filter students
    const filteredStudents = useMemo(() => {
        if (!data) return [];
        return data.students.filter((student) => {
            const nameMatch = student.student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (student.student.humanId || '').toLowerCase().includes(searchQuery.toLowerCase());

            if (!nameMatch) return false;

            switch (activeTab) {
                case 'active':
                    return !student.submittedAt && !student.isOffline;
                case 'offline':
                    return !student.submittedAt && student.isOffline;
                case 'completed':
                    return student.submittedAt !== null;
                case 'flagged':
                    return student.cheatingEventsCount > 0;
                default:
                    return true;
            }
        });
    }, [data, searchQuery, activeTab]);

    const activeContent = (
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            {/* Stats Dashboard Row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3 p-3 sm:p-6 bg-neutral-50 border-b border-neutral-200/80 shrink-0">
                <div className="bg-white border border-neutral-200/60 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col shadow-sm shadow-black/[0.005]">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Total Enrolled</span>
                    <span className="text-xl sm:text-2xl font-black mt-1 text-neutral-900">{stats.total}</span>
                </div>
                <div className="bg-white border border-neutral-200/60 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col shadow-sm shadow-black/[0.005]">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        Active Taking
                    </span>
                    <span className="text-xl sm:text-2xl font-black mt-1 text-neutral-900">{stats.active}</span>
                </div>
                <div className="bg-white border border-neutral-200/60 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col shadow-sm shadow-black/[0.005]">
                    <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                        Offline
                    </span>
                    <span className="text-xl sm:text-2xl font-black mt-1 text-neutral-900">{stats.offline}</span>
                </div>
                <div className="bg-white border border-neutral-200/60 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col shadow-sm shadow-black/[0.005]">
                    <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400"></span>
                        Completed
                    </span>
                    <span className="text-xl sm:text-2xl font-black mt-1 text-neutral-900">{stats.completed}</span>
                </div>
                <div className="bg-white border border-rose-200/60 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col col-span-2 md:col-span-1 bg-rose-50/60 shadow-sm shadow-black/[0.005]">
                    <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                        Security Flagged
                    </span>
                    <span className="text-xl sm:text-2xl font-black mt-1 text-rose-700">{stats.flagged}</span>
                </div>
            </div>

            {/* Search & Tabs Row */}
            <div className="px-3 sm:px-6 py-3 sm:py-4 bg-neutral-50/50 border-b border-neutral-200/80 flex flex-col md:flex-row items-stretch md:items-center gap-3 sm:gap-4 shrink-0 justify-between">
                {/* Search bar */}
                <div className="relative w-full md:max-w-xs">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                        type="text"
                        placeholder="Search student..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full min-h-11 pl-10 pr-4 py-2 rounded-xl bg-white border border-neutral-200 text-sm text-neutral-800 placeholder-neutral-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                    />
                </div>

                {/* Tabs */}
                <div className="flex bg-neutral-100 p-1 rounded-xl border border-neutral-200/60 overflow-x-auto w-full md:w-auto">
                    {(['all', 'active', 'offline', 'completed', 'flagged'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all shrink-0 ${
                                activeTab === tab
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'text-neutral-500 hover:text-neutral-800'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Student Grid */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-6 bg-neutral-50/30 scrollbar-thin">
                {filteredStudents.length === 0 ? (
                    <div className="text-center py-16 text-neutral-400">
                        <User className="w-12 h-12 mx-auto mb-3 opacity-20 text-neutral-400" />
                        <p className="font-semibold text-lg text-neutral-800">No students found</p>
                        <p className="text-xs text-neutral-400 mt-1">Try tweaking your search or selected filters.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                        {filteredStudents.map((student) => {
                            const total = student.totalQuestions;
                            const progress = total > 0 ? (student.answeredCount / total) * 100 : 0;
                            const hasWarnings = student.cheatingEventsCount > 0;
                            const isExpanded = expandedStudentId === student.id;

                            // Status calculation helper
                            let statusColor = 'bg-neutral-500';
                            let statusText = 'Offline';

                            if (student.submittedAt) {
                                statusColor = 'bg-emerald-500';
                                statusText = 'Completed';
                            } else if (student.isOffline) {
                                statusColor = 'bg-amber-500';
                                statusText = 'Offline';
                            } else {
                                statusColor = 'bg-emerald-400 animate-pulse';
                                statusText = 'Taking';
                            }

                            return (
                                <div
                                    key={student.id}
                                    className={`bg-white border rounded-2xl p-4 sm:p-5 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden flex flex-col gap-3 sm:gap-4 ${
                                        hasWarnings && student.cheatingEventsCount >= 3
                                            ? 'border-rose-300 shadow-rose-100/50 bg-rose-50/10'
                                            : hasWarnings
                                            ? 'border-amber-300 bg-amber-50/5'
                                            : 'border-neutral-200/80'
                                    }`}
                                >
                                    {/* Card Header */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <h3 className="font-black text-neutral-900 text-base leading-tight truncate">
                                                {student.student.name}
                                            </h3>
                                            <p className="text-xs font-bold text-neutral-500 mt-0.5">
                                                {student.student.humanId || 'No ID'}
                                            </p>
                                        </div>
                                        
                                        {/* Connection Badge */}
                                        <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-neutral-50 border border-neutral-200/60 text-[10px] font-bold text-neutral-600 shrink-0">
                                            <span className={`w-2 h-2 rounded-full ${statusColor}`} />
                                            {statusText}
                                        </div>
                                    </div>

                                    {/* Progress Stats */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between text-xs font-semibold">
                                            <span className="text-neutral-500">Progress</span>
                                            <span className="text-neutral-800">
                                                {student.answeredCount} / {total} Answered
                                            </span>
                                        </div>
                                        <div className="w-full bg-neutral-100 h-2 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-500 ${
                                                    student.submittedAt ? 'bg-emerald-500' : 'bg-emerald-600'
                                                }`}
                                                style={{ width: `${progress}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Live metrics / scores */}
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3.5 mt-1 shrink-0">
                                        <StudentTimer student={student} timeLimitMins={data.quiz.timeLimitMins} />
                                        
                                        {student.submittedAt && student.score !== null ? (
                                            <div className="text-right shrink-0">
                                                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest block">Score</span>
                                                <span className="text-lg font-black text-emerald-600">{student.score.toFixed(1)} marks</span>
                                            </div>
                                        ) : null}
                                    </div>

                                    {/* Warnings Banner / Events */}
                                    {hasWarnings ? (
                                        <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
                                            <button
                                                onClick={() => setExpandedStudentId(isExpanded ? null : student.id)}
                                                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                                                    student.cheatingEventsCount >= 3
                                                        ? 'bg-rose-50 text-rose-700 hover:bg-rose-100/60 border border-rose-100'
                                                        : 'bg-amber-50 text-amber-700 hover:bg-amber-100/60 border border-amber-100'
                                                }`}
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <ShieldAlert className="w-4 h-4" />
                                                    Cheating Flags: {student.cheatingEventsCount}
                                                </span>
                                                <span className="text-[10px] underline">
                                                    {isExpanded ? 'Hide logs' : 'View logs'}
                                                </span>
                                            </button>

                                            {isExpanded && (
                                                <div className="bg-neutral-50 border border-neutral-200/60 rounded-xl p-2.5 flex flex-col gap-1.5 max-h-40 overflow-y-auto scrollbar-thin">
                                                    {student.cheatingEvents.map((evt) => (
                                                        <div key={evt.id} className="text-[11px] leading-tight border-b border-neutral-200/40 pb-1.5 last:border-0 last:pb-0">
                                                            <div className="flex justify-between font-semibold text-rose-700">
                                                                <span>{evt.eventType.replace('_', ' ')}</span>
                                                                <span className="text-neutral-400">
                                                                    {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                                </span>
                                                            </div>
                                                            {evt.metadata?.hiddenAt && (
                                                                <span className="text-neutral-400 text-[10px] block mt-0.5">
                                                                    Switched away at {new Date(evt.metadata.hiddenAt).toLocaleTimeString()}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );

    if (onClose) {
        return (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-md p-2 sm:p-4 overflow-y-auto flex items-center justify-center">
                <div className="w-full max-w-6xl bg-white border border-neutral-200/80 rounded-2xl shadow-xl overflow-hidden text-neutral-800 flex flex-col h-[92vh] sm:h-[85vh]">
                    {/* Header */}
                    <header className="bg-neutral-50 border-b border-neutral-200/60 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-4 shrink-0">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-600">
                                <Monitor className="w-4 h-4" />
                                Live Exam Monitor
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                            </div>
                            <h2 className="text-lg font-black truncate text-neutral-900 mt-0.5">
                                {data?.quiz.title || 'Online Quiz Session'}
                            </h2>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => loadMonitorData(true)}
                                disabled={isRefreshing}
                                className="p-2 rounded-full bg-neutral-100 hover:bg-neutral-200/80 text-neutral-600 disabled:opacity-50 transition-all"
                                title="Refresh"
                            >
                                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full bg-neutral-100 hover:bg-neutral-200/80 text-neutral-500 transition-all"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </header>

                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-white">
                            <Loader className="w-8 h-8 animate-spin text-emerald-500" />
                            <p className="text-sm text-neutral-500 font-medium">Connecting to live testing server...</p>
                        </div>
                    ) : error ? (
                        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4 bg-white">
                            <AlertTriangle className="w-12 h-12 text-rose-500" />
                            <p className="font-bold text-rose-600 text-lg">{error}</p>
                            <button
                                onClick={() => loadMonitorData()}
                                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : activeContent}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white border border-neutral-200/80 rounded-2xl shadow-sm overflow-hidden text-neutral-800 flex flex-col min-h-[60vh] md:h-[70vh]">
            {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 bg-white">
                    <Loader className="w-8 h-8 animate-spin text-emerald-500" />
                    <p className="text-sm text-neutral-500 font-medium">Connecting to live testing server...</p>
                </div>
            ) : error ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4 bg-white">
                    <AlertTriangle className="w-12 h-12 text-rose-600" />
                    <p className="font-bold text-rose-600 text-lg">{error}</p>
                </div>
            ) : activeContent}
        </div>
    );
}
