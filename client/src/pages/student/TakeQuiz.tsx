import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
    AlertTriangle,
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock,
    Eye,
    Loader,
    Lock,
    Send,
    Shield,
    BookOpen,
    XCircle,
    SkipForward,
    Timer,
} from 'lucide-react';

/* ─── Types ─── */
interface QuizQuestion {
    id: string;
    questionText: string;
    options: string[];
    marks: number;
}
interface Quiz {
    id: string;
    title: string;
    topic?: string | null;
    difficulty?: string | null;
    timeLimitMins: number;
    totalMarks: number;
    questions: QuizQuestion[];
}
interface Submission {
    id: string;
    score: number | null;
    autoSavedAnswers?: Record<string, string> | null;
    startedAt: string;
    submittedAt: string | null;
    cheatingWarnings?: number;
}
interface QuizResult {
    score: number | null;
    submittedAt: string;
    quiz: { title: string; totalMarks: number; timeLimitMins: number };
    answers: {
        id: string;
        selectedOption: string | null;
        isCorrect: boolean;
        marksObtained: number;
        question: {
            questionText: string;
            options: string[];
            correctOption: string;
            marks: number;
        };
    }[];
}
type QState = 'unanswered' | 'answered' | 'skipped' | 'active';

function formatSeconds(s: number) {
    const t = Math.max(0, s);
    return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

const MAX_WARNS = 5;

export default function TakeQuiz() {
    const { instituteSlug, quizId } = useParams<{ instituteSlug: string; quizId: string }>();
    const navigate = useNavigate();

    const [phase, setPhase] = useState<'loading' | 'instructions' | 'quiz' | 'result'>('loading');
    const [submitting, setSubmitting] = useState(false);
    const [quiz, setQuiz] = useState<Quiz | null>(null);
    const [submission, setSubmission] = useState<Submission | null>(null);
    const [result, setResult] = useState<QuizResult | null>(null);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [visited, setVisited] = useState<Set<string>>(new Set());
    const [currentIndex, setCurrentIndex] = useState(0);
    const [remaining, setRemaining] = useState(9999);
    const [warnCount, setWarnCount] = useState(0);
    const [showMask, setShowMask] = useState(false);
    const [locked, setLocked] = useState(false);
    const [timeExpired, setTimeExpired] = useState(false); // ← drives "Time's Up" overlay

    const maskTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const answersRef = useRef<Record<string, string>>({});
    const lastSavedRef = useRef('{}');
    const autosaveFlying = useRef(false);
    const submittedRef = useRef(false);
    const submittingRef = useRef(false);

    // Stable ref for submitQuiz — breaks dep cycle with countdown effect
    const submitQuizRef = useRef<(auto?: boolean) => Promise<void>>(() => Promise.resolve());

    const token = instituteSlug ? localStorage.getItem(`student_token_${instituteSlug}`) : null;
    const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

    const goBack = useCallback(() => navigate(`/${instituteSlug}/student/dashboard`), [instituteSlug, navigate]);

    const loadResult = useCallback(async () => {
        if (!quizId || !token) return false;
        try {
            const r = await axios.get<QuizResult>(`/api/student-portal/quizzes/${quizId}/result`, { headers });
            setResult(r.data);
            setPhase('result');
            return true;
        } catch { return false; }
    }, [headers, quizId, token]);

    const autosave = useCallback(async () => {
        if (!quizId || !token || submittedRef.current || autosaveFlying.current) return;
        const s = JSON.stringify(answersRef.current);
        if (s === lastSavedRef.current) return;
        autosaveFlying.current = true;
        try {
            await axios.patch(`/api/student-portal/quizzes/${quizId}/autosave`, { answers: answersRef.current }, { headers });
            lastSavedRef.current = s;
        } catch { } finally { autosaveFlying.current = false; }
    }, [headers, quizId, token]);

    const logCheat = useCallback(async (type: string) => {
        if (!quizId || !token || submittedRef.current) return warnCount + 1;
        try {
            const r = await axios.post<{ warningCount: number; isLocked: boolean }>(
                `/api/student-portal/quizzes/${quizId}/cheating-events`, { eventType: type }, { headers });
            return r.data.warningCount;
        } catch { return warnCount + 1; }
    }, [headers, quizId, token, warnCount]);

    const triggerMask = useCallback(async (reason: string) => {
        if (submittedRef.current || phase !== 'quiz') return;
        if (maskTimer.current) clearTimeout(maskTimer.current);
        const n = await logCheat(reason);
        setWarnCount(n);
        if (n >= MAX_WARNS) {
            setLocked(true);
            setShowMask(true);
        } else {
            setShowMask(true);
            maskTimer.current = setTimeout(() => setShowMask(false), 4000);
        }
    }, [logCheat, phase]);

    // submitQuiz — guards via refs so it never needs to change identity
    const submitQuiz = useCallback(async (auto = false) => {
        if (!quizId || !token || submittingRef.current || submittedRef.current) return;
        submittedRef.current = true;
        submittingRef.current = true;
        setSubmitting(true);
        try {
            await axios.post(
                `/api/student-portal/quizzes/${quizId}/submit`,
                { answers: answersRef.current },
                { headers }
            );
            toast.success(auto ? 'Time up! Quiz submitted.' : 'Quiz submitted successfully!');
            await loadResult();
        } catch (e: any) {
            // If server says already submitted, try loading the result
            if (e?.response?.status === 400 || e?.response?.status === 409) {
                const loaded = await loadResult();
                if (loaded) return;
            }
            submittedRef.current = false;
            submittingRef.current = false;
            toast.error(e?.response?.data?.error || 'Submit failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }, [headers, loadResult, quizId, token]); // submitting intentionally excluded

    // Keep ref in sync with the latest submitQuiz
    useEffect(() => { submitQuizRef.current = submitQuiz; }, [submitQuiz]);

    /* ── Boot ── */
    useEffect(() => {
        if (!token) { goBack(); return; }
        (async () => {
            try {
                const r = await axios.post<{ quiz: Quiz; submission: Submission }>(
                    `/api/student-portal/quizzes/${quizId}/start`, {}, { headers });
                setQuiz(r.data.quiz);
                setSubmission(r.data.submission);
                setWarnCount(r.data.submission.cheatingWarnings || 0);
                const rec = r.data.submission.autoSavedAnswers;
                if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
                    setAnswers(rec);
                    answersRef.current = rec;
                    lastSavedRef.current = JSON.stringify(rec);
                    setVisited(new Set(Object.keys(rec)));
                }
                if (r.data.submission.submittedAt) {
                    await loadResult();
                } else {
                    // Check if time already expired before even showing instructions
                    const end = new Date(r.data.submission.startedAt).getTime() + r.data.quiz.timeLimitMins * 60_000;
                    if (Date.now() >= end) {
                        setPhase('quiz');
                        setTimeExpired(true);
                    } else {
                        setPhase('instructions');
                    }
                }
            } catch (e: any) {
                if (!(await loadResult())) {
                    toast.error(e?.response?.data?.error || 'Unable to open quiz.');
                    goBack();
                }
            }
        })();
    }, []); // eslint-disable-line

    useEffect(() => { answersRef.current = answers; }, [answers]);

    /* ── Autosave interval ── */
    useEffect(() => {
        if (phase !== 'quiz' || !quiz) return;
        const t = setInterval(autosave, 15_000);
        return () => clearInterval(t);
    }, [autosave, phase, quiz]);

    /* ── Countdown — submitQuiz via ref to avoid dep cycle ── */
    useEffect(() => {
        if (phase !== 'quiz' || !quiz || !submission) return;
        const endMs = new Date(submission.startedAt).getTime() + quiz.timeLimitMins * 60_000;
        const calc = () => Math.ceil((endMs - Date.now()) / 1000);

        // Already expired?
        if (calc() <= 0) {
            setRemaining(0);
            setTimeExpired(true);
            submitQuizRef.current(true);
            return;
        }

        setRemaining(calc());
        const t = setInterval(() => {
            const n = calc();
            if (n <= 0) {
                clearInterval(t);
                setRemaining(0);
                setTimeExpired(true);
                submitQuizRef.current(true); // use ref — never stale
            } else {
                setRemaining(n);
            }
        }, 1000);
        return () => clearInterval(t);
    }, [phase, quiz, submission]); // submitQuiz intentionally excluded — use ref above

    /* ── Proctoring ── */
    useEffect(() => {
        if (phase !== 'quiz') return;
        const onVis = () => { if (document.hidden) triggerMask('TAB_SWITCH'); };
        const onBlur = () => triggerMask('WINDOW_BLUR');
        const noCtx = (e: Event) => e.preventDefault();
        const noCopy = (e: Event) => e.preventDefault();
        const noKey = (e: KeyboardEvent) => {
            if (e.key === 'PrintScreen') { e.preventDefault(); triggerMask('SCREENSHOT_KEY'); }
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && ['3', '4', 's', 'S'].includes(e.key)) {
                e.preventDefault(); triggerMask('SCREENSHOT_KEY');
            }
        };
        document.addEventListener('visibilitychange', onVis);
        window.addEventListener('blur', onBlur);
        document.addEventListener('contextmenu', noCtx);
        document.addEventListener('copy', noCopy);
        document.addEventListener('cut', noCopy);
        document.addEventListener('keydown', noKey);
        return () => {
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('blur', onBlur);
            document.removeEventListener('contextmenu', noCtx);
            document.removeEventListener('copy', noCopy);
            document.removeEventListener('cut', noCopy);
            document.removeEventListener('keydown', noKey);
        };
    }, [phase, triggerMask]);

    /* ── Print block ── */
    useEffect(() => {
        const s = document.createElement('style');
        s.id = 'qz-print';
        s.innerHTML = '@media print{body{display:none!important}}';
        document.head.appendChild(s);
        return () => document.getElementById('qz-print')?.remove();
    }, []);

    /* ── Navigation helpers ── */
    const markVisited = (idx: number) => {
        if (!quiz) return;
        setVisited(prev => new Set([...prev, quiz.questions[idx].id]));
    };
    const goTo = (idx: number) => { markVisited(idx); setCurrentIndex(idx); };
    const getState = (q: QuizQuestion, i: number): QState => {
        if (i === currentIndex) return 'active';
        if (answers[q.id]) return 'answered';
        if (visited.has(q.id)) return 'skipped';
        return 'unanswered';
    };

    /* ────────── LOADING ────────── */
    if (phase === 'loading') return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
                <div className="w-9 h-9 border-[3px] border-black border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-semibold text-gray-400">Loading quiz…</p>
            </div>
        </div>
    );

    /* ────────── RESULT ────────── */
    if (phase === 'result' && result) {
        const score = Number(result.score || 0);
        const pct = result.quiz.totalMarks > 0 ? (score / result.quiz.totalMarks) * 100 : 0;
        const pctColor = pct >= 75 ? 'text-green-600' : pct >= 40 ? 'text-orange-500' : 'text-red-500';
        return (
            <div className="min-h-screen bg-gray-50 text-gray-900 pb-16">
                <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
                    <div className="max-w-2xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-3">
                        <button onClick={goBack} className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="min-w-0 flex-1">
                            <p className="font-bold text-sm truncate">{result.quiz.title}</p>
                            <p className="text-xs text-gray-400">Quiz Result</p>
                        </div>
                    </div>
                </header>
                <main className="max-w-2xl mx-auto px-3 sm:px-4 pt-4 sm:pt-5 space-y-3 sm:space-y-4 pb-8">
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 sm:p-5 shadow-sm flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Final Score</p>
                            <p className="text-3xl sm:text-4xl font-black">
                                {score}<span className="text-gray-300 text-lg font-bold">/{result.quiz.totalMarks}</span>
                            </p>
                            <p className={`text-base font-black mt-1 ${pctColor}`}>{pct.toFixed(1)}%</p>
                        </div>
                        <CheckCircle2 className={`w-12 h-12 shrink-0 ${pctColor}`} />
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                            <Eye className="w-4 h-4 text-gray-400" />
                            <span className="font-bold text-sm">Answer Review</span>
                        </div>
                        <div className="divide-y divide-gray-50">
                            {result.answers.map((a, i) => (
                                <div key={a.id} className="p-3.5 sm:p-4">
                                    <div className="flex items-start gap-3">
                                        {a.isCorrect
                                            ? <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 shrink-0" />
                                            : <XCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />}
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-sm text-gray-900">Q{i + 1}. {a.question.questionText}</p>
                                            <p className="text-xs text-gray-400 mt-1.5">
                                                Your answer: <span className="font-bold text-gray-700">{a.selectedOption || 'Skipped'}</span>
                                            </p>
                                            {!a.isCorrect && (
                                                <p className="text-xs text-green-600 mt-0.5 font-semibold">Correct: {a.question.correctOption}</p>
                                            )}
                                        </div>
                                        <span className="text-xs font-bold text-gray-400 shrink-0">{a.marksObtained}/{a.question.marks}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <button onClick={goBack} className="w-full bg-black text-white font-black py-4 rounded-2xl hover:bg-gray-900 active:scale-95 transition-all text-sm">
                        Back to Dashboard
                    </button>
                </main>
            </div>
        );
    }

    /* ────────── INSTRUCTIONS ────────── */
    if (phase === 'instructions' && quiz) {
        const answeredCount = Object.keys(answers).length;
        return (
            <div className="min-h-screen bg-gray-50 text-gray-900">
                <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
                    <div className="max-w-2xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-3">
                        <button onClick={goBack} className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <p className="font-bold text-sm truncate">{quiz.title}</p>
                    </div>
                </header>
                <main className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-3.5 sm:space-y-4 pb-[calc(7rem+env(safe-area-inset-bottom))]">
                    <div className="text-center py-2 sm:py-4">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                            <BookOpen className="w-6 h-6 sm:w-7 sm:h-7 text-gray-700" />
                        </div>
                        <h1 className="text-lg sm:text-xl font-black text-gray-900 leading-tight">{quiz.title}</h1>
                        {quiz.topic && <p className="text-sm text-gray-400 mt-1">{quiz.topic}</p>}
                    </div>
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                        {[
                            { label: 'Questions', value: String(quiz.questions.length) },
                            { label: 'Time Limit', value: `${quiz.timeLimitMins}m` },
                            { label: 'Total Marks', value: String(quiz.totalMarks) },
                        ].map(s => (
                            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm px-2 py-3 sm:p-4 text-center">
                                <p className="text-xl sm:text-2xl font-black text-gray-900">{s.value}</p>
                                <p className="text-[10px] sm:text-[11px] font-semibold text-gray-400 mt-0.5 leading-tight">{s.label}</p>
                            </div>
                        ))}
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <BookOpen className="w-4 h-4 text-gray-500" />
                            <span className="font-bold text-sm text-gray-900">Instructions</span>
                        </div>
                        <ul className="space-y-3">
                            {[
                                'Questions appear one at a time. Use the number grid to jump to any question.',
                                'Tap an option to answer. Tap again or choose another to change.',
                                `You have ${quiz.timeLimitMins} minutes. The quiz auto-submits when time runs out.`,
                                'Your progress auto-saves every 15 seconds.',
                                "Tap Submit Quiz when you're done.",
                            ].map((line, i) => (
                                <li key={i} className="flex items-start gap-3 text-[13px] sm:text-sm text-gray-600 leading-relaxed">
                                    <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-700 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                                    {line}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="bg-red-50 rounded-2xl border border-red-100 p-4 sm:p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                            <span className="font-bold text-sm text-red-600">Integrity Policy</span>
                        </div>
                        <ul className="space-y-2">
                            {[
                                'Switching tabs or apps is logged and counted.',
                                `You get ${MAX_WARNS} warnings. After that, your attempt is locked.`,
                                'All violations are reported to your teacher.',
                            ].map((line, i) => (
                                <li key={i} className="flex items-start gap-2 text-[13px] sm:text-sm text-red-500 leading-relaxed">
                                    <span className="shrink-0 mt-0.5">•</span>{line}
                                </li>
                            ))}
                        </ul>
                    </div>
                    {answeredCount > 0 && (
                        <div className="bg-green-50 rounded-2xl border border-green-100 px-4 py-3 flex items-center gap-3">
                            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                            <p className="text-sm text-green-700 font-semibold">
                                Resuming — {answeredCount}/{quiz.questions.length} already answered
                            </p>
                        </div>
                    )}
                    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-4px_18px_rgba(0,0,0,0.08)] sm:static sm:p-0 sm:shadow-none sm:border-0 sm:bg-transparent">
                        <button
                            onClick={() => { setPhase('quiz'); goTo(0); }}
                            className="w-full bg-black text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 text-sm hover:bg-gray-900 active:scale-95 transition-all"
                        >
                            {answeredCount > 0 ? 'Continue Quiz' : 'Start Quiz'}
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    /* ────────── QUIZ ────────── */
    if (phase !== 'quiz' || !quiz) return null;

    const q = quiz.questions[currentIndex];
    const totalQ = quiz.questions.length;
    const answeredCount = Object.keys(answers).length;
    const isLast = currentIndex === totalQ - 1;
    const isFirst = currentIndex === 0;
    const timeLow = remaining <= 60 && remaining > 0;
    const timeCrit = remaining <= 30 && remaining > 0;

    const cellClass: Record<QState, string> = {
        active: 'bg-black text-white border-black',
        answered: 'bg-green-50 text-green-700 border-green-200',
        skipped: 'bg-orange-50 text-orange-500 border-orange-100',
        unanswered: 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-700',
    };

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col select-none">

            {/* ── "Time's Up" overlay — blocks the entire UI, retake impossible ── */}
            {timeExpired && !submittedRef.current && (
                <div className="fixed inset-0 z-[9998] bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center px-6 text-center">
                    <div className="w-20 h-20 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-5">
                        <Timer className="w-10 h-10 text-orange-500" />
                    </div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2">Time's Up!</h2>
                    <p className="text-gray-500 text-sm max-w-xs leading-relaxed mb-6">
                        Your time has expired. Submitting your answers now…
                    </p>
                    {submitting ? (
                        <div className="flex items-center gap-2 text-gray-500">
                            <Loader className="w-5 h-5 animate-spin" />
                            <span className="text-sm font-semibold">Submitting…</span>
                        </div>
                    ) : (
                        <button
                            onClick={() => submitQuiz(true)}
                            className="bg-black text-white font-black px-8 py-3 rounded-2xl flex items-center gap-2 hover:bg-gray-900 active:scale-95 transition-all"
                        >
                            <Send className="w-4 h-4" />
                            Submit Now
                        </button>
                    )}
                </div>
            )}

            {/* ── Black mask for proctoring ── */}
            {showMask && (
                <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center px-6 text-center">
                    {locked ? (
                        <>
                            <div className="w-20 h-20 rounded-2xl bg-red-900/30 border border-red-700/40 flex items-center justify-center mb-5">
                                <Lock className="w-10 h-10 text-red-400" />
                            </div>
                            <h2 className="text-2xl font-black text-red-400 mb-2">Quiz Locked</h2>
                            <p className="text-gray-400 text-sm max-w-xs leading-relaxed">
                                You've exceeded {MAX_WARNS} integrity violations. Contact your teacher.
                            </p>
                        </>
                    ) : (
                        <>
                            <div className="w-20 h-20 rounded-2xl bg-amber-900/20 border border-amber-700/30 flex items-center justify-center mb-5">
                                <AlertTriangle className="w-10 h-10 text-amber-400" />
                            </div>
                            <h2 className="text-2xl font-black text-amber-400 mb-1">Warning {warnCount}/{MAX_WARNS}</h2>
                            <p className="text-gray-400 text-sm max-w-xs leading-relaxed">
                                Switching tabs or taking screenshots is not allowed.
                            </p>
                            <p className="text-gray-600 text-xs mt-4">Screen will unblock automatically…</p>
                        </>
                    )}
                </div>
            )}

            {/* ── Header ── */}
            <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shrink-0">
                <div className="max-w-5xl mx-auto px-3 sm:px-4 min-h-14 py-2 flex items-center gap-2">
                    <button
                        onClick={() => setPhase('instructions')}
                        className="p-2 -ml-2 rounded-xl hover:bg-gray-100 text-gray-400 transition-colors shrink-0"
                        disabled={timeExpired}
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate text-gray-900 leading-tight">{quiz.title}</p>
                        <p className="text-[11px] text-gray-400 font-medium">Q{currentIndex + 1}/{totalQ} · {answeredCount} answered</p>
                    </div>
                    {warnCount > 0 && (
                        <div className="flex items-center gap-1 bg-orange-50 border border-orange-100 px-2 py-1 rounded-full shrink-0">
                            <Shield className="w-3 h-3 text-orange-500" />
                            <span className="text-[10px] font-black text-orange-500">{warnCount}/{MAX_WARNS}</span>
                        </div>
                    )}
                    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-black text-xs shrink-0 border transition-colors ${
                        timeCrit ? 'bg-red-50 text-red-500 border-red-100 animate-pulse'
                        : timeLow ? 'bg-orange-50 text-orange-500 border-orange-100'
                        : 'bg-gray-100 text-gray-700 border-gray-200'
                    }`}>
                        <Clock className="w-3.5 h-3.5" />
                        {formatSeconds(remaining)}
                    </div>
                </div>
                <div className="h-1 bg-gray-100">
                    <div
                        className="h-full bg-black transition-all duration-500"
                        style={{ width: `${totalQ > 0 ? ((currentIndex + 1) / totalQ) * 100 : 0}%` }}
                    />
                </div>
            </header>

            {/* ── Layout ── */}
            <div className="flex flex-1 min-h-0 max-w-5xl mx-auto w-full">

                {/* ── Question panel ── */}
                <main className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-5 pb-[calc(13.5rem+env(safe-area-inset-bottom))] lg:pb-6">
                    <div className="max-w-2xl mx-auto space-y-3 sm:space-y-4">

                        {/* Question card */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-3.5 sm:px-4 py-4 border-b border-gray-50 flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2.5 sm:gap-3 min-w-0 flex-1">
                                    <span className="w-8 h-8 rounded-xl bg-gray-100 text-gray-700 text-sm font-black flex items-center justify-center shrink-0 mt-0.5">
                                        {currentIndex + 1}
                                    </span>
                                    <p className="font-semibold text-gray-900 text-[15px] sm:text-sm leading-relaxed pt-0.5 sm:pt-1">{q.questionText}</p>
                                </div>
                                <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full shrink-0 whitespace-nowrap">
                                    {q.marks} {q.marks === 1 ? 'mark' : 'marks'}
                                </span>
                            </div>
                            <div className="p-2.5 sm:p-3 space-y-2">
                                {(Array.isArray(q.options) ? q.options : []).map((opt, oi) => {
                                    const selected = answers[q.id] === opt;
                                    return (
                                        <button
                                            key={`${q.id}-${oi}`}
                                            onClick={() => {
                                                if (timeExpired) return;
                                                setAnswers(prev => ({ ...prev, [q.id]: opt }));
                                                setVisited(prev => new Set([...prev, q.id]));
                                            }}
                                            disabled={timeExpired}
                                            className={`w-full min-h-[56px] text-left flex items-center gap-3 px-3.5 py-3.5 rounded-xl border transition-all duration-150 active:scale-[0.99] disabled:cursor-not-allowed ${
                                                selected
                                                    ? 'bg-green-50 border-green-300 text-gray-900'
                                                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100 hover:border-gray-300'
                                            }`}
                                        >
                                            <span className={`w-7 h-7 rounded-lg border text-[11px] font-black flex items-center justify-center shrink-0 transition-all ${
                                                selected ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-300 text-gray-500'
                                            }`}>
                                                {String.fromCharCode(65 + oi)}
                                            </span>
                                            <span className={`font-semibold text-[15px] sm:text-sm leading-snug flex-1 text-left ${selected ? 'text-gray-900' : 'text-gray-700'}`}>{opt}</span>
                                            {selected && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Nav buttons */}
                        <div className="hidden lg:flex items-center gap-2">
                            <button
                                onClick={() => { if (!isFirst) goTo(currentIndex - 1); }}
                                disabled={isFirst || timeExpired}
                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 font-bold text-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                            >
                                <ChevronLeft className="w-4 h-4" />Prev
                            </button>
                            <button
                                onClick={() => { markVisited(currentIndex); if (!isLast) goTo(currentIndex + 1); }}
                                disabled={isLast || timeExpired}
                                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-600 font-bold text-sm hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                            >
                                <SkipForward className="w-4 h-4" />Skip
                            </button>
                            {!isLast ? (
                                <button
                                    onClick={() => { setVisited(prev => new Set([...prev, q.id])); goTo(currentIndex + 1); }}
                                    disabled={timeExpired}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black text-white font-bold text-sm hover:bg-gray-900 disabled:opacity-50 active:scale-95 transition-all"
                                >
                                    Save & Next<ChevronRight className="w-4 h-4" />
                                </button>
                            ) : (
                                <button
                                    onClick={() => submitQuiz(false)}
                                    disabled={submitting || timeExpired}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-black text-white font-black text-sm hover:bg-gray-900 disabled:opacity-50 active:scale-95 transition-all"
                                >
                                    {submitting ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    Submit Quiz
                                </button>
                            )}
                        </div>
                    </div>
                </main>

                {/* ── Desktop sidebar ── */}
                <aside className="hidden lg:flex flex-col w-56 border-l border-gray-100 bg-white p-4 shrink-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Questions</p>

                    {/* Legend */}
                    <div className="space-y-1.5 mb-4">
                        {[
                            { dot: 'bg-green-100 border-green-200', label: 'Answered' },
                            { dot: 'bg-orange-50 border-orange-100', label: 'Skipped' },
                            { dot: 'bg-white border-gray-200', label: 'Not Visited' },
                        ].map(l => (
                            <div key={l.label} className="flex items-center gap-2">
                                <div className={`w-3.5 h-3.5 rounded border ${l.dot} shrink-0`} />
                                <span className="text-[11px] text-gray-400 font-semibold">{l.label}</span>
                            </div>
                        ))}
                    </div>

                    {/* Fixed-size grid — no aspect-square, no flex-1 */}
                    <div className="grid grid-cols-4 gap-1.5">
                        {quiz.questions.map((qq, i) => (
                            <button
                                key={qq.id}
                                onClick={() => goTo(i)}
                                disabled={timeExpired}
                                className={`w-full h-9 rounded-lg border text-xs font-black transition-all duration-150 disabled:cursor-not-allowed ${cellClass[getState(qq, i)]}`}
                            >
                                {i + 1}
                            </button>
                        ))}
                    </div>

                    <div className="mt-auto pt-4">
                        <button
                            onClick={() => submitQuiz(false)}
                            disabled={submitting || timeExpired}
                            className="w-full bg-black text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 text-sm hover:bg-gray-900 disabled:opacity-50 active:scale-95 transition-all"
                        >
                            {submitting ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                            Submit Quiz
                        </button>
                    </div>
                </aside>
            </div>

            {/* ── Mobile bottom bar ── */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-50 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
                <div
                    className="flex gap-1.5 px-3 pt-3 pb-2 overflow-x-auto"
                    style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
                >
                    {quiz.questions.map((qq, i) => (
                        <button
                            key={qq.id}
                            onClick={() => goTo(i)}
                            disabled={timeExpired}
                            className={`w-8 h-8 min-w-[32px] rounded-lg border text-[11px] font-black transition-all duration-150 shrink-0 disabled:cursor-not-allowed ${cellClass[getState(qq, i)]}`}
                        >
                            {i + 1}
                        </button>
                    ))}
                </div>
                <div className="px-3 pb-2 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-gray-400 mb-1">{answeredCount}/{totalQ} answered</p>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-black rounded-full transition-all duration-300"
                                style={{ width: `${totalQ > 0 ? (answeredCount / totalQ) * 100 : 0}%` }}
                            />
                        </div>
                    </div>
                    <button
                        onClick={() => { if (!isFirst) goTo(currentIndex - 1); }}
                        disabled={isFirst || timeExpired}
                        className="w-10 h-10 rounded-xl border border-gray-200 bg-white text-gray-600 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all"
                        aria-label="Previous question"
                    >
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => {
                            setVisited(prev => new Set([...prev, q.id]));
                            if (isLast) submitQuiz(false);
                            else goTo(currentIndex + 1);
                        }}
                        disabled={submitting || timeExpired}
                        className="shrink-0 min-w-[116px] h-10 bg-black text-white font-black px-4 rounded-xl flex items-center justify-center gap-2 text-sm hover:bg-gray-900 disabled:opacity-50 active:scale-95 transition-all"
                    >
                        {submitting ? (
                            <Loader className="w-4 h-4 animate-spin" />
                        ) : isLast ? (
                            <Send className="w-4 h-4" />
                        ) : (
                            <ChevronRight className="w-4 h-4" />
                        )}
                        {isLast ? 'Submit' : 'Next'}
                    </button>
                </div>
                <div className="h-[env(safe-area-inset-bottom)]" />
            </div>
        </div>
    );
}
