import { useState, useEffect, useRef } from 'react';
import { API_URL, apiRequest } from '../utils/api';
import Layout from '../components/Layout';
import {
    Sparkles,
    Timer,
    Users,
    BarChart3,
    Download,
    LockKeyhole,
    FileText,
    Monitor,
    ArrowLeft,
    CheckCircle,
    Clock,
    Eye,
    UserX,
    Trash2,
    Edit3,
    CalendarDays,
    X,
    Link2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AITestGeneratorModal from '../components/AITestGeneratorModal';
import QuizAnalytics from '../components/QuizAnalytics';
import QuizLiveMonitor from '../components/QuizLiveMonitor';
import toast from 'react-hot-toast';

interface QuizAnswer {
    questionId: string;
    selectedOption: string | null;
    isCorrect: boolean;
    marksObtained: number;
}

interface QuizSubmission {
    id: string;
    studentId: string;
    startedAt: string | null;
    submittedAt: string | null;
    score: number | null;
    answers?: QuizAnswer[];
    shuffledQuestions?: any;
}

interface QuizQuestion {
    id: string;
    questionText: string;
    orderIndex: number;
    options: any;
    correctOption: string;
    marks: number;
    variantGroup?: string | null;
}

interface OnlineQuiz {
    id: string;
    title: string;
    topic?: string | null;
    difficulty?: string | null;
    timeLimitMins: number;
    totalMarks: number;
    availableFrom?: string | null;
    availableUntil?: string | null;
    isFinalized: boolean;
    createdAt: string;
    batchId?: string | null;
    studentQuestionCount?: number | null;
    batch?: {
        id?: string;
        name: string;
        className?: string | null;
        students: {
            id: string;
            name: string;
            humanId: string | null;
        }[];
    };
    questions?: QuizQuestion[];
    submissions: QuizSubmission[];
    _count: { submissions: number };
}

interface Batch {
    id: string;
    name: string;
    className: string;
    subject: string;
}

function formatLocalDateTimeInput(date: Date) {
    const offsetMs = date.getTimezoneOffset() * 60 * 1000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

// Returns true when the quiz's availableFrom is within 10 minutes from now or has already passed
function isEditDeleteLocked(quiz: OnlineQuiz): boolean {
    if (!quiz.availableFrom) return false;
    const now = new Date();
    const startTime = new Date(quiz.availableFrom);
    return (startTime.getTime() - now.getTime()) <= 10 * 60 * 1000;
}

function hasSubmissions(quiz: OnlineQuiz): boolean {
    return (quiz._count?.submissions || 0) > 0;
}

export default function QuizList() {
    const [onlineQuizzes, setOnlineQuizzes] = useState<OnlineQuiz[]>([]);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAIModal, setShowAIModal] = useState(false);
    const [finalizingQuizId, setFinalizingQuizId] = useState<string | null>(null);
    const [instituteSlug, setInstituteSlug] = useState<string | null>(null);
    const isQuizOnly = localStorage.getItem('isQuizOnly') === 'true';

    // Active Selected Quiz & Current Cockpit Tab
    const [activeQuiz, setActiveQuiz] = useState<OnlineQuiz | null>(null);
    const activeQuizRef = useRef<OnlineQuiz | null>(null);

    const changeActiveQuiz = (quiz: OnlineQuiz | null) => {
        activeQuizRef.current = quiz;
        setActiveQuiz(quiz);
    };

    const [activeTab, setActiveTab] = useState<'monitor' | 'analytics' | 'submissions'>('monitor');

    // Quiz editing
    const [quizToEdit, setQuizToEdit] = useState<OnlineQuiz | null>(null);

    // Finalize confirmation modal
    const [finalizeConfirmQuiz, setFinalizeConfirmQuiz] = useState<OnlineQuiz | null>(null);

    // Delete confirmation modal
    const [deleteConfirmQuiz, setDeleteConfirmQuiz] = useState<OnlineQuiz | null>(null);
    const [deletingQuizId, setDeletingQuizId] = useState<string | null>(null);

    // Reschedule modal state
    const [showReschedule, setShowReschedule] = useState(false);
    const [rescheduleFrom, setRescheduleFrom] = useState('');
    const [rescheduleUntil, setRescheduleUntil] = useState('');
    const [rescheduling, setRescheduling] = useState(false);

    // Slide-over Drawer for Student Submission inspection
    const [selectedStudentSub, setSelectedStudentSub] = useState<{
        studentName: string;
        studentId: string;
        humanId: string | null;
        submission: QuizSubmission | null;
    } | null>(null);

    const fetchData = async () => {
        try {
            const [quizzesData, batchesData, instituteData] = await Promise.all([
                apiRequest<OnlineQuiz[]>('/tests/online'),
                apiRequest<Batch[]>('/batches'),
                apiRequest<any>('/institute/me').catch(() => null)
            ]);
            setOnlineQuizzes(quizzesData);
            setBatches(batchesData);
            if (instituteData?.slug) {
                setInstituteSlug(instituteData.slug);
            }

            const currentActive = activeQuizRef.current;
            if (currentActive) {
                const refreshedActive = quizzesData.find(q => q.id === currentActive.id);
                if (refreshedActive) changeActiveQuiz(refreshedActive);
            }
        } catch (error) {
            console.error('Failed to fetch quizzes data:', error);
            toast.error('Failed to load quizzes');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const refreshOnlineQuizzes = async () => {
        try {
            const quizzesData = await apiRequest<OnlineQuiz[]>('/tests/online');
            setOnlineQuizzes(quizzesData);
            const currentActive = activeQuizRef.current;
            if (currentActive) {
                const refreshedActive = quizzesData.find(q => q.id === currentActive.id);
                if (refreshedActive) changeActiveQuiz(refreshedActive);
            }
        } catch (error) {
            console.error('Failed to refresh quizzes:', error);
        }
    };

    const openReschedule = (quiz: OnlineQuiz) => {
        setRescheduleFrom(quiz.availableFrom ? formatLocalDateTimeInput(new Date(quiz.availableFrom)) : '');
        setRescheduleUntil(quiz.availableUntil ? formatLocalDateTimeInput(new Date(quiz.availableUntil)) : '');
        setShowReschedule(true);
    };

    const handleReschedule = async () => {
        if (!activeQuiz) return;

        const fromDate = new Date(rescheduleFrom);
        const untilDate = new Date(rescheduleUntil);
        const now = new Date();
        const tenMinsFromNow = new Date(now.getTime() + 10 * 60 * 1000);

        if (Number.isNaN(fromDate.getTime()) || Number.isNaN(untilDate.getTime())) {
            toast.error('Please enter valid dates');
            return;
        }

        if (fromDate <= tenMinsFromNow) {
            toast.error('New start time must be at least 10 minutes from now');
            return;
        }

        if (untilDate <= fromDate) {
            toast.error('End time must be after start time');
            return;
        }

        setRescheduling(true);
        try {
            await apiRequest(`/tests/online/${activeQuiz.id}`, 'PUT', {
                title: activeQuiz.title,
                topic: activeQuiz.topic,
                difficulty: activeQuiz.difficulty,
                timeLimitMins: activeQuiz.timeLimitMins,
                totalMarks: activeQuiz.totalMarks,
                availableFrom: fromDate.toISOString(),
                availableUntil: untilDate.toISOString(),
                batchIds: activeQuiz.batch?.id ? [activeQuiz.batch.id] : (activeQuiz.batchId ? [activeQuiz.batchId] : []),
            });
            toast.success('Quiz rescheduled successfully!');
            setShowReschedule(false);
            await refreshOnlineQuizzes();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to reschedule quiz.');
        } finally {
            setRescheduling(false);
        }
    };

    const handleDeleteQuiz = async (quiz: OnlineQuiz) => {
        setDeletingQuizId(quiz.id);
        try {
            await apiRequest(`/tests/online/${quiz.id}`, 'DELETE');
            toast.success('Quiz deleted successfully');
            setDeleteConfirmQuiz(null);
            changeActiveQuiz(null);
            await refreshOnlineQuizzes();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete quiz.');
        } finally {
            setDeletingQuizId(null);
        }
    };

    const finalizeQuiz = async (quiz: OnlineQuiz) => {
        if (quiz.isFinalized || finalizingQuizId) return;
        setFinalizingQuizId(quiz.id);
        try {
            await apiRequest(`/tests/online/${quiz.id}/finalize`, 'POST');
            toast.success('Quiz marks finalized. WhatsApp and portal grades updated successfully!');
            setFinalizeConfirmQuiz(null);
            await refreshOnlineQuizzes();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to finalize quiz.');
        } finally {
            setFinalizingQuizId(null);
        }
    };

    const downloadQuizReport = async (quiz: OnlineQuiz) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/tests/online/${quiz.id}/report`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to download report.');
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${quiz.title.replace(/[^a-z0-9]+/gi, '_') || 'online_quiz'}_report.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to download report.');
        }
    };

    const downloadQuestionsPdf = async (quiz: OnlineQuiz) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/tests/online/${quiz.id}/questions-pdf`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to download questions PDF.');
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${quiz.title.replace(/[^a-z0-9]+/gi, '_') || 'online_quiz'}_questions.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Questions PDF downloaded successfully!');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to download questions PDF.');
        }
    };

    const downloadReportPdf = async (quiz: OnlineQuiz) => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/tests/online/${quiz.id}/report-pdf`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to download report PDF.');
            }
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${quiz.title.replace(/[^a-z0-9]+/gi, '_') || 'online_quiz'}_report.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success('Report PDF downloaded successfully!');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to download report PDF.');
        }
    };

    const getEnrolledStudents = (quiz: OnlineQuiz) => {
        const studentsMap = new Map<string, any>();
        if (quiz.batch?.students) {
            quiz.batch.students.forEach((s: any) => studentsMap.set(s.id, s));
        }
        if (quiz.batches) {
            quiz.batches.forEach((b: any) => {
                if (b.students) {
                    b.students.forEach((s: any) => studentsMap.set(s.id, s));
                }
            });
        }
        return Array.from(studentsMap.values());
    };

    const getQuizProgressData = (quiz: OnlineQuiz) => {
        const enrolled = getEnrolledStudents(quiz).length;
        const completed = quiz.submissions.filter(s => s.submittedAt !== null).length;
        const active = quiz.submissions.filter(s => s.startedAt !== null && s.submittedAt === null).length;
        const unattempted = Math.max(0, enrolled - (completed + active));
        return { enrolled, completed, active, unattempted };
    };

    const getQuestionCounts = (quiz: OnlineQuiz) => {
        const poolCount = quiz.questions?.length || 0;
        const requestedCount = Number(quiz.studentQuestionCount);
        const studentCount = requestedCount > 0
            ? Math.min(requestedCount, poolCount || requestedCount)
            : poolCount;

        return {
            poolCount,
            studentCount,
            hasVariantPool: poolCount > studentCount
        };
    };

    const QuizCard = ({ quiz }: { quiz: OnlineQuiz }) => {
        const { enrolled, completed, active, unattempted } = getQuizProgressData(quiz);
        const { poolCount, studentCount, hasVariantPool } = getQuestionCounts(quiz);
        const completedPct = enrolled > 0 ? (completed / enrolled) * 100 : 0;
        const activePct = enrolled > 0 ? (active / enrolled) * 100 : 0;
        const unattemptedPct = enrolled > 0 ? (unattempted / enrolled) * 100 : 100;

        return (
            <div
                onClick={() => {
                    changeActiveQuiz(quiz);
                    setActiveTab('monitor');
                }}
                className="bg-white border-[1.5px] border-neutral-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-emerald-500/35 transition-all duration-300 cursor-pointer flex flex-col justify-between group"
            >
                <div>
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="p-3 bg-neutral-50 border border-neutral-250 rounded-xl group-hover:bg-emerald-50/50 group-hover:border-emerald-100 transition-colors">
                            <Sparkles className="w-5 h-5 text-emerald-600 animate-pulse-subtle" />
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${quiz.isFinalized
                                ? 'bg-slate-50 text-slate-700 border-slate-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                            }`}>
                            {quiz.isFinalized ? 'Finalized' : 'Published'}
                        </span>
                    </div>
                    <h3 className="text-lg font-black text-app-text mb-1 truncate group-hover:text-emerald-700 transition-colors" title={quiz.title}>
                        {quiz.title}
                    </h3>
                    <p className="text-sm text-app-text-secondary font-medium truncate">
                        {quiz.batch?.name || 'Batch'}{quiz.topic ? ` • ${quiz.topic}` : ''}
                    </p>
                    <p className="mt-2 text-xs text-app-text-tertiary font-semibold">
                        {quiz.availableFrom ? new Date(quiz.availableFrom).toLocaleString() : 'Available now'}
                        {quiz.availableUntil ? ` → ${new Date(quiz.availableUntil).toLocaleString()}` : ''}
                    </p>

                    <div className="mt-4 pt-4 border-t border-black/5 grid grid-cols-2 gap-3 text-xs font-bold text-app-text-tertiary">
                        <span className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-neutral-450" />
                            {studentCount} Questions{hasVariantPool ? ` (${poolCount} pool)` : ''}
                        </span>
                        <span className="flex items-center gap-1.5"><Timer className="w-3.5 h-3.5 text-neutral-450" />{quiz.timeLimitMins} mins</span>
                    </div>
                </div>

                {/* Telemetry Segmented Progress Bar */}
                <div className="mt-6">
                    <div className="flex items-center justify-between text-xs font-bold text-app-text-secondary mb-2">
                        <span>Students Participation</span>
                        <span className="text-neutral-500 font-semibold">{enrolled} enrolled</span>
                    </div>
                    <div className="w-full h-3 bg-neutral-100 rounded-full border border-neutral-200 overflow-hidden flex">
                        {enrolled === 0 ? (
                            <div className="h-full bg-neutral-200 w-full" />
                        ) : (
                            <>
                                {completed > 0 && (
                                    <div
                                        className="h-full bg-emerald-500 transition-all duration-300"
                                        style={{ width: `${completedPct}%` }}
                                        title={`Completed: ${completed}`}
                                    />
                                )}
                                {active > 0 && (
                                    <div
                                        className="h-full bg-amber-500 animate-pulse transition-all duration-300"
                                        style={{ width: `${activePct}%` }}
                                        title={`Active: ${active}`}
                                    />
                                )}
                                {unattempted > 0 && (
                                    <div
                                        className="h-full bg-neutral-200 transition-all duration-300"
                                        style={{ width: `${unattemptedPct}%` }}
                                        title={`Not Started: ${unattempted}`}
                                    />
                                )}
                            </>
                        )}
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-bold text-neutral-500">
                        <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span>Attended: {completed}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            <span>Attending: {active}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-neutral-350" />
                            <span>Not Attended: {unattempted}</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Layout title={activeQuiz ? undefined : "Manage Quizzes"} hideMobileNav={!!activeQuiz || showAIModal}>
            <AnimatePresence mode="wait">
                {!activeQuiz ? (
                    /* QUIZ GRID VIEW */
                    <motion.div
                        key="quiz-grid"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.25 }}
                    >
                        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div>
                                <p className="text-sm sm:text-base text-app-text-secondary">Generate, monitor, and analyze AI-powered quizzes for your batches.</p>
                            </div>
                            <button
                                onClick={() => setShowAIModal(true)}
                                className="min-h-12 bg-neutral-900 hover:bg-neutral-850 text-white shadow-lg px-5 py-3 rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center text-sm gap-2 shrink-0"
                            >
                                <Sparkles className="w-4.5 h-4.5 text-emerald-400 animate-pulse-subtle" />
                                Generate with AI
                            </button>
                        </div>

                        {loading ? (
                            <div className="text-center py-20 animate-pulse text-app-text-secondary">Loading online quizzes...</div>
                        ) : (
                            <div className="space-y-8 sm:space-y-12 pb-20">
                                {onlineQuizzes.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {onlineQuizzes.map(quiz => <QuizCard key={quiz.id} quiz={quiz} />)}
                                    </div>
                                ) : (
                                    <div className="py-14 sm:py-20 px-5 text-center border border-dashed border-neutral-300 bg-neutral-50/50 rounded-2xl">
                                        <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30 text-emerald-600 animate-pulse-subtle" />
                                        <p className="text-app-text-secondary font-bold text-lg">No AI Quizzes created yet.</p>
                                        <p className="text-xs text-app-text-tertiary mt-1 mb-4">Create interactive, auto-graded quizzes in seconds using AI.</p>
                                        <button
                                            onClick={() => setShowAIModal(true)}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-md transition-all active:scale-95"
                                        >
                                            Generate your first AI Quiz
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                ) : (
                    /* CONSOLIDATED WORKSPACE DASHBOARD COCKPIT */
                    <motion.div
                        key="quiz-workspace"
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.25 }}
                        className="space-y-6 pb-20"
                    >
                        {/* Header bar and back control */}
                        <div className="flex flex-col gap-4 border-b border-black/5 pb-5">
                            <button
                                onClick={() => {
                                    changeActiveQuiz(null);
                                    refreshOnlineQuizzes();
                                }}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-app-text-secondary hover:text-emerald-700 transition-colors uppercase tracking-wider"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back to Quizzes
                            </button>

                            <div className="flex flex-col gap-4">
                                <div className="min-w-0 max-w-5xl">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded">
                                            Online Workspace
                                        </span>
                                        {activeQuiz.isFinalized && (
                                            <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded">
                                                Locked & Finalized
                                            </span>
                                        )}
                                    </div>
                                    <h2 className="text-2xl font-black text-app-text mt-1.5 truncate" title={activeQuiz.title}>
                                        {activeQuiz.title}
                                    </h2>
                                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-app-text-secondary mt-0.5">
                                        <span>
                                            Batch: <span className="text-app-text">{activeQuiz.batch?.name || 'Batch'}</span>
                                        </span>
                                        {activeQuiz.topic && <span>Topic: {activeQuiz.topic}</span>}
                                        {activeQuiz.difficulty && <span>Difficulty: {activeQuiz.difficulty}</span>}
                                    </p>
                                </div>

                                {/* Cockpit Header Actions */}
                                <div className="grid w-full max-w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2.5">
                                    {/* Edit Quiz — disabled if locked, finalized, or has submissions */}
                                    {!activeQuiz.isFinalized && (() => {
                                        const locked = isEditDeleteLocked(activeQuiz);
                                        const hasSubs = hasSubmissions(activeQuiz);
                                        const disableEdit = locked || hasSubs;
                                        return (
                                            <button
                                                onClick={() => {
                                                    setQuizToEdit(activeQuiz);
                                                    setShowAIModal(true);
                                                }}
                                                disabled={disableEdit}
                                                title={locked ? 'Cannot edit within 10 minutes of start time' : hasSubs ? 'Cannot edit after students have started' : 'Edit Quiz'}
                                                className="inline-flex min-h-11 items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl border border-neutral-300 bg-white text-neutral-800 text-xs sm:text-sm font-bold hover:bg-neutral-50 active:scale-95 hover:scale-[1.02] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                                            >
                                                <Edit3 className="w-4 h-4" />
                                                Edit Quiz
                                            </button>
                                        );
                                    })()}

                                    {/* Reschedule — only when not finalized and not locked */}
                                    {!activeQuiz.isFinalized && (() => {
                                        const locked = isEditDeleteLocked(activeQuiz);
                                        const hasSubs = hasSubmissions(activeQuiz);
                                        return (
                                            <button
                                                onClick={() => openReschedule(activeQuiz)}
                                                disabled={locked || hasSubs}
                                                title={locked ? 'Cannot reschedule within 10 minutes of start time' : hasSubs ? 'Cannot reschedule after students have started' : 'Reschedule Quiz Time'}
                                                className="inline-flex min-h-11 items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl border border-neutral-300 bg-white text-neutral-800 text-xs sm:text-sm font-bold hover:bg-neutral-50 active:scale-95 hover:scale-[1.02] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                                            >
                                                <CalendarDays className="w-4 h-4" />
                                                Reschedule
                                            </button>
                                        );
                                    })()}

                                    {/* Delete Quiz */}
                                    {!activeQuiz.isFinalized && (() => {
                                        const locked = isEditDeleteLocked(activeQuiz);
                                        const hasSubs = hasSubmissions(activeQuiz);
                                        const disableDelete = locked || hasSubs;
                                        return (
                                            <button
                                                onClick={() => setDeleteConfirmQuiz(activeQuiz)}
                                                disabled={disableDelete}
                                                title={locked ? 'Cannot delete within 10 minutes of start time' : hasSubs ? 'Cannot delete after students have started' : 'Delete Quiz'}
                                                className="inline-flex min-h-11 items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs sm:text-sm font-bold hover:bg-red-100 active:scale-95 hover:scale-[1.02] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                Delete
                                            </button>
                                        );
                                    })()}

                                    {isQuizOnly && activeQuiz.isPublic && (
                                        <button
                                            onClick={() => {
                                                if (!instituteSlug) {
                                                    toast.error('Could not fetch institute slug.');
                                                    return;
                                                }
                                                const link = `${window.location.origin}/${instituteSlug}/student/quiz/${activeQuiz.id}`;
                                                navigator.clipboard.writeText(link);
                                                toast.success('Shareable link copied!');
                                            }}
                                            className="inline-flex min-h-11 items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs sm:text-sm font-bold hover:bg-emerald-100 active:scale-95 hover:scale-[1.02] transition-all duration-200"
                                        >
                                            <Link2 className="w-4 h-4" />
                                            Copy Link
                                        </button>
                                    )}

                                    <button
                                        onClick={() => downloadQuestionsPdf(activeQuiz)}
                                        className="inline-flex min-h-11 items-center justify-center gap-1.5 px-3 sm:px-4.5 py-2.5 rounded-xl border border-neutral-300 bg-white text-neutral-800 text-xs sm:text-sm font-bold hover:bg-neutral-50 active:scale-95 hover:scale-[1.02] transition-all duration-200"
                                    >
                                        <FileText className="w-4 h-4" />
                                        Questions PDF
                                    </button>

                                    <button
                                        onClick={() => downloadReportPdf(activeQuiz)}
                                        className="inline-flex min-h-11 items-center justify-center gap-1.5 px-3 sm:px-4.5 py-2.5 rounded-xl border border-neutral-300 bg-white text-neutral-800 text-xs sm:text-sm font-bold hover:bg-neutral-50 active:scale-95 hover:scale-[1.02] transition-all duration-200"
                                    >
                                        <Download className="w-4 h-4" />
                                        Report PDF
                                    </button>

                                    <button
                                        onClick={() => downloadQuizReport(activeQuiz)}
                                        className="inline-flex min-h-11 items-center justify-center gap-1.5 px-3 sm:px-4.5 py-2.5 rounded-xl border border-neutral-300 bg-white text-neutral-800 text-xs sm:text-sm font-bold hover:bg-neutral-50 active:scale-95 hover:scale-[1.02] transition-all duration-200"
                                    >
                                        <Download className="w-4 h-4" />
                                        Report CSV
                                    </button>

                                    <button
                                        onClick={() => setFinalizeConfirmQuiz(activeQuiz)}
                                        disabled={activeQuiz.isFinalized || finalizingQuizId === activeQuiz.id}
                                        className="col-span-2 inline-flex min-h-11 items-center justify-center gap-1.5 px-4 sm:px-5 py-2.5 rounded-xl bg-neutral-900 text-white text-xs sm:text-sm font-black hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 hover:scale-[1.02] transition-all duration-200 shadow-md sm:col-span-1"
                                    >
                                        <LockKeyhole className="w-4 h-4 text-emerald-400" />
                                        {finalizingQuizId === activeQuiz.id
                                            ? 'Finalizing...'
                                            : activeQuiz.isFinalized
                                                ? 'Marks Finalized'
                                                : 'Finalize Quiz Marks'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Asymmetric Telemetry Metadata Widgets */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                            <div className="bg-white border border-black/5 rounded-2xl p-3 sm:p-4 shadow-sm">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Assigned Set</span>
                                <span className="text-lg sm:text-xl font-black text-app-text block mt-0.5 leading-tight">{getQuestionCounts(activeQuiz).studentCount} Questions Each</span>
                                {getQuestionCounts(activeQuiz).hasVariantPool && (
                                    <span className="text-[11px] font-bold text-app-text-tertiary block mt-1">
                                        {getQuestionCounts(activeQuiz).poolCount} in variant pool
                                    </span>
                                )}
                            </div>
                            <div className="bg-white border border-black/5 rounded-2xl p-3 sm:p-4 shadow-sm">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Weighting</span>
                                <span className="text-lg sm:text-xl font-black text-app-text block mt-0.5 leading-tight">{activeQuiz.totalMarks} Marks Total</span>
                            </div>
                            <div className="bg-white border border-black/5 rounded-2xl p-3 sm:p-4 shadow-sm">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Timer Scale</span>
                                <span className="text-lg sm:text-xl font-black text-app-text block mt-0.5 leading-tight">{activeQuiz.timeLimitMins} Mins Limit</span>
                            </div>
                            <div className="bg-white border border-black/5 rounded-2xl p-3 sm:p-4 shadow-sm">
                                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Scheduled From</span>
                                <span className="text-xs font-bold text-app-text block mt-1.5 truncate">
                                    {activeQuiz.availableFrom ? new Date(activeQuiz.availableFrom).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'Instant'}
                                </span>
                            </div>
                        </div>

                        {/* 10-min lock warning banner */}
                        {!activeQuiz.isFinalized && isEditDeleteLocked(activeQuiz) && (
                            <div className="flex items-start sm:items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                                <p className="text-xs sm:text-sm font-semibold text-amber-800 leading-relaxed">
                                    This quiz starts {activeQuiz.availableFrom && new Date(activeQuiz.availableFrom) > new Date() ? 'in less than 10 minutes' : 'now or has already started'} — editing, rescheduling, and deleting are locked.
                                </p>
                            </div>
                        )}

                        {/* Navigation Tabs bar */}
                        <div className="flex border-b border-black/5 overflow-x-auto w-full pt-1 sm:pt-2">
                            <button
                                onClick={() => setActiveTab('monitor')}
                                className={`px-3.5 sm:px-6 py-3 border-b-2 font-bold text-xs sm:text-sm transition-all shrink-0 flex items-center gap-2 ${activeTab === 'monitor'
                                        ? 'border-emerald-600 text-emerald-600 bg-emerald-50/10'
                                        : 'border-transparent text-neutral-500 hover:text-neutral-800'
                                    }`}
                            >
                                <Monitor className="w-4.5 h-4.5" />
                                Live Proctoring
                                {!activeQuiz.isFinalized && (
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                )}
                            </button>

                            <button
                                onClick={() => setActiveTab('analytics')}
                                className={`px-3.5 sm:px-6 py-3 border-b-2 font-bold text-xs sm:text-sm transition-all shrink-0 flex items-center gap-2 ${activeTab === 'analytics'
                                        ? 'border-emerald-600 text-emerald-600 bg-emerald-50/10'
                                        : 'border-transparent text-neutral-500 hover:text-neutral-800'
                                    }`}
                            >
                                <BarChart3 className="w-4.5 h-4.5" />
                                Quiz Analytics
                            </button>

                            <button
                                onClick={() => setActiveTab('submissions')}
                                className={`px-3.5 sm:px-6 py-3 border-b-2 font-bold text-xs sm:text-sm transition-all shrink-0 flex items-center gap-2 ${activeTab === 'submissions'
                                        ? 'border-emerald-600 text-emerald-600 bg-emerald-50/10'
                                        : 'border-transparent text-neutral-500 hover:text-neutral-800'
                                    }`}
                            >
                                <Users className="w-4.5 h-4.5" />
                                Student Submissions
                                <span className="ml-1 px-2 py-0.5 rounded-full text-xs bg-neutral-100 text-neutral-600 font-black">
                                    {activeQuiz.submissions.length}
                                </span>
                            </button>
                        </div>

                        {/* Dynamic Sub-tab Panel Mounting */}
                        <div className="mt-4">
                            {activeTab === 'monitor' && (
                                <QuizLiveMonitor quizId={activeQuiz.id} />
                            )}

                            {activeTab === 'analytics' && (
                                <QuizAnalytics quizId={activeQuiz.id} />
                            )}

                            {activeTab === 'submissions' && (
                                <div className="bg-white border border-black/5 rounded-2xl shadow-sm overflow-hidden">
                                    <div className="px-4 sm:px-5 py-4 border-b border-black/5 bg-neutral-50/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                        <div>
                                            <h3 className="font-black text-app-text">Batch Enrolled Submissions Grid</h3>
                                            <p className="text-xs text-app-text-secondary mt-0.5">
                                                All students approved for this batch and their attempt records.
                                            </p>
                                        </div>
                                        {activeQuiz.isFinalized && (
                                            <span className="w-fit text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1 rounded-full flex items-center gap-1.5 animate-pulse">
                                                <UserX className="w-3.5 h-3.5" />
                                                Late Attempts Locked (Missed Marked)
                                            </span>
                                        )}
                                    </div>

                                    <div className="md:hidden divide-y divide-black/5">
                                        {getEnrolledStudents(activeQuiz).map((student) => {
                                            const sub = activeQuiz.submissions.find(s => s.studentId === student.id);
                                            let statusLabel = 'Not Started';
                                            let statusBadge = 'bg-neutral-100 text-neutral-700 border-neutral-250';
                                            let scoreText = '-';

                                            if (sub) {
                                                if (sub.submittedAt) {
                                                    statusLabel = 'Completed';
                                                    statusBadge = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                                                    scoreText = sub.score !== null ? `${sub.score.toFixed(1)} / ${activeQuiz.totalMarks}` : '-';
                                                } else if (activeQuiz.isFinalized) {
                                                    statusLabel = 'Quiz Missed (Locked)';
                                                    statusBadge = 'bg-rose-50 text-rose-700 border-rose-100';
                                                    scoreText = '0.0 / ' + activeQuiz.totalMarks;
                                                } else {
                                                    statusLabel = 'Attending';
                                                    statusBadge = 'bg-amber-50 text-amber-700 border-amber-100 animate-pulse';
                                                    scoreText = 'Taking...';
                                                }
                                            } else if (activeQuiz.isFinalized) {
                                                statusLabel = 'Quiz Missed';
                                                statusBadge = 'bg-rose-50 text-rose-700 border-rose-100';
                                                scoreText = '0.0 / ' + activeQuiz.totalMarks;
                                            }

                                            return (
                                                <div key={student.id} className="p-4">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="font-black text-app-text leading-tight truncate">{student.name}</p>
                                                            <p className="text-xs font-semibold text-app-text-secondary mt-0.5">{student.humanId || 'N/A'}</p>
                                                        </div>
                                                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold border shrink-0 ${statusBadge}`}>
                                                            {statusLabel}
                                                        </span>
                                                    </div>
                                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                                        <div className="rounded-xl bg-neutral-50 border border-black/5 p-3">
                                                            <p className="font-bold text-app-text-tertiary uppercase text-[10px]">Grade</p>
                                                            <p className="font-black text-app-text mt-1">{scoreText}</p>
                                                        </div>
                                                        <div className="rounded-xl bg-neutral-50 border border-black/5 p-3">
                                                            <p className="font-bold text-app-text-tertiary uppercase text-[10px]">Started</p>
                                                            <p className="font-bold text-app-text-secondary mt-1 truncate">
                                                                {sub?.startedAt ? new Date(sub.startedAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '-'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => setSelectedStudentSub({
                                                            studentName: student.name,
                                                            studentId: student.id,
                                                            humanId: student.humanId,
                                                            submission: sub || null
                                                        })}
                                                        disabled={!sub}
                                                        className="mt-3 min-h-11 w-full rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2 text-xs font-bold"
                                                        title="View Student Responses"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                        Inspect Attempt
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="hidden md:block overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-neutral-50 text-xs uppercase tracking-wider text-app-text-tertiary border-b border-black/5">
                                                <tr>
                                                    <th className="text-left px-5 py-3.5 font-bold">Student Name</th>
                                                    <th className="text-left px-5 py-3.5 font-bold">Human ID</th>
                                                    <th className="text-left px-5 py-3.5 font-bold">Attempt Status</th>
                                                    <th className="text-left px-5 py-3.5 font-bold">Started At</th>
                                                    <th className="text-left px-5 py-3.5 font-bold">Submitted At</th>
                                                    <th className="text-left px-5 py-3.5 font-bold">Quiz Grade</th>
                                                    <th className="text-center px-5 py-3.5 font-bold">Inspect</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-black/5">
                                                {getEnrolledStudents(activeQuiz).map((student) => {
                                                    const sub = activeQuiz.submissions.find(s => s.studentId === student.id);

                                                    let statusLabel = 'Not Started';
                                                    let statusBadge = 'bg-neutral-100 text-neutral-700 border-neutral-250';
                                                    let scoreText = '-';
                                                    let isMissed = false;

                                                    if (sub) {
                                                        if (sub.submittedAt) {
                                                            statusLabel = 'Completed';
                                                            statusBadge = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                                                            scoreText = sub.score !== null ? `${sub.score.toFixed(1)} / ${activeQuiz.totalMarks}` : '-';
                                                        } else {
                                                            if (activeQuiz.isFinalized) {
                                                                statusLabel = 'Quiz Missed (Locked)';
                                                                statusBadge = 'bg-rose-50 text-rose-700 border-rose-100';
                                                                scoreText = '0.0 / ' + activeQuiz.totalMarks;
                                                                isMissed = true;
                                                            } else {
                                                                statusLabel = 'Attending';
                                                                statusBadge = 'bg-amber-50 text-amber-700 border-amber-100 animate-pulse';
                                                                scoreText = 'Taking...';
                                                            }
                                                        }
                                                    } else {
                                                        if (activeQuiz.isFinalized) {
                                                            statusLabel = 'Quiz Missed';
                                                            statusBadge = 'bg-rose-50 text-rose-700 border-rose-100';
                                                            scoreText = '0.0 / ' + activeQuiz.totalMarks;
                                                            isMissed = true;
                                                        }
                                                    }

                                                    return (
                                                        <tr key={student.id} className="hover:bg-neutral-50/50 transition-colors">
                                                            <td className="px-5 py-3.5 font-bold text-app-text">{student.name}</td>
                                                            <td className="px-5 py-3.5 font-semibold text-app-text-secondary">{student.humanId || 'N/A'}</td>
                                                            <td className="px-5 py-3.5">
                                                                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold border ${statusBadge}`}>
                                                                    {statusLabel}
                                                                </span>
                                                            </td>
                                                            <td className="px-5 py-3.5 text-xs text-app-text-tertiary">
                                                                {sub?.startedAt ? new Date(sub.startedAt).toLocaleString() : '-'}
                                                            </td>
                                                            <td className="px-5 py-3.5 text-xs text-app-text-tertiary">
                                                                {sub?.submittedAt ? new Date(sub.submittedAt).toLocaleString() : '-'}
                                                            </td>
                                                            <td className="px-5 py-3.5 font-black text-app-text text-sm">
                                                                {scoreText}
                                                            </td>
                                                            <td className="px-5 py-3.5 text-center">
                                                                <button
                                                                    onClick={() => setSelectedStudentSub({
                                                                        studentName: student.name,
                                                                        studentId: student.id,
                                                                        humanId: student.humanId,
                                                                        submission: sub || null
                                                                    })}
                                                                    disabled={!sub}
                                                                    className="p-2 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1 text-xs font-bold"
                                                                    title="View Student Responses"
                                                                >
                                                                    <Eye className="w-3.5 h-3.5" />
                                                                    Inspect
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* AI Generation Modal */}
            <AITestGeneratorModal
                isOpen={showAIModal}
                onClose={() => {
                    setShowAIModal(false);
                    setQuizToEdit(null);
                }}
                batches={batches}
                onSaved={refreshOnlineQuizzes}
                quizToEdit={quizToEdit}
            />

            {/* ═══ RESCHEDULE MODAL ═══ */}
            <AnimatePresence>
                {showReschedule && activeQuiz && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowReschedule(false)}
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 16 }}
                            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                            className="fixed inset-x-4 top-[20%] md:max-w-md md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-50 bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden"
                        >
                            <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 bg-neutral-50/60">
                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Reschedule</span>
                                    <h3 className="text-lg font-black text-app-text mt-0.5">Update Quiz Time</h3>
                                    <p className="text-xs text-app-text-secondary mt-0.5 truncate max-w-[260px]">{activeQuiz.title}</p>
                                </div>
                                <button
                                    onClick={() => setShowReschedule(false)}
                                    className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-app-text-secondary transition-all"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                                    <Clock className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                                    <p className="text-xs text-amber-800 font-semibold leading-relaxed">
                                        New start time must be at least <strong>10 minutes</strong> from now. Changes will re-evaluate the edit/delete lock instantly.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-app-text-secondary uppercase mb-2">Available From</label>
                                    <input
                                        type="datetime-local"
                                        className="w-full bg-neutral-50 border border-neutral-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500 font-medium text-sm transition-colors"
                                        value={rescheduleFrom}
                                        onChange={e => setRescheduleFrom(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-app-text-secondary uppercase mb-2">Available Until</label>
                                    <input
                                        type="datetime-local"
                                        className="w-full bg-neutral-50 border border-neutral-200 p-3 rounded-xl focus:outline-none focus:border-emerald-500 font-medium text-sm transition-colors"
                                        value={rescheduleUntil}
                                        onChange={e => setRescheduleUntil(e.target.value)}
                                    />
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={() => setShowReschedule(false)}
                                        className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold py-3 rounded-xl transition-all text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleReschedule}
                                        disabled={rescheduling}
                                        className="flex-1 bg-black hover:bg-neutral-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2 whitespace-nowrap"
                                    >
                                        {rescheduling ? (
                                            <><Clock className="w-4 h-4 animate-spin" />Updating...</>
                                        ) : (
                                            <><CalendarDays className="w-4 h-4" />Reschedule</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ═══ DELETE CONFIRMATION MODAL ═══ */}
            <AnimatePresence>
                {deleteConfirmQuiz && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setDeleteConfirmQuiz(null)}
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 16 }}
                            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                            className="fixed inset-x-4 top-[25%] md:max-w-sm md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-50 bg-white rounded-2xl shadow-2xl border border-red-100 p-6 text-center"
                        >
                            <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-4">
                                <Trash2 className="w-7 h-7 text-red-600" />
                            </div>
                            <h3 className="text-lg font-black text-app-text mb-2">Delete Quiz?</h3>
                            <p className="text-sm text-app-text-secondary leading-relaxed mb-6">
                                This will permanently delete <span className="font-bold text-app-text">"{deleteConfirmQuiz.title}"</span> and all its questions. This action cannot be undone.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setDeleteConfirmQuiz(null)}
                                    className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold py-3 rounded-xl transition-all text-sm"
                                >
                                    Keep Quiz
                                </button>
                                <button
                                    onClick={() => handleDeleteQuiz(deleteConfirmQuiz)}
                                    disabled={deletingQuizId === deleteConfirmQuiz.id}
                                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
                                >
                                    {deletingQuizId === deleteConfirmQuiz.id ? (
                                        <><Trash2 className="w-4 h-4 animate-pulse" />Deleting...</>
                                    ) : (
                                        <><Trash2 className="w-4 h-4" />Yes, Delete</>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ═══ FINALIZE CONFIRMATION MODAL ═══ */}
            <AnimatePresence>
                {finalizeConfirmQuiz && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setFinalizeConfirmQuiz(null)}
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 16 }}
                            transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                            className="fixed inset-x-4 top-[20%] md:max-w-md md:inset-x-auto md:left-1/2 md:-translate-x-1/2 z-50 bg-white rounded-2xl shadow-2xl border border-neutral-200 p-6"
                        >
                            <div className="flex items-center gap-4 mb-5">
                                <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                                    <LockKeyhole className="w-7 h-7 text-emerald-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-app-text">Finalize Quiz Marks</h3>
                                    <p className="text-xs text-app-text-secondary mt-0.5">This action is permanent and cannot be undone</p>
                                </div>
                            </div>

                            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 mb-5 space-y-2.5 text-sm">
                                <div className="flex items-start gap-2.5">
                                    <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                    <span className="text-app-text-secondary">All student attempts will be <strong className="text-app-text">locked and graded</strong> permanently.</span>
                                </div>
                                <div className="flex items-start gap-2.5">
                                    <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                    <span className="text-app-text-secondary">Students who didn't attempt will receive <strong className="text-app-text">0 marks</strong>.</span>
                                </div>
                                <div className="flex items-start gap-2.5">
                                    <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                                    <span className="text-app-text-secondary">WhatsApp results broadcast will be sent to <strong className="text-app-text">all parents</strong>.</span>
                                </div>
                            </div>

                            <p className="text-sm text-center font-semibold text-app-text-secondary mb-5">
                                Are you ready to finalize <span className="font-black text-app-text">"{finalizeConfirmQuiz.title}"</span>?
                            </p>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setFinalizeConfirmQuiz(null)}
                                    className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold py-3 rounded-xl transition-all text-sm"
                                >
                                    Not Yet
                                </button>
                                <button
                                    onClick={() => finalizeQuiz(finalizeConfirmQuiz)}
                                    disabled={finalizingQuizId === finalizeConfirmQuiz.id}
                                    className="flex-1 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
                                >
                                    {finalizingQuizId === finalizeConfirmQuiz.id ? (
                                        <><LockKeyhole className="w-4 h-4 animate-pulse" />Finalizing...</>
                                    ) : (
                                        <><LockKeyhole className="w-4 h-4 text-emerald-400" />Finalize & Broadcast</>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* SLIDE-OVER SIDEBAR DRAWER FOR STUDENT RESPONSE INSPECTION */}
            <AnimatePresence>
                {selectedStudentSub && (
                    <>
                        {/* Backdrop overlay */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.3 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedStudentSub(null)}
                            className="fixed inset-0 bg-black z-45"
                        />

                        {/* Sidebar Drawer container */}
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
                            className="fixed top-0 right-0 h-full w-full sm:max-w-xl bg-white shadow-2xl z-50 flex flex-col border-l border-neutral-200 text-neutral-900"
                        >
                            {/* Drawer Header */}
                            <div className="px-6 py-5 border-b border-black/5 bg-neutral-50/50 shrink-0 flex items-center justify-between">
                                <div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Student Response Telemetry</span>
                                    <h3 className="text-lg font-black text-app-text leading-tight mt-0.5">{selectedStudentSub.studentName}</h3>
                                    <p className="text-xs font-bold text-neutral-400 mt-0.5">
                                        ID: {selectedStudentSub.humanId || 'N/A'}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setSelectedStudentSub(null)}
                                    className="p-2 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-app-text-secondary transition-all"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Drawer Content */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
                                {/* Telemetry Stats */}
                                <div className="grid grid-cols-2 gap-3 bg-neutral-50 border border-neutral-200 rounded-xl p-4">
                                    <div>
                                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Student Total Score</span>
                                        <span className="text-xl font-black text-emerald-600 block mt-0.5">
                                            {selectedStudentSub.submission?.submittedAt
                                                ? `${selectedStudentSub.submission.score?.toFixed(1)} / ${activeQuiz?.totalMarks} marks`
                                                : selectedStudentSub.submission?.startedAt && activeQuiz?.isFinalized
                                                    ? `0.0 / ${activeQuiz?.totalMarks} (Locked)`
                                                    : 'Unsubmitted / Active'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">Submission Timeline</span>
                                        <span className="text-xs font-bold text-app-text block mt-1 leading-tight">
                                            {selectedStudentSub.submission?.submittedAt
                                                ? `Submitted: ${new Date(selectedStudentSub.submission.submittedAt).toLocaleTimeString()}`
                                                : selectedStudentSub.submission?.startedAt
                                                    ? `Started: ${new Date(selectedStudentSub.submission.startedAt).toLocaleTimeString()}`
                                                    : 'No timeline'}
                                        </span>
                                    </div>
                                </div>

                                {/* Questions & Answers */}
                                <div className="space-y-5">
                                    <h4 className="text-xs font-black uppercase tracking-wider text-app-text-tertiary border-b border-black/5 pb-2">
                                        Detailed Answer Sheet
                                    </h4>

                                    {(() => {
                                        let sq = selectedStudentSub.submission?.shuffledQuestions;
                                        if (typeof sq === 'string') {
                                            try { sq = JSON.parse(sq); } catch { /* ignore parse error */ }
                                        }
                                        const displayQuestions = Array.isArray(sq) && sq.length > 0
                                            ? sq
                                            : activeQuiz?.questions || [];

                                        return displayQuestions.map((q: any, idx: number) => {
                                            const ans = selectedStudentSub.submission?.answers?.find(a => a.questionId === q.id);
                                            let parsedOptions: string[] = [];
                                            try {
                                                parsedOptions = typeof q.options === 'string' ? JSON.parse(q.options) : Array.isArray(q.options) ? q.options : [];
                                            } catch { parsedOptions = []; }

                                            return (
                                                <div key={q.id} className="border border-black/5 rounded-xl overflow-hidden">
                                                    <div className={`px-4 py-3 flex items-center justify-between gap-3 border-b border-black/5 ${ans
                                                            ? ans.isCorrect
                                                                ? 'bg-emerald-50'
                                                                : 'bg-rose-50'
                                                            : 'bg-neutral-50'
                                                        }`}>
                                                        <span className="text-xs font-black text-app-text-tertiary">Q{idx + 1}</span>
                                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ans
                                                                ? ans.isCorrect
                                                                    ? 'bg-emerald-100 text-emerald-800'
                                                                    : 'bg-rose-100 text-rose-800'
                                                                : 'bg-neutral-200 text-neutral-600'
                                                            }`}>
                                                            {ans ? (ans.isCorrect ? `+${ans.marksObtained}` : '0') : 'Not answered'}
                                                        </span>
                                                    </div>
                                                    <div className="p-4 space-y-3">
                                                        <p className="text-sm font-semibold text-app-text">{q.questionText}</p>
                                                        <div className="space-y-2">
                                                            {parsedOptions.map((option) => {
                                                                const isCorrectOpt = option === q.correctOption;
                                                                const isSelectedOpt = option === ans?.selectedOption;
                                                                let optionStyle = 'border-neutral-200 hover:bg-neutral-50/50';
                                                                if (isCorrectOpt) {
                                                                    optionStyle = 'bg-emerald-50 border-emerald-500 text-emerald-800 font-bold';
                                                                } else if (isSelectedOpt && !ans?.isCorrect) {
                                                                    optionStyle = 'bg-rose-50 border-rose-400 text-rose-800 font-bold';
                                                                }
                                                                return (
                                                                    <div
                                                                        key={option}
                                                                        className={`px-3 py-2 rounded-lg border text-xs flex items-center justify-between gap-3 transition-colors ${optionStyle}`}
                                                                    >
                                                                        <span>{option}</span>
                                                                        <div className="flex items-center gap-1.5 shrink-0">
                                                                            {isCorrectOpt && (
                                                                                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">Correct</span>
                                                                            )}
                                                                            {isSelectedOpt && (
                                                                                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 rounded border ${ans?.isCorrect
                                                                                        ? 'bg-emerald-600 text-white border-emerald-700'
                                                                                        : 'bg-rose-600 text-white border-rose-700'
                                                                                    }`}>
                                                                                    Student
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </Layout>
    );
}
