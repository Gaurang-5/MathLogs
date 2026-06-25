import { useEffect, useMemo, useState } from 'react';
import { X, BarChart3, Loader, ShieldAlert, TrendingUp, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis
} from 'recharts';
import { api } from '../utils/api';

interface QuizAnalyticsData {
    quiz: {
        id: string;
        title: string;
        totalMarks: number;
    };
    stats: {
        totalSubmissions: number;
        averageScore: number;
        highestScore: number;
        lowestScore: number;
    };
    scoreDistribution: { label: string; count: number }[];
    questionDifficulty: {
        id: string;
        questionText: string;
        orderIndex: number;
        marks: number;
        attempts: number;
        correctCount: number;
        incorrectCount: number;
        failureRate: number;
    }[];
    integrityReport: {
        studentId: string;
        studentName: string;
        humanId?: string | null;
        totalFlags: number;
        eventBreakdown: Record<string, number>;
    }[];
}

interface QuizAnalyticsProps {
    quizId: string;
    onClose?: () => void;
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="bg-white border border-black/5 rounded-2xl p-3 sm:p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-app-text-tertiary">{label}</p>
            <p className="text-xl sm:text-2xl font-black text-app-text mt-1 leading-tight">{value}</p>
        </div>
    );
}

function FailureBadge({ rate }: { rate: number }) {
    const color = rate >= 70 ? 'bg-rose-100 text-rose-700 border-rose-200' :
                  rate >= 40 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  'bg-emerald-50 text-emerald-700 border-emerald-200';
    return (
        <span className={`text-[10px] font-black border px-2 py-0.5 rounded-full shrink-0 ${color}`}>
            {rate}%
        </span>
    );
}

function QuestionAnalyticsTable({ questions }: { questions: QuizAnalyticsData['questionDifficulty'] }) {
    const [expanded, setExpanded] = useState<string | null>(null);
    // Sort by failure rate descending
    const sorted = useMemo(() => [...questions].sort((a, b) => b.failureRate - a.failureRate), [questions]);

    if (sorted.length === 0) {
        return <p className="text-sm text-app-text-secondary p-4">No question data available yet.</p>;
    }

    return (
        <div className="divide-y divide-black/[0.04]">
            {sorted.map((q, idx) => {
                const isOpen = expanded === q.id;
                const barCorrect = q.attempts > 0 ? Math.round((q.correctCount / q.attempts) * 100) : 0;
                const barWrong = 100 - barCorrect;
                const didNotAttempt = q.attempts === 0;

                return (
                    <div key={q.id} className={`transition-colors ${q.failureRate >= 70 ? 'bg-rose-50/20' : ''}`}>
                        <button
                            className="w-full px-3 sm:px-4 py-3 flex items-start gap-3 text-left hover:bg-black/[0.02] transition-colors"
                            onClick={() => setExpanded(isOpen ? null : q.id)}
                        >
                            {/* Rank badge */}
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5 ${
                                idx === 0 ? 'bg-rose-100 text-rose-700' :
                                idx === 1 ? 'bg-amber-100 text-amber-700' :
                                idx === 2 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-neutral-100 text-neutral-500'
                            }`}>
                                {idx + 1}
                            </span>

                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-app-text line-clamp-2 leading-snug">
                                    {q.questionText}
                                </p>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 mt-1.5">
                                    {/* Correct/Incorrect mini bar */}
                                    {q.attempts > 0 ? (
                                        <div className="flex h-1.5 w-full sm:w-32 rounded-full overflow-hidden bg-neutral-100">
                                            <div
                                                className="bg-emerald-400 transition-all"
                                                style={{ width: `${barCorrect}%` }}
                                            />
                                            <div
                                                className="bg-rose-400 transition-all"
                                                style={{ width: `${barWrong}%` }}
                                            />
                                        </div>
                                    ) : (
                                        <span className="text-[10px] text-neutral-400 font-semibold">No attempts</span>
                                    )}
                                    <span className="text-[10px] text-app-text-tertiary font-medium">
                                        {q.correctCount}✓ · {q.incorrectCount}✗ · {q.attempts} tried
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0 ml-1 sm:ml-2">
                                <FailureBadge rate={q.failureRate} />
                                {isOpen ? <ChevronUp className="w-4 h-4 text-neutral-400" /> : <ChevronDown className="w-4 h-4 text-neutral-400" />}
                            </div>
                        </button>

                        {isOpen && (
                            <div className="px-3 sm:px-4 pb-4 sm:pl-13 sm:ml-9">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                                    {[
                                        { label: 'Total Attempts', value: q.attempts },
                                        { label: 'Correct', value: q.correctCount, color: 'text-emerald-600' },
                                        { label: 'Incorrect', value: q.incorrectCount, color: 'text-rose-600' },
                                        { label: 'Marks', value: q.marks }
                                    ].map(stat => (
                                        <div key={stat.label} className="bg-neutral-50 border border-neutral-100 rounded-xl p-3 text-center">
                                            <p className="text-xs text-app-text-tertiary font-medium">{stat.label}</p>
                                            <p className={`text-xl font-black mt-0.5 ${stat.color || 'text-app-text'}`}>{stat.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Correct vs wrong visual bar */}
                                {!didNotAttempt && (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-emerald-600 w-20">Correct</span>
                                            <div className="flex-1 bg-neutral-100 rounded-full h-2">
                                                <div
                                                    className="bg-emerald-400 h-2 rounded-full transition-all"
                                                    style={{ width: `${barCorrect}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-bold text-emerald-600 w-10 text-right">{barCorrect}%</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-rose-600 w-20">Wrong</span>
                                            <div className="flex-1 bg-neutral-100 rounded-full h-2">
                                                <div
                                                    className="bg-rose-400 h-2 rounded-full transition-all"
                                                    style={{ width: `${barWrong}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-bold text-rose-600 w-10 text-right">{barWrong}%</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default function QuizAnalytics({ quizId, onClose }: QuizAnalyticsProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<QuizAnalyticsData | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'questions' | 'integrity'>('overview');

    useEffect(() => {
        let active = true;
        const loadAnalytics = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await api.get<QuizAnalyticsData>(`/tests/online/${quizId}/analytics`);
                if (active) setData(response);
            } catch (err) {
                if (active) setError(err instanceof Error ? err.message : 'Failed to load analytics');
            } finally {
                if (active) setLoading(false);
            }
        };

        loadAnalytics();
        return () => { active = false; };
    }, [quizId]);

    const topHardestQuestions = useMemo(() => data?.questionDifficulty.slice(0, 3) || [], [data]);

    const BAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];

    const activeContent = (
        <div className="flex-1 overflow-y-auto min-h-0 bg-neutral-50 scrollbar-thin">
            {!data || data.stats.totalSubmissions === 0 ? (
                <div className="py-20 text-center bg-white rounded-2xl border border-black/5 m-5">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                        <TrendingUp className="w-7 h-7" />
                    </div>
                    <h3 className="font-black text-lg mt-4 text-app-text">No submissions yet</h3>
                    <p className="text-sm text-app-text-secondary mt-1">Analytics will appear once students submit this quiz.</p>
                </div>
            ) : (
                <div className="p-5 space-y-5">
                    {/* Metric row */}
                    <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <MetricCard label="Average Score" value={`${data.stats.averageScore}/${data.quiz.totalMarks}`} />
                        <MetricCard label="Submissions" value={data.stats.totalSubmissions} />
                        <MetricCard label="Highest" value={data.stats.highestScore} />
                        <MetricCard label="Lowest" value={data.stats.lowestScore} />
                    </section>

                    {/* Tab bar */}
                    <div className="flex gap-1 bg-neutral-100 p-1 rounded-xl w-full max-w-sm">
                        {(['overview', 'questions', 'integrity'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg capitalize transition-all ${
                                    activeTab === tab
                                        ? 'bg-white text-app-text shadow-sm'
                                        : 'text-app-text-tertiary hover:text-app-text'
                                }`}
                            >
                                {tab === 'questions' ? 'Per Question' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Overview tab */}
                    {activeTab === 'overview' && (
                        <section className="space-y-5">
                            <div className="bg-white border border-black/5 rounded-2xl p-5 shadow-sm">
                                <div className="flex items-center justify-between gap-4 mb-4">
                                    <h3 className="font-black text-app-text">Score Distribution</h3>
                                    <span className="text-xs font-bold text-app-text-tertiary">Percentage bands</span>
                                </div>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data.scoreDistribution}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f4" />
                                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} />
                                            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6b7280' }} />
                                            <Tooltip cursor={{ fill: '#f0fdf4' }} />
                                            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                                                {data.scoreDistribution.map((_, i) => (
                                                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Top 3 hardest */}
                            <div className="bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden">
                                <div className="px-5 py-4 border-b border-black/5">
                                    <h3 className="font-black text-app-text">Top 3 Hardest Questions</h3>
                                    <p className="text-xs text-app-text-secondary mt-0.5">Ranked by failure rate</p>
                                </div>
                                <div className="divide-y divide-black/5">
                                    {topHardestQuestions.map((question, index) => {
                                        const isCritical = question.failureRate >= 50;
                                        return (
                                            <div key={question.id} className={`p-4 ${isCritical ? 'bg-red-50/30' : ''}`}>
                                                <div className="flex items-start justify-between gap-3">
                                                    <p className="font-bold text-sm text-app-text leading-snug">
                                                        {index + 1}. {question.questionText}
                                                    </p>
                                                    <FailureBadge rate={question.failureRate} />
                                                </div>
                                                <p className="text-xs text-app-text-tertiary mt-2">
                                                    {question.incorrectCount} wrong · {question.correctCount} correct · {question.attempts} attempts
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Per Question tab */}
                    {activeTab === 'questions' && (
                        <section className="bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-black/5 flex items-center gap-2">
                                <BookOpen className="w-4 h-4 text-emerald-600" />
                                <div>
                                    <h3 className="font-black text-app-text">Question-wise Breakdown</h3>
                                    <p className="text-xs text-app-text-secondary mt-0.5">
                                        {data.questionDifficulty.length} questions · sorted by failure rate · click to expand
                                    </p>
                                </div>
                            </div>
                            <QuestionAnalyticsTable questions={data.questionDifficulty} />
                        </section>
                    )}

                    {/* Integrity tab */}
                    {activeTab === 'integrity' && (
                        <section className="bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-black/5 flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4 text-red-500" />
                                <div>
                                    <h3 className="font-black text-app-text">Integrity & Proctoring Report</h3>
                                    <p className="text-xs text-app-text-secondary mt-0.5">Students with recorded flags</p>
                                </div>
                            </div>
                            {data.integrityReport.length === 0 ? (
                                <div className="p-6 text-sm text-app-text-secondary">No cheating flags recorded. ✓</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-neutral-50 text-xs uppercase text-app-text-tertiary border-b border-black/5">
                                            <tr>
                                                <th className="text-left px-4 py-3">Student</th>
                                                <th className="text-left px-4 py-3">Flags</th>
                                                <th className="text-left px-4 py-3">Breakdown</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black/5">
                                            {data.integrityReport.map((student) => (
                                                <tr key={student.studentId} className={student.totalFlags >= 3 ? 'bg-rose-50/50' : ''}>
                                                    <td className="px-4 py-3 font-bold text-app-text">{student.studentName}</td>
                                                    <td className="px-4 py-3">
                                                        <span className={`font-black ${student.totalFlags >= 3 ? 'text-rose-600' : 'text-amber-600'}`}>
                                                            {student.totalFlags}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-app-text-secondary text-xs">
                                                        {Object.entries(student.eventBreakdown).map(([type, count]) => `${type}: ${count}`).join(', ')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    )}
                </div>
            )}
        </div>
    );

    if (onClose) {
        return (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm p-4 overflow-y-auto flex items-center justify-center">
                <div className="w-full max-w-6xl bg-neutral-50 border border-black/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[85vh]">
                    <header className="bg-white border-b border-black/5 px-6 py-4 flex items-center justify-between gap-4 shrink-0">
                        <div className="min-w-0">
                            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4" />
                                Quiz Analytics
                            </p>
                            <h2 className="text-lg font-black text-app-text truncate">{data?.quiz.title || 'Online Quiz'}</h2>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-neutral-100 text-app-text-secondary">
                            <X className="w-5 h-5" />
                        </button>
                    </header>

                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader className="w-8 h-8 animate-spin text-emerald-600" />
                        </div>
                    ) : error ? (
                        <div className="p-8 text-center">
                            <p className="font-bold text-rose-600">{error}</p>
                        </div>
                    ) : activeContent}
                </div>
            </div>
        );
    }

    return (
        <div className="border border-black/5 rounded-xl overflow-hidden flex flex-col h-[70vh]">
            {loading ? (
                <div className="flex-1 flex items-center justify-center bg-white">
                    <Loader className="w-8 h-8 animate-spin text-emerald-600" />
                </div>
            ) : error ? (
                <div className="p-8 text-center bg-white">
                    <p className="font-bold text-rose-600">{error}</p>
                </div>
            ) : activeContent}
        </div>
    );
}
