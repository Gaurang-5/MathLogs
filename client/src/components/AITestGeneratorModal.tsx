import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader, X, FileText, Check, Upload, Trash2, RefreshCw, Layers, Link2 } from 'lucide-react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import Dropdown from './Dropdown';

const ProgressSteps = [
    "Analyzing topic & constraints...",
    "Searching for reference materials...",
    "Drafting questions...",
    "Building anti-cheat variants...",
    "Finalizing test..."
];

function ProgressLoader() {
    const [stepIndex, setStepIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setStepIndex(prev => Math.min(prev + 1, ProgressSteps.length - 1));
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const progress = Math.min(((stepIndex + 1) / ProgressSteps.length) * 100, 95);

    return (
        <div className="w-full bg-white rounded-xl border border-black/10 p-8 flex flex-col items-center justify-center space-y-6">
            <div className="relative">
                <div className="absolute inset-0 bg-emerald-500 blur-xl opacity-20 rounded-full" />
                <Loader className="relative w-10 h-10 text-emerald-600 animate-spin" />
            </div>
            <div className="w-full max-w-sm space-y-3 text-center">
                <p className="text-sm font-bold text-neutral-900 animate-pulse">{ProgressSteps[stepIndex]}</p>
                <div className="h-1.5 w-full bg-neutral-100 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-emerald-500 transition-all duration-1000 ease-out" 
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
interface AITestGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    batches: { id: string; name: string }[];
    onSaved: () => void;
    quizToEdit?: any;
}

// A generated question with an optional `kept` flag for user approval
interface GeneratedQuestion {
    id?: string;
    questionText: string;
    marks: number;
    options: string[];
    correctAnswer: string;
    kept?: boolean;
    variantGroup?: string; // Non-null = this question is part of a sibling pair
}

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function formatLocalDateTimeInput(date: Date) {
    const offsetMs = date.getTimezoneOffset() * 60 * 1000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

const difficultyOptions = [
    { value: 'Easy', label: 'Easy' },
    { value: 'Medium', label: 'Medium' },
    { value: 'Hard', label: 'Hard' },
    { value: 'Olympiad / Competitive', label: 'Olympiad / Competitive' }
];

export default function AITestGeneratorModal({ isOpen, onClose, batches, onSaved, quizToEdit }: AITestGeneratorModalProps) {
    const [topic, setTopic] = useState('');
    const [grade, setGrade] = useState('');
    const [difficulty, setDifficulty] = useState('Medium');
    const [questionCount, setQuestionCount] = useState('10');

    // Optional multimodal files and comments
    const [files, setFiles] = useState<File[]>([]);
    const [comments, setComments] = useState('');

    // Save-specific state
    const [batchIds, setBatchIds] = useState<string[]>([]);
    const [timeLimitMins, setTimeLimitMins] = useState('30');
    const [availableFrom, setAvailableFrom] = useState(() => formatLocalDateTimeInput(new Date()));
    const [availableUntil, setAvailableUntil] = useState(() => formatLocalDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)));

    // Track original questions when regenerated
    const [pendingReverts, setPendingReverts] = useState<Record<string, GeneratedQuestion[]>>({});

    const handleRevertQuestion = (regenId: string) => {
        if (!generatedTest) return;
        const oldQuestions = pendingReverts[regenId];
        if (!oldQuestions) return;

        // Find where the new questions are
        const firstIndex = generatedTest.questions.findIndex((q: any) => q.regenId === regenId);
        const count = generatedTest.questions.filter((q: any) => q.regenId === regenId).length;

        if (firstIndex !== -1) {
            const updatedQuestions = [...generatedTest.questions];
            updatedQuestions.splice(firstIndex, count, ...oldQuestions);
            
            const newReverts = { ...pendingReverts };
            delete newReverts[regenId];
            setPendingReverts(newReverts);

            setGeneratedTest({
                ...generatedTest,
                questions: updatedQuestions,
                totalMarks: recalcTotalMarks(updatedQuestions)
            });
            toast.success('Reverted to original questions.');
        }
    };

    const handleConfirmRegeneration = (regenId: string) => {
        if (!generatedTest) return;
        
        const updatedQuestions = generatedTest.questions.map((q: any) => {
            if (q.regenId === regenId) {
                const { regenId: _, ...rest } = q;
                return rest;
            }
            return q;
        });

        const newReverts = { ...pendingReverts };
        delete newReverts[regenId];
        setPendingReverts(newReverts);

        setGeneratedTest({ ...generatedTest, questions: updatedQuestions });
        toast.success('New questions confirmed.');
    };
    const [saving, setSaving] = useState(false);

    const [generating, setGenerating] = useState(false);
    const [withVariants, setWithVariants] = useState(true); // default ON for anti-cheat
    const [generatedTest, setGeneratedTest] = useState<{ title: string; totalMarks: number; questions: GeneratedQuestion[]; hasVariants?: boolean } | null>(null);
    const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
    const [regeneratingUnkept, setRegeneratingUnkept] = useState(false);

    useEffect(() => {
        if (isOpen && quizToEdit) {
            setTopic(quizToEdit.topic || '');
            const targetGrade = quizToEdit.batch?.className || quizToEdit.batch?.name || '10th Grade';
            setGrade(targetGrade);
            setDifficulty(quizToEdit.difficulty || 'Medium');
            setQuestionCount(quizToEdit.studentQuestionCount ? String(quizToEdit.studentQuestionCount) : String(quizToEdit.questions?.length || 10));
            setBatchIds(quizToEdit.batchIds || (quizToEdit.batchId ? [quizToEdit.batchId] : []) || (quizToEdit.batch?.id ? [quizToEdit.batch.id] : []));

            if (quizToEdit.availableFrom) setAvailableFrom(formatLocalDateTimeInput(new Date(quizToEdit.availableFrom)));
            if (quizToEdit.availableUntil) setAvailableUntil(formatLocalDateTimeInput(new Date(quizToEdit.availableUntil)));
            if (quizToEdit.timeLimitMins) setTimeLimitMins(String(quizToEdit.timeLimitMins));

            const mappedQuestions: GeneratedQuestion[] = (quizToEdit.questions || []).map((q: any) => ({
                id: q.id,
                questionText: q.questionText,
                marks: q.marks || 1,
                options: Array.isArray(q.options)
                    ? q.options
                    : (typeof q.options === 'string' ? JSON.parse(q.options) : []),
                correctAnswer: q.correctOption || q.correctAnswer || '',
                variantGroup: q.variantGroup || undefined,
                kept: false
            }));

            setGeneratedTest({
                title: quizToEdit.title,
                totalMarks: quizToEdit.totalMarks,
                questions: mappedQuestions
            });
        }
    }, [isOpen, quizToEdit]);

    const batchOptions = useMemo(() => {
        return batches.map(b => ({ value: b.id, label: b.name }));
    }, [batches]);

    // Derived: how many questions are kept vs unkept
    const keptCount = generatedTest?.questions.filter(q => q.kept).length ?? 0;
    const unkeptCount = (generatedTest?.questions.length ?? 0) - keptCount;

    const recalcTotalMarks = useCallback((questions: GeneratedQuestion[]) => {
        return questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);
    }, []);

    const displayLabels = useMemo(() => {
        if (!generatedTest?.questions) return [];
        const labels: string[] = [];
        let currentNumber = 1;
        let lastVariantGroup: string | null = null;
        let variantSubIndex = 0;

        for (let i = 0; i < generatedTest.questions.length; i++) {
            const q = generatedTest.questions[i];
            if (!q.variantGroup) {
                labels.push(`Question ${currentNumber}`);
                currentNumber++;
                lastVariantGroup = null;
            } else {
                if (q.variantGroup !== lastVariantGroup) {
                    lastVariantGroup = q.variantGroup;
                    variantSubIndex = 0;
                } else {
                    variantSubIndex++;
                }
                labels.push(`Question ${currentNumber}${String.fromCharCode(65 + variantSubIndex)}`);
                
                // If next question isn't in this variant group, increment currentNumber
                const nextQ = generatedTest.questions[i + 1];
                if (!nextQ || nextQ.variantGroup !== q.variantGroup) {
                    currentNumber++;
                }
            }
        }
        return labels;
    }, [generatedTest?.questions]);

    const validateAndAddFiles = (selectedFiles: FileList | null) => {
        if (!selectedFiles) return;
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];
        const maxSizeBytes = 10 * 1024 * 1024;
        const updatedFiles = [...files];
        const invalidFiles: string[] = [];

        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            if (updatedFiles.length >= 5) {
                toast.error('Maximum 5 files can be uploaded.');
                break;
            }
            if (!allowedTypes.includes(file.type)) {
                invalidFiles.push(`${file.name} (unsupported file type)`);
                continue;
            }
            if (file.size > maxSizeBytes) {
                invalidFiles.push(`${file.name} (exceeds 10MB)`);
                continue;
            }
            updatedFiles.push(file);
        }

        if (invalidFiles.length > 0) {
            toast.error(`Some files were ignored:\n${invalidFiles.join('\n')}`);
        }
        setFiles(updatedFiles);
    };

    const handleGenerate = async (e: React.FormEvent) => {
        e.preventDefault();
        setGenerating(true);
        setGeneratedTest(null);

        try {
            const formData = new FormData();
            formData.append('topic', topic);
            formData.append('grade', grade);
            formData.append('difficulty', difficulty);
            formData.append('questionCount', questionCount);
            formData.append('withVariants', String(withVariants));
            if (files.length > 0) {
                files.forEach(f => formData.append('files', f));
            }
            if (comments.trim()) {
                formData.append('comments', comments.trim());
            }

            const res = await api.post('/tests/generate', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeoutMs: 120000
            });

            // Attach `kept: false` to all generated questions
            const questions: GeneratedQuestion[] = (res.questions || []).map((q: any) => ({ ...q, kept: false }));
            setGeneratedTest({ ...res, questions });

            if (res.warnings?.length > 0) {
                toast.error(res.warnings.join('\n'), { duration: 6000 });
            }
            toast.success('Test generated successfully!');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to generate test. Please try again.'));
        } finally {
            setGenerating(false);
        }
    };

    // Toggle kept state for one question
    const toggleKept = (index: number) => {
        if (!generatedTest) return;
        const updatedQuestions = generatedTest.questions.map((q, i) =>
            i === index ? { ...q, kept: !q.kept } : q
        );
        setGeneratedTest({ ...generatedTest, questions: updatedQuestions });
    };

    // Regenerate a single question (or variant group) and allow reverting
    const handleRegenerateQuestion = async (index: number) => {
        if (!generatedTest) return;
        setRegeneratingIndex(index);
        try {
            const targetQ = generatedTest.questions[index];
            
            let groupIndices = [index];
            let isGroup = false;
            if (targetQ.variantGroup) {
                isGroup = true;
                groupIndices = generatedTest.questions
                    .map((q, i) => q.variantGroup === targetQ.variantGroup ? i : -1)
                    .filter(i => i !== -1);
            }
            
            const excludeQuestions = generatedTest.questions.map(q => q.questionText);
            const res = await api.post('/tests/generate-single-question', {
                topic,
                grade,
                difficulty,
                excludeQuestions,
                comments: comments.trim() || undefined
            }, { timeoutMs: 60000 });

            const newQuestions: any[] = [];
            
            if (isGroup) {
                const newVariantGroup = Date.now().toString();
                newQuestions.push({ ...res, variantGroup: newVariantGroup });
                
                const variantRes = await api.post('/tests/generate-variant-question', {
                    topic,
                    grade,
                    difficulty,
                    originalQuestion: res.questionText,
                    comments: comments.trim() || undefined
                }, { timeoutMs: 60000 });
                newQuestions.push({ ...variantRes, variantGroup: newVariantGroup });
            } else {
                newQuestions.push(res);
            }

            const regenId = Date.now().toString();
            const oldQuestions = groupIndices.map(i => generatedTest.questions[i]);
            
            const processedNewQuestions = newQuestions.map(q => ({
                ...q,
                kept: false,
                regenId
            }));

            const updatedQuestions = [...generatedTest.questions];
            updatedQuestions.splice(groupIndices[0], groupIndices.length, ...processedNewQuestions);

            setPendingReverts(prev => ({ ...prev, [regenId]: oldQuestions }));
            setGeneratedTest({
                ...generatedTest,
                questions: updatedQuestions,
                totalMarks: recalcTotalMarks(updatedQuestions)
            });
            toast.success(`Regenerated successfully!`);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to regenerate question.'));
        } finally {
            setRegeneratingIndex(null);
        }
    };

    const handleGenerateVariant = async (index: number) => {
        if (!generatedTest) return;
        setRegeneratingIndex(index);
        try {
            const originalQuestion = generatedTest.questions[index];
            const res = await api.post('/tests/generate-variant-question', {
                topic,
                grade,
                difficulty,
                originalQuestion: originalQuestion.questionText,
                comments: comments.trim() || undefined
            }, { timeoutMs: 60000 });

            // Assign a common variantGroup
            const variantGroupId = `vgroup-${Date.now()}`;
            const updatedOriginal = { ...originalQuestion, variantGroup: variantGroupId };
            const newVariant = { ...res, kept: false, variantGroup: variantGroupId };
            
            const updatedQuestions = [...generatedTest.questions];
            updatedQuestions[index] = updatedOriginal;
            // Insert variant right after the original
            updatedQuestions.splice(index + 1, 0, newVariant);

            setGeneratedTest({
                ...generatedTest,
                questions: updatedQuestions,
                totalMarks: recalcTotalMarks(updatedQuestions) // (Note: totalMarks logic remains simple sum for now)
            });
            toast.success(`Variant created for Question ${index + 1}!`);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to generate variant.'));
        } finally {
            setRegeneratingIndex(null);
        }
    };

    // Regenerate all unkept questions while preserving kept ones in their original positions
    const handleRegenerateUnkept = async () => {
        if (!generatedTest || unkeptCount === 0) return;
        setRegeneratingUnkept(true);

        // Kept questions are excluded from AI (don't regenerate duplicates)
        const keptTexts = generatedTest.questions.filter(q => q.kept).map(q => q.questionText);

        try {
            // Fire one request per unkept slot (sequentially to avoid duplicate excludes)
            const updatedQuestions = [...generatedTest.questions];
            const excludeSoFar = [...keptTexts];

            for (let i = 0; i < updatedQuestions.length; i++) {
                if (updatedQuestions[i].kept) continue;

                const res = await api.post('/tests/generate-single-question', {
                    topic,
                    grade,
                    difficulty,
                    excludeQuestions: [...excludeSoFar],
                    comments: comments.trim() || undefined
                }, { timeoutMs: 60000 });

                updatedQuestions[i] = { ...res, kept: false };
                excludeSoFar.push(res.questionText);
            }

            setGeneratedTest({
                ...generatedTest,
                questions: updatedQuestions,
                totalMarks: recalcTotalMarks(updatedQuestions)
            });
            toast.success(`${unkeptCount} question${unkeptCount > 1 ? 's' : ''} regenerated!`);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to regenerate unkept questions.'));
        } finally {
            setRegeneratingUnkept(false);
        }
    };

    const handleSaveTest = async () => {
        if (!generatedTest || batchIds.length === 0) {
            toast.error('Please assign the quiz to at least one batch.');
            return;
        }

        if (!availableFrom || !availableUntil) {
            toast.error('Please set the quiz availability window');
            return;
        }

        const fromDate = new Date(availableFrom);
        const untilDate = new Date(availableUntil);
        if (Number.isNaN(fromDate.getTime()) || Number.isNaN(untilDate.getTime()) || untilDate <= fromDate) {
            toast.error('Quiz end time must be after the start time');
            return;
        }

        setSaving(true);
        try {
            if (quizToEdit) {
                await api.put(`/tests/online/${quizToEdit.id}`, {
                    title: generatedTest.title,
                    topic,
                    difficulty,
                    timeLimitMins: parseInt(timeLimitMins) || 30,
                    totalMarks: generatedTest.totalMarks,
                    availableFrom: fromDate.toISOString(),
                    availableUntil: untilDate.toISOString(),
                    batchIds,
                    questions: generatedTest.questions,
                    studentQuestionCount: parseInt(questionCount) || null
                });
                toast.success('Online Quiz updated successfully!');
            } else {
                await api.post('/tests/online', {
                    title: generatedTest.title,
                    topic,
                    difficulty,
                    timeLimitMins: parseInt(timeLimitMins) || 30,
                    totalMarks: generatedTest.totalMarks,
                    availableFrom: fromDate.toISOString(),
                    availableUntil: untilDate.toISOString(),
                    batchIds,
                    questions: generatedTest.questions,
                    studentQuestionCount: parseInt(questionCount) || null
                });
                toast.success('Online Quiz saved successfully!');
            }
            onSaved();
            onClose();
        } catch (error) {
            toast.error(getErrorMessage(error, quizToEdit ? 'Failed to update quiz.' : 'Failed to save quiz.'));
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        setTopic('');
        setGrade('');
        setDifficulty('Medium');
        setQuestionCount('10');
        setFiles([]);
        setComments('');
        setGeneratedTest(null);
        setBatchIds([]);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="relative w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[92dvh] sm:h-auto sm:max-h-[90vh]"
                    >
                        <div className="flex items-center gap-3 sm:gap-4 px-4 py-3.5 sm:p-6 border-b border-black/[0.06] shrink-0 bg-white sm:bg-gradient-to-r sm:from-neutral-50 sm:to-white">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0 border border-neutral-200">
                                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-neutral-900" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2 className="text-lg sm:text-2xl font-black text-black truncate leading-tight">
                                    {quizToEdit ? 'Edit Quiz' : 'AI Test Generator'}
                                </h2>
                                <p className="text-sm text-app-text-tertiary truncate">
                                    {quizToEdit ? 'Modify quiz questions and settings' : 'Generate ready-to-use tests instantly'}
                                </p>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-2 text-app-text-tertiary hover:text-black hover:bg-black/5 rounded-full transition-colors shrink-0"
                            >
                                <X className="w-5 h-5 sm:w-6 sm:h-6" />
                            </button>
                        </div>

                        <div className="px-4 py-5 sm:p-6 overflow-y-auto flex-1 overscroll-contain pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
                            {!generatedTest ? (
                                <form onSubmit={handleGenerate} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-app-text-secondary uppercase mb-2">Topic / Subject</label>
                                        <input
                                            type="text"
                                            placeholder="e.g. Linear Equations in Two Variables"
                                            className="w-full min-h-12 bg-neutral-50 border border-black/10 px-3.5 py-3 rounded-xl focus:outline-none focus:border-black font-medium text-base sm:text-sm"
                                            value={topic}
                                            onChange={e => setTopic(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-app-text-secondary uppercase mb-2">Grade / Class</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. 10th Grade"
                                                className="w-full min-h-12 bg-neutral-50 border border-black/10 px-3.5 py-3 rounded-xl focus:outline-none focus:border-black font-medium text-base sm:text-sm"
                                                value={grade}
                                                onChange={e => setGrade(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-app-text-secondary uppercase mb-2">No. of Questions</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="50"
                                                className="w-full min-h-12 bg-neutral-50 border border-black/10 px-3.5 py-3 rounded-xl focus:outline-none focus:border-black font-medium text-base sm:text-sm"
                                                value={questionCount}
                                                onChange={e => setQuestionCount(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <Dropdown
                                            label="Difficulty"
                                            value={difficulty}
                                            onChange={setDifficulty}
                                            options={difficultyOptions}
                                        />
                                    </div>

                                    {/* Multimodal document/photo reference upload */}
                                    <div className="border border-neutral-100 rounded-xl p-3.5 sm:p-4 bg-neutral-50/50">
                                        <label className="block text-xs font-bold text-app-text-secondary uppercase mb-2">
                                            Upload Reference Documents / Photos (Max 5, Optional)
                                        </label>
                                        <div className="flex flex-col gap-3">
                                            <label className="flex min-h-32 flex-col items-center justify-center border border-dashed border-black/10 rounded-xl p-4 sm:p-5 bg-white hover:bg-neutral-50 cursor-pointer transition-all">
                                                <div className="flex flex-col items-center justify-center text-center gap-1.5">
                                                    <Upload className="w-5 h-5 text-neutral-400" />
                                                    <span className="text-sm font-bold text-neutral-800">Select or drop files</span>
                                                    <span className="text-xs text-app-text-tertiary leading-relaxed">JPEG, PNG, WebP, PDF, TXT up to 10MB each</span>
                                                </div>
                                                <input
                                                    type="file"
                                                    accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"
                                                    multiple
                                                    className="hidden"
                                                    onChange={e => validateAndAddFiles(e.target.files)}
                                                />
                                            </label>

                                            {files.length > 0 && (
                                                <div className="space-y-1.5 mt-1">
                                                    {files.map((f, idx) => (
                                                        <div key={idx} className="flex items-center justify-between gap-2 bg-white border border-black/5 px-3 py-2.5 rounded-lg text-sm">
                                                            <div className="flex items-center gap-2 truncate">
                                                                <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
                                                                <span className="font-semibold text-neutral-700 truncate">{f.name}</span>
                                                                <span className="hidden sm:inline text-xs text-neutral-400">({(f.size / (1024 * 1024)).toFixed(2)} MB)</span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                                                                className="text-neutral-400 hover:text-red-600 transition-colors p-1"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Optional prompt guidelines */}
                                    <div>
                                        <label className="block text-xs font-bold text-app-text-secondary uppercase mb-2">
                                            Custom Prompt / Comments (Optional)
                                        </label>
                                        <textarea
                                            placeholder="e.g. Focus on word problems involving speed, or make sure the questions are derived from the uploaded notes."
                                            rows={3}
                                            className="w-full bg-neutral-50 border border-black/10 p-3 rounded-xl focus:outline-none focus:border-black font-medium text-base sm:text-sm leading-relaxed"
                                            value={comments}
                                            onChange={e => setComments(e.target.value)}
                                        />
                                    </div>

                                    <div className="flex items-start sm:items-center gap-3 bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 sm:p-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <Layers className="w-4 h-4 text-app-text" />
                                                <h4 className="font-bold text-sm text-app-text">Generate with Variants (Anti-Cheat)</h4>
                                            </div>
                                            <p className="text-xs text-app-text-secondary mt-1 leading-relaxed">Creates two versions of each concept to prevent cheating.</p>
                                        </div>
                                        <button
                                            type="button"
                                            role="switch"
                                            aria-checked={withVariants}
                                            onClick={() => setWithVariants(!withVariants)}
                                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${withVariants ? 'bg-emerald-500' : 'bg-neutral-300'}`}
                                        >
                                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${withVariants ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>
                                    </div>

                                    <div className="sticky bottom-3 z-10 pt-3 pb-[env(safe-area-inset-bottom)]">
                                        {generating ? (
                                            <ProgressLoader />
                                        ) : (
                                            <button
                                                type="submit"
                                                disabled={!topic || !grade}
                                                className="w-full min-h-12 bg-neutral-900 text-white font-bold py-4 rounded-xl hover:bg-neutral-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-2xl shadow-black/20"
                                            >
                                                <Sparkles className="w-5 h-5" />
                                                Generate with AI
                                            </button>
                                        )}
                                    </div>
                                </form>
                            ) : (
                                <div className="space-y-4 sm:space-y-6">
                                    {/* Test title banner */}
                                    <div className="bg-emerald-50 border border-emerald-200 p-3.5 sm:p-4 rounded-xl flex items-center gap-3">
                                        <div className="w-9 h-9 sm:w-10 sm:h-10 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                                            <Check className="w-5 h-5 text-emerald-700" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <input
                                                type="text"
                                                className="w-full bg-transparent border-b border-emerald-200 hover:border-emerald-300 focus:border-emerald-500 focus:outline-none font-bold text-emerald-900 pb-0.5 text-base"
                                                value={generatedTest.title}
                                                onChange={(e) => setGeneratedTest({ ...generatedTest, title: e.target.value })}
                                            />
                                            <p className="text-xs text-emerald-700 mt-1">
                                                Total Marks: {generatedTest.totalMarks} • {generatedTest.questions.length} Questions
                                                {keptCount > 0 && (
                                                    <span className="ml-2 text-emerald-600 font-bold">• {keptCount} kept ✓</span>
                                                )}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Bulk Regenerate Unkept Banner — shown when at least one question is kept */}
                                    {keptCount > 0 && unkeptCount > 0 && (
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-slate-800">
                                                    {keptCount} question{keptCount > 1 ? 's' : ''} kept · {unkeptCount} will be replaced
                                                </p>
                                                <p className="text-xs text-slate-500 mt-0.5">Kept questions stay; unkept ones will be regenerated with AI.</p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleRegenerateUnkept}
                                                disabled={regeneratingUnkept}
                                                className="w-full sm:w-auto min-h-11 shrink-0 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95"
                                            >
                                                {regeneratingUnkept ? (
                                                    <Loader className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    <RefreshCw className="w-3.5 h-3.5" />
                                                )}
                                                {regeneratingUnkept ? 'Regenerating...' : `Regenerate ${unkeptCount} Unkept`}
                                            </button>
                                        </div>
                                    )}

                                    {/* Questions list */}
                                    <div className="space-y-4">
                                        {generatedTest.questions.map((q, i) => {
                                            const isVariantA = q.variantGroup && generatedTest.questions.findIndex(x => x.variantGroup === q.variantGroup) === i;
                                            const isVariantB = q.variantGroup && !isVariantA;

                                            return (
                                                <div
                                                    key={i}
                                                    className={`border rounded-xl p-3.5 sm:p-4 space-y-3 transition-all duration-200 ${
                                                        q.kept
                                                            ? 'border-emerald-400 bg-emerald-50/30 shadow-sm'
                                                            : 'border-black/10 bg-white'
                                                    } ${q.variantGroup ? 'relative' : ''}`}
                                                >
                                                    {/* Sibling linker visual line */}
                                                    {isVariantA && generatedTest.questions.find((x, idx) => x.variantGroup === q.variantGroup && idx !== i) && (
                                                        <div className="absolute left-6 -bottom-4 w-px h-4 bg-neutral-300 z-10" />
                                                    )}

                                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <label className="text-xs font-bold text-neutral-400 uppercase flex items-center gap-2">
                                                                    {q.variantGroup && <Link2 className="w-3.5 h-3.5" />}
                                                                    {displayLabels[i]}
                                                                </label>
                                                                {q.kept && (
                                                                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded">
                                                                        Kept
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <textarea
                                                                rows={2}
                                                                className="w-full bg-neutral-50/50 border border-black/5 hover:border-black/20 focus:border-neutral-900 p-2.5 rounded-lg text-sm font-medium focus:outline-none focus:bg-white transition-all text-black"
                                                            value={q.questionText}
                                                            onChange={(e) => {
                                                                const updatedQuestions = generatedTest.questions.map((item, idx) =>
                                                                    idx === i ? { ...item, questionText: e.target.value } : item
                                                                );
                                                                setGeneratedTest({ ...generatedTest, questions: updatedQuestions });
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="w-full sm:w-24 shrink-0">
                                                        <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Marks</label>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            className="w-full bg-neutral-50/50 border border-black/5 hover:border-black/20 focus:border-neutral-900 p-2.5 rounded-lg text-base sm:text-sm font-medium focus:outline-none focus:bg-white transition-all text-black sm:text-center"
                                                            value={q.marks}
                                                            onChange={(e) => {
                                                                const newMark = Number(e.target.value) || 1;
                                                                const updatedQuestions = generatedTest.questions.map((item, idx) =>
                                                                    idx === i ? { ...item, marks: newMark } : item
                                                                );
                                                                setGeneratedTest({
                                                                    ...generatedTest,
                                                                    questions: updatedQuestions,
                                                                    totalMarks: recalcTotalMarks(updatedQuestions)
                                                                });
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                {q.options && q.options.length > 0 && (
                                                    <div>
                                                        <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Options</label>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                            {q.options.map((opt: string, oi: number) => (
                                                                <div key={oi} className="relative flex items-center bg-neutral-50 rounded-lg border border-black/5">
                                                                    <span className="pl-3 pr-1 text-sm font-bold text-neutral-400">{String.fromCharCode(65 + oi)}.</span>
                                                                    <input
                                                                        type="text"
                                                                        className="w-full bg-transparent p-2.5 rounded-lg text-sm font-medium focus:outline-none text-black"
                                                                        value={opt}
                                                                        onChange={(e) => {
                                                                            const updatedOptions = q.options.map((o: string, oidx: number) =>
                                                                                oidx === oi ? e.target.value : o
                                                                            );
                                                                            const updatedQuestions = generatedTest.questions.map((item, idx) =>
                                                                                idx === i ? { ...item, options: updatedOptions } : item
                                                                            );
                                                                            setGeneratedTest({ ...generatedTest, questions: updatedQuestions });
                                                                        }}
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="space-y-3 pt-3 border-t border-black/5">
                                                    <div>
                                                        <label className="block text-xs font-bold text-neutral-400 uppercase mb-1">Correct Answer</label>
                                                        {q.options && q.options.length > 0 ? (
                                                            <div className="grid grid-cols-1 gap-2">
                                                                {q.options.map((opt: string, oi: number) => {
                                                                    const selected = q.correctAnswer === opt;
                                                                    return (
                                                                        <button
                                                                            key={`${i}-answer-${oi}`}
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const updatedQuestions = generatedTest.questions.map((item, idx) =>
                                                                                    idx === i ? { ...item, correctAnswer: opt } : item
                                                                                );
                                                                                setGeneratedTest({ ...generatedTest, questions: updatedQuestions });
                                                                            }}
                                                                            className={`min-h-11 w-full rounded-xl border px-3 py-2.5 text-left transition-all active:scale-[0.99] ${
                                                                                selected
                                                                                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                                                                    : 'border-black/5 bg-neutral-50/70 text-black hover:border-black/15 hover:bg-white'
                                                                            }`}
                                                                        >
                                                                            <span className="flex items-start gap-3">
                                                                                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                                                                                    selected
                                                                                        ? 'bg-emerald-600 text-white'
                                                                                        : 'bg-white text-neutral-400 border border-black/10'
                                                                                }`}>
                                                                                    {String.fromCharCode(65 + oi)}
                                                                                </span>
                                                                                <span className="min-w-0 flex-1 text-sm font-semibold leading-relaxed">{opt}</span>
                                                                                {selected && <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />}
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                                                                Add options above to choose the correct answer.
                                                            </p>
                                                        )}
                                                        {q.correctAnswer && q.options?.length > 0 && !q.options.includes(q.correctAnswer) && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    const updatedQuestions = generatedTest.questions.map((item, idx) =>
                                                                        idx === i ? { ...item, correctAnswer: q.options[0] || '' } : item
                                                                    );
                                                                    setGeneratedTest({ ...generatedTest, questions: updatedQuestions });
                                                                }}
                                                                className="mt-2 text-xs font-bold text-amber-700 underline"
                                                            >
                                                                Current answer is not in options. Tap to use option A.
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2 w-full">
                                                        {q.regenId ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRevertQuestion(q.regenId!)}
                                                                    className="min-h-10 flex items-center justify-center gap-1.5 px-3 py-2 bg-neutral-100 hover:bg-red-50 text-xs font-bold text-neutral-600 hover:text-red-600 hover:border-red-200 rounded-lg transition-all active:scale-95 border border-transparent"
                                                                >
                                                                    Revert
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleConfirmRegeneration(q.regenId!)}
                                                                    className="min-h-10 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-xs font-bold text-white rounded-lg transition-all active:scale-95 shadow-sm"
                                                                >
                                                                    Confirm New Question
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                {/* Regenerate single question */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRegenerateQuestion(i)}
                                                                    disabled={regeneratingIndex === i || regeneratingUnkept}
                                                                    className="min-h-10 flex items-center justify-center gap-1.5 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-xs font-bold text-neutral-800 rounded-lg transition-all disabled:opacity-50 active:scale-95"
                                                                >
                                                                    {regeneratingIndex === i ? (
                                                                        <Loader className="w-3.5 h-3.5 animate-spin" />
                                                                    ) : (
                                                                        <Sparkles className="w-3.5 h-3.5" />
                                                                    )}
                                                                    {regeneratingIndex === i ? 'Regenerating...' : 'Regenerate'}
                                                                </button>

                                                                {!q.variantGroup && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleGenerateVariant(i)}
                                                                        disabled={regeneratingIndex === i || regeneratingUnkept}
                                                                        className="col-span-2 sm:col-span-1 min-h-10 flex items-center justify-center gap-1.5 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-xs font-bold text-emerald-600 rounded-lg transition-all disabled:opacity-50 active:scale-95 border border-emerald-200"
                                                                    >
                                                                        {regeneratingIndex === i ? (
                                                                            <Loader className="w-3.5 h-3.5 animate-spin" />
                                                                        ) : (
                                                                            <Layers className="w-3.5 h-3.5" />
                                                                        )}
                                                                        Create Variant
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            );
                                        })}
                                    </div>

                                    {/* Quiz Settings */}
                                    <div className="bg-neutral-50 border border-neutral-100 p-3.5 sm:p-4 rounded-xl mt-4 space-y-4">
                                        <h4 className="font-bold text-neutral-900 text-sm">Quiz Settings</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="col-span-1 sm:col-span-2">
                                                <label className="block text-xs font-bold text-neutral-800 uppercase mb-2">Assign to Batches</label>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-48 overflow-y-auto p-3 bg-white border border-neutral-200 rounded-lg">
                                                    {batchOptions.length === 0 ? (
                                                        <p className="text-sm text-neutral-400 col-span-full">No batches available.</p>
                                                    ) : (
                                                        batchOptions.map(b => (
                                                            <label key={b.value} className="flex items-center gap-2 text-sm font-medium cursor-pointer text-neutral-700 hover:text-black">
                                                                <input 
                                                                    type="checkbox" 
                                                                    className="w-4 h-4 text-emerald-600 rounded border-neutral-300 focus:ring-emerald-500 accent-emerald-600"
                                                                    checked={batchIds.includes(b.value)}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            setBatchIds([...batchIds, b.value]);
                                                                        } else {
                                                                            setBatchIds(batchIds.filter(id => id !== b.value));
                                                                        }
                                                                    }}
                                                                />
                                                                {b.label}
                                                            </label>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-neutral-800 uppercase mb-2">Time Limit (mins)</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    className="w-full bg-white border border-neutral-200 p-2.5 rounded-lg focus:outline-none focus:border-black font-medium text-sm"
                                                    value={timeLimitMins}
                                                    onChange={e => setTimeLimitMins(e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-neutral-800 uppercase mb-2">Available From</label>
                                                <input
                                                    type="datetime-local"
                                                    className="w-full bg-white border border-neutral-200 p-2.5 rounded-lg focus:outline-none focus:border-black font-medium text-sm"
                                                    value={availableFrom}
                                                    onChange={e => setAvailableFrom(e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-neutral-800 uppercase mb-2">Available Until</label>
                                                <input
                                                    type="datetime-local"
                                                    className="w-full bg-white border border-neutral-200 p-2.5 rounded-lg focus:outline-none focus:border-black font-medium text-sm"
                                                    value={availableUntil}
                                                    onChange={e => setAvailableUntil(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t border-black/5 flex flex-col sm:flex-row gap-2 sm:gap-3">
                                        {quizToEdit ? (
                                            <button onClick={handleClose} className="flex-1 min-h-11 bg-neutral-100 text-black font-bold py-3 rounded-xl hover:bg-neutral-200">
                                                Cancel
                                            </button>
                                        ) : (
                                            <button onClick={() => setGeneratedTest(null)} className="flex-1 min-h-11 bg-neutral-100 text-black font-bold py-3 rounded-xl hover:bg-neutral-200">
                                                Discard & Try Again
                                            </button>
                                        )}
                                        <button
                                            onClick={handleSaveTest}
                                            disabled={saving || batchIds.length === 0}
                                            className="flex-1 min-h-11 bg-neutral-900 text-white font-bold py-3 rounded-xl hover:bg-neutral-800 flex justify-center items-center gap-2 disabled:opacity-50"
                                        >
                                            {saving ? <Loader className="w-5 h-5 animate-spin" /> : <FileText className="w-5 h-5" />}
                                            {saving ? 'Saving...' : (quizToEdit ? 'Save Changes' : 'Save & Publish Quiz')}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
