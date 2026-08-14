import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Image, Upload, Check, ArrowUp, ArrowDown, Sparkles, Layers, BookOpen, Clock, Loader2 } from 'lucide-react';
import { api, apiRequest } from '../utils/api';
import toast from 'react-hot-toast';
import Dropdown from './Dropdown';

interface ManualQuestion {
    id?: string;
    questionText: string;
    imageUrl?: string;
    options: string[];
    correctOption: string | string[];
    marks: number;
}

interface ManualQuizModalProps {
    isOpen: boolean;
    onClose: () => void;
    batches: { id: string; name: string }[];
    onSaved: () => void;
    quizToEdit?: any;
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

function getCorrectOptions(value: string | string[] | undefined): string[] {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [value];
    } catch {
        return [value];
    }
}

export default function ManualQuizModal({ isOpen, onClose, batches, onSaved, quizToEdit }: ManualQuizModalProps) {
    const [title, setTitle] = useState('');
    const [topic, setTopic] = useState('');
    const [difficulty, setDifficulty] = useState('Medium');
    const [timeLimitMins, setTimeLimitMins] = useState('30');
    const [batchIds, setBatchIds] = useState<string[]>([]);
    const [availableFrom, setAvailableFrom] = useState(() => formatLocalDateTimeInput(new Date()));
    const [availableUntil, setAvailableUntil] = useState(() => formatLocalDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)));

    const [questions, setQuestions] = useState<ManualQuestion[]>([
        {
            questionText: '',
            imageUrl: '',
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctOption: 'Option A',
            marks: 1
        }
    ]);

    const [savingMode, setSavingMode] = useState<'draft' | 'publish' | null>(null);
    const [showBankPicker, setShowBankPicker] = useState(false);
    const [pastQuizzes, setPastQuizzes] = useState<any[]>([]);
    const [loadingBank, setLoadingBank] = useState(false);
    // Step 2 of bank picker: which quiz is being browsed and which questions are selected
    const [selectedQuiz, setSelectedQuiz] = useState<any | null>(null);
    const [selectedQIds, setSelectedQIds] = useState<Set<number>>(new Set());

    // Initialize state when editing or opening
    useEffect(() => {
        if (isOpen) {
            if (quizToEdit) {
                setTitle(quizToEdit.title || '');
                setTopic(quizToEdit.topic || '');
                setDifficulty(quizToEdit.difficulty || 'Medium');
                setTimeLimitMins(String(quizToEdit.timeLimitMins || 30));
                setBatchIds(quizToEdit.batchIds || (quizToEdit.batchId ? [quizToEdit.batchId] : []) || (quizToEdit.batch?.id ? [quizToEdit.batch.id] : []));

                if (quizToEdit.availableFrom) setAvailableFrom(formatLocalDateTimeInput(new Date(quizToEdit.availableFrom)));
                if (quizToEdit.availableUntil) setAvailableUntil(formatLocalDateTimeInput(new Date(quizToEdit.availableUntil)));

                if (Array.isArray(quizToEdit.questions) && quizToEdit.questions.length > 0) {
                    setQuestions(quizToEdit.questions.map((q: any) => ({
                        id: q.id,
                        questionText: q.questionText || '',
                        imageUrl: q.imageUrl || q.figureUrl || '',
                        options: Array.isArray(q.options) ? q.options : (typeof q.options === 'string' ? JSON.parse(q.options) : ['Option A', 'Option B']),
                        correctOption: getCorrectOptions(q.correctOption || q.correctAnswer || (Array.isArray(q.options) ? q.options[0] : 'Option A')),
                        marks: q.marks || 1
                    })));
                }
            } else {
                setTitle('');
                setTopic('');
                setDifficulty('Medium');
                setTimeLimitMins('30');
                setBatchIds(batches.length > 0 ? [batches[0].id] : []);
                setAvailableFrom(formatLocalDateTimeInput(new Date()));
                setAvailableUntil(formatLocalDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)));
                setQuestions([
                    {
                        questionText: '',
                        imageUrl: '',
                        options: ['Option A', 'Option B', 'Option C', 'Option D'],
                        correctOption: 'Option A',
                        marks: 1
                    }
                ]);
            }
        }
    }, [isOpen, quizToEdit, batches]);

    const batchOptions = useMemo(() => batches.map(b => ({ value: b.id, label: b.name })), [batches]);

    // ── QUESTION BUILDER ACTIONS ──────────────────────────────────────────────

    const handleAddQuestion = () => {
        setQuestions(prev => [
            ...prev,
            {
                questionText: '',
                imageUrl: '',
                options: ['Option A', 'Option B', 'Option C', 'Option D'],
                correctOption: 'Option A',
                marks: 1
            }
        ]);
    };

    const handleUpdateQuestion = (index: number, updatedFields: Partial<ManualQuestion>) => {
        setQuestions(prev => {
            const copy = [...prev];
            copy[index] = { ...copy[index], ...updatedFields };
            return copy;
        });
    };

    const handleRemoveQuestion = (index: number) => {
        if (questions.length <= 1) {
            toast.error('Quiz must have at least 1 question.');
            return;
        }
        setQuestions(prev => prev.filter((_, i) => i !== index));
    };

    const handleMoveQuestion = (index: number, direction: 'up' | 'down') => {
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= questions.length) return;
        setQuestions(prev => {
            const copy = [...prev];
            const temp = copy[index];
            copy[index] = copy[targetIndex];
            copy[targetIndex] = temp;
            return copy;
        });
    };

    // ── OPTION ACTIONS ────────────────────────────────────────────────────────

    const handleAddOption = (qIndex: number) => {
        const q = questions[qIndex];
        if (q.options.length >= 6) {
            toast.error('Maximum 6 choices allowed per question.');
            return;
        }
        const optionLabel = `Option ${String.fromCharCode(65 + q.options.length)}`;
        handleUpdateQuestion(qIndex, { options: [...q.options, optionLabel] });
    };

    const handleUpdateOption = (qIndex: number, optIndex: number, text: string) => {
        const q = questions[qIndex];
        const oldVal = q.options[optIndex];
        const newOptions = [...q.options];
        newOptions[optIndex] = text;

        const isCorrect = getCorrectOptions(q.correctOption).includes(oldVal);
        handleUpdateQuestion(qIndex, {
            options: newOptions,
                ...(isCorrect ? { correctOption: getCorrectOptions(q.correctOption).map(option => option === oldVal ? text : option) } : {})
        });
    };

    const handleRemoveOption = (qIndex: number, optIndex: number) => {
        const q = questions[qIndex];
        if (q.options.length <= 2) {
            toast.error('Question must have at least 2 options.');
            return;
        }
        const removedVal = q.options[optIndex];
        const newOptions = q.options.filter((_, i) => i !== optIndex);
        const remainingCorrect = getCorrectOptions(q.correctOption).filter(option => option !== removedVal);
        const newCorrect = remainingCorrect.length > 0 ? remainingCorrect : [newOptions[0]];
        handleUpdateQuestion(qIndex, { options: newOptions, correctOption: newCorrect });
    };

    // ── IMAGE FILE UPLOAD HANDLER ─────────────────────────────────────────────

    const handleImageUpload = (qIndex: number, file: File) => {
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image size must be under 5MB.');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            handleUpdateQuestion(qIndex, { imageUrl: base64 });
            toast.success('Figure image attached!');
        };
        reader.readAsDataURL(file);
    };

    // ── QUESTION BANK IMPORTER ────────────────────────────────────────────────

    const fetchQuestionBank = async () => {
        setLoadingBank(true);
        try {
            const quizzes = await apiRequest<any[]>('/tests/online');
            setPastQuizzes(quizzes || []);
        } catch (err) {
            toast.error('Failed to load past quizzes');
        } finally {
            setLoadingBank(false);
        }
    };

    /** Step 2: open the question checklist for a quiz */
    const openQuizQuestions = (quiz: any) => {
        if (!quiz.questions || quiz.questions.length === 0) {
            toast.error('This quiz has no questions.');
            return;
        }
        setSelectedQuiz(quiz);
        // pre-select all by default
        setSelectedQIds(new Set(quiz.questions.map((_: any, i: number) => i)));
    };

    const toggleAllQIds = () => {
        if (!selectedQuiz) return;
        if (selectedQIds.size === selectedQuiz.questions.length) {
            setSelectedQIds(new Set());
        } else {
            setSelectedQIds(new Set(selectedQuiz.questions.map((_: any, i: number) => i)));
        }
    };

    const handleImportSelected = () => {
        if (!selectedQuiz || selectedQIds.size === 0) {
            toast.error('Please select at least one question.');
            return;
        }
        const imported = selectedQuiz.questions
            .filter((_: any, i: number) => selectedQIds.has(i))
            .map((q: any) => ({
                questionText: q.questionText || '',
                imageUrl: q.imageUrl || q.figureUrl || '',
                options: Array.isArray(q.options) ? q.options : (typeof q.options === 'string' ? JSON.parse(q.options) : ['Option A', 'Option B']),
                correctOption: getCorrectOptions(q.correctOption || q.correctAnswer || 'Option A'),
                marks: q.marks || 1
            }));

        setQuestions(prev => [...prev, ...imported]);
        setShowBankPicker(false);
        setSelectedQuiz(null);
        setSelectedQIds(new Set());
        toast.success(`Imported ${imported.length} question${imported.length !== 1 ? 's' : ''} from "${selectedQuiz.title}"!`);
    };

    // ── SAVE QUIZ HANDLER ─────────────────────────────────────────────────────

    const handleSaveQuiz = async (saveAsDraft = false) => {
        if (!title.trim()) {
            toast.error('Please enter a quiz title.');
            return;
        }
        if (!saveAsDraft && batchIds.length === 0) {
            toast.error('Please select at least one batch.');
            return;
        }

        const publishQuestions = questions.map((q, idx) => ({
            questionText: q.questionText.trim(),
            imageUrl: q.imageUrl ? q.imageUrl.trim() : null,
            options: q.options.map(o => o.trim()).filter(Boolean),
            correctOption: getCorrectOptions(q.correctOption).map(option => option.trim()).filter(Boolean),
            marks: Number(q.marks) || 1,
            orderIndex: idx
        }));

        if (!saveAsDraft) {
            for (let i = 0; i < publishQuestions.length; i++) {
                const q = publishQuestions[i];
                if (!q.questionText) {
                    toast.error(`Question ${i + 1} text is empty.`);
                    return;
                }
                if (q.correctOption.length === 0 || q.correctOption.some(option => !q.options.includes(option))) {
                    toast.error(`Question ${i + 1} does not have a valid correct answer selected.`);
                    return;
                }
            }
        }

        const draftQuestions = publishQuestions.filter(q =>
            q.questionText && q.options.length >= 2 && q.correctOption.length > 0 && q.correctOption.every(option => q.options.includes(option))
        );

        setSavingMode(saveAsDraft ? 'draft' : 'publish');
        try {
            const payload = {
                title: title.trim(),
                topic: topic.trim(),
                difficulty,
                timeLimitMins: Number(timeLimitMins) || 30,
                batchIds,
                availableFrom: saveAsDraft ? null : availableFrom,
                availableUntil: saveAsDraft ? null : availableUntil,
                isDraft: saveAsDraft,
                questions: saveAsDraft ? draftQuestions : publishQuestions
            };

            if (quizToEdit) {
                await api.put(`/tests/online/${quizToEdit.id}`, payload);
                toast.success(saveAsDraft ? 'Quiz draft saved!' : 'Quiz updated successfully!');
            } else {
                await api.post('/tests/online', payload);
                toast.success(saveAsDraft ? 'Quiz draft saved!' : 'Quiz created successfully!');
            }

            onSaved();
            onClose();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || error?.message || (saveAsDraft ? 'Failed to save draft.' : 'Failed to save quiz.'));
        } finally {
            setSavingMode(null);
        }
    };

    if (!isOpen) return null;

    const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-md overflow-y-auto">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-[#FDFDFD] border border-neutral-200 w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-auto text-neutral-900 font-sans"
            >
                {/* MODAL HEADER */}
                <div className="p-6 border-b border-neutral-200 bg-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-black text-white rounded-2xl">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black tracking-tight">
                                {quizToEdit ? 'Edit Quiz' : 'Manual Quiz Builder'}
                            </h2>
                            <p className="text-xs text-neutral-500 font-medium">
                                Create custom MCQ tests with figures, answer keys, and timing controls.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-neutral-400 hover:text-black hover:bg-neutral-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* MODAL BODY (SCROLLABLE) */}
                <div className="p-6 overflow-y-auto flex-1 space-y-8">
                    {/* SECTION 1: QUIZ DETAILS */}
                    <div className="bg-white border-2 border-neutral-200 rounded-3xl p-6 space-y-6">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                            01. Quiz Settings
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                    Quiz Title *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="e.g. Chapter 4: Quadratic Equations Test"
                                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium outline-none focus:border-black transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                    Topic / Subject
                                </label>
                                <input
                                    type="text"
                                    value={topic}
                                    onChange={e => setTopic(e.target.value)}
                                    placeholder="e.g. Algebra / Mathematics"
                                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium outline-none focus:border-black transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                    Time Limit (Minutes)
                                </label>
                                <input
                                    type="number"
                                    min={1}
                                    value={timeLimitMins}
                                    onChange={e => setTimeLimitMins(e.target.value)}
                                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium outline-none focus:border-black transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                    Difficulty Level
                                </label>
                                <Dropdown
                                    options={difficultyOptions}
                                    value={difficulty}
                                    onChange={setDifficulty}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                    Available From
                                </label>
                                <input
                                    type="datetime-local"
                                    value={availableFrom}
                                    onChange={e => setAvailableFrom(e.target.value)}
                                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium outline-none focus:border-black transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                    Available Until
                                </label>
                                <input
                                    type="datetime-local"
                                    value={availableUntil}
                                    onChange={e => setAvailableUntil(e.target.value)}
                                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium outline-none focus:border-black transition-all"
                                />
                            </div>
                        </div>

                        {/* Batch selection */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                                Assign to Batches *
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {batches.map(b => (
                                    <button
                                        key={b.id}
                                        type="button"
                                        onClick={() => {
                                            setBatchIds(prev =>
                                                prev.includes(b.id) ? prev.filter(id => id !== b.id) : [...prev, b.id]
                                            );
                                        }}
                                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                                            batchIds.includes(b.id)
                                                ? 'bg-black text-white'
                                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                        }`}
                                    >
                                        {b.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* SECTION 2: QUESTION BUILDER */}
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                                    02. Questions ({questions.length}) • Total Marks: {totalMarks}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => { setShowBankPicker(true); fetchQuestionBank(); }}
                                    className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                                >
                                    <Layers className="w-4 h-4" />
                                    Import from Question Bank
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAddQuestion}
                                    className="px-3.5 py-2 bg-black hover:bg-neutral-800 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Question
                                </button>
                            </div>
                        </div>

                        {/* Question list */}
                        <div className="space-y-6">
                            {questions.map((q, qIdx) => (
                                <div key={qIdx} className="bg-white border-2 border-neutral-200 rounded-3xl p-6 space-y-5 relative">
                                    <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                                        <span className="text-xs font-black uppercase tracking-widest text-black">
                                            Question {qIdx + 1}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                disabled={qIdx === 0}
                                                onClick={() => handleMoveQuestion(qIdx, 'up')}
                                                className="p-1.5 rounded-lg text-neutral-400 hover:text-black hover:bg-neutral-100 disabled:opacity-30"
                                            >
                                                <ArrowUp className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                disabled={qIdx === questions.length - 1}
                                                onClick={() => handleMoveQuestion(qIdx, 'down')}
                                                className="p-1.5 rounded-lg text-neutral-400 hover:text-black hover:bg-neutral-100 disabled:opacity-30"
                                            >
                                                <ArrowDown className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveQuestion(qIdx)}
                                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Question Text */}
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                            Question Statement *
                                        </label>
                                        <textarea
                                            rows={2}
                                            value={q.questionText}
                                            onChange={e => handleUpdateQuestion(qIdx, { questionText: e.target.value })}
                                            placeholder="e.g. Find the roots of the equation 2x² - 5x + 3 = 0."
                                            className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium outline-none focus:border-black transition-all"
                                        />
                                    </div>

                                    {/* Question Figure / Image Attachment */}
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                            Figure / Geometry Image (Optional)
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="text"
                                                value={q.imageUrl || ''}
                                                onChange={e => handleUpdateQuestion(qIdx, { imageUrl: e.target.value })}
                                                placeholder="Paste image URL (https://...) or upload below"
                                                className="flex-1 px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium outline-none focus:border-black"
                                            />
                                            <label className="px-3.5 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 shrink-0">
                                                <Upload className="w-3.5 h-3.5" />
                                                <span>Upload Image</span>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={e => {
                                                        if (e.target.files && e.target.files[0]) {
                                                            handleImageUpload(qIdx, e.target.files[0]);
                                                        }
                                                    }}
                                                />
                                            </label>
                                        </div>

                                        {/* Image Preview Thumbnail */}
                                        {q.imageUrl && (
                                            <div className="mt-3 relative inline-block border border-neutral-200 rounded-xl p-1 bg-neutral-50">
                                                <img
                                                    src={q.imageUrl}
                                                    alt="Question Diagram"
                                                    className="max-h-36 max-w-full rounded-lg object-contain"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleUpdateQuestion(qIdx, { imageUrl: '' })}
                                                    className="absolute top-2 right-2 p-1 bg-black/70 text-white rounded-full hover:bg-black"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* MCQ Choices */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500">
                                                Choices &amp; Correct Answer Key *
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => handleAddOption(qIdx)}
                                                className="text-xs font-bold text-black hover:underline"
                                            >
                                                + Add Choice
                                            </button>
                                        </div>

                                        <div className="space-y-2.5">
                                            {q.options.map((optText, optIdx) => {
                                                const correctOptions = getCorrectOptions(q.correctOption);
                                                const isCorrect = correctOptions.includes(optText);
                                                return (
                                                    <div key={optIdx} className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={isCorrect}
                                                            onChange={() => {
                                                                const nextCorrect = isCorrect
                                                                    ? correctOptions.filter(option => option !== optText)
                                                                    : [...correctOptions, optText];
                                                                handleUpdateQuestion(qIdx, { correctOption: nextCorrect });
                                                            }}
                                                            className="w-4 h-4 accent-black cursor-pointer shrink-0"
                                                        />
                                                        <span className="text-xs font-bold text-neutral-400 w-5">
                                                            {String.fromCharCode(65 + optIdx)}.
                                                        </span>
                                                        <input
                                                            type="text"
                                                            value={optText}
                                                            onChange={e => handleUpdateOption(qIdx, optIdx, e.target.value)}
                                                            className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-semibold outline-none transition-all ${
                                                                isCorrect
                                                                    ? 'bg-emerald-50 border-2 border-emerald-500 text-emerald-950 font-bold'
                                                                    : 'bg-neutral-50 border border-neutral-200 text-black focus:border-black'
                                                            }`}
                                                        />
                                                        {isCorrect && (
                                                            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest px-2 py-1 bg-emerald-100 rounded-md">
                                                                Correct
                                                            </span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveOption(qIdx, optIdx)}
                                                            className="p-1 rounded text-neutral-400 hover:text-red-500"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Question Marks */}
                                    <div className="pt-2 flex items-center justify-between border-t border-neutral-100">
                                        <div className="flex items-center gap-2">
                                            <label className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                                                Marks:
                                            </label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={q.marks}
                                                onChange={e => handleUpdateQuestion(qIdx, { marks: Number(e.target.value) || 1 })}
                                                className="w-16 px-3 py-1 bg-neutral-50 border border-neutral-200 rounded-lg text-xs font-bold outline-none focus:border-black"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* MODAL FOOTER */}
                <div className="p-6 border-t border-neutral-200 bg-white flex items-center justify-between shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-3 text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-black transition-colors"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        disabled={savingMode !== null}
                        onClick={() => handleSaveQuiz(true)}
                        className="px-6 py-4 bg-white border border-neutral-300 text-neutral-900 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-neutral-50 active:scale-[0.98] transition-all disabled:opacity-50 inline-flex items-center gap-2"
                    >
                        {savingMode === 'draft' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save as Draft'}
                    </button>

                    <button
                        type="button"
                        disabled={savingMode !== null}
                        onClick={() => handleSaveQuiz(false)}
                        className="px-8 py-4 bg-black text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-neutral-900 active:scale-[0.98] transition-all disabled:opacity-50 inline-flex items-center gap-2"
                    >
                        {savingMode === 'publish' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save & Publish Quiz'}
                    </button>
                </div>
            </motion.div>

            {/* QUESTION BANK PICKER MODAL */}
            <AnimatePresence>
                {showBankPicker && (
                    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white border border-neutral-200 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden text-neutral-900"
                        >
                            {/* Header */}
                            <div className="p-5 border-b border-neutral-200 flex items-center gap-3">
                                {selectedQuiz && (
                                    <button
                                        type="button"
                                        onClick={() => { setSelectedQuiz(null); setSelectedQIds(new Set()); }}
                                        className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-black transition-colors shrink-0"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                                    </button>
                                )}
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-bold">
                                        {selectedQuiz ? `Select Questions — ${selectedQuiz.title}` : 'Import from Question Bank'}
                                    </h3>
                                    {selectedQuiz && (
                                        <p className="text-xs text-neutral-400 font-medium mt-0.5">
                                            {selectedQIds.size} of {selectedQuiz.questions.length} selected
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setShowBankPicker(false); setSelectedQuiz(null); setSelectedQIds(new Set()); }}
                                    className="p-1 rounded-lg text-neutral-400 hover:text-black"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* ── STEP 1: Quiz list ── */}
                            {!selectedQuiz && (
                                <div className="p-4 overflow-y-auto flex-1 space-y-2.5">
                                    {loadingBank ? (
                                        <div className="py-14 flex flex-col items-center gap-3 text-neutral-400">
                                            <Loader2 className="w-6 h-6 animate-spin" />
                                            <span className="text-xs font-bold">Loading quizzes…</span>
                                        </div>
                                    ) : pastQuizzes.length === 0 ? (
                                        <div className="py-14 text-center text-neutral-400 font-bold text-xs">
                                            No past quizzes found in your library.
                                        </div>
                                    ) : (
                                        pastQuizzes.map((pq) => (
                                            <button
                                                key={pq.id}
                                                type="button"
                                                onClick={() => openQuizQuestions(pq)}
                                                className="w-full text-left p-4 border border-neutral-200 rounded-2xl flex items-center justify-between hover:border-black hover:bg-neutral-50 transition-all group"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-black truncate">{pq.title}</p>
                                                    <p className="text-xs text-neutral-400 font-medium mt-0.5">
                                                        {pq.questions?.length || 0} questions · {pq.topic || 'General'}
                                                    </p>
                                                </div>
                                                <span className="text-xs font-bold text-neutral-400 group-hover:text-black flex items-center gap-1 shrink-0 ml-3">
                                                    Select
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                                                </span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}

                            {/* ── STEP 2: Question checklist ── */}
                            {selectedQuiz && (
                                <>
                                    {/* Select-all bar */}
                                    <div className="px-4 py-2.5 border-b border-neutral-100 flex items-center gap-3 bg-neutral-50">
                                        <button
                                            type="button"
                                            onClick={toggleAllQIds}
                                            className="flex items-center gap-2 text-xs font-bold text-neutral-600 hover:text-black"
                                        >
                                            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                                                selectedQIds.size === selectedQuiz.questions.length
                                                    ? 'bg-black border-black text-white'
                                                    : selectedQIds.size > 0
                                                        ? 'bg-neutral-300 border-neutral-400'
                                                        : 'bg-white border-neutral-300'
                                            }`}>
                                                {selectedQIds.size > 0 && <Check className="w-2.5 h-2.5" />}
                                            </span>
                                            {selectedQIds.size === selectedQuiz.questions.length ? 'Deselect All' : 'Select All'}
                                        </button>
                                        <span className="text-xs text-neutral-400 font-medium ml-auto">
                                            {selectedQIds.size} / {selectedQuiz.questions.length} selected
                                        </span>
                                    </div>

                                    {/* Question list */}
                                    <div className="overflow-y-auto flex-1 p-4 space-y-2">
                                        {selectedQuiz.questions.map((q: any, idx: number) => {
                                            const isChecked = selectedQIds.has(idx);
                                            const opts = Array.isArray(q.options) ? q.options
                                                : (typeof q.options === 'string' ? JSON.parse(q.options) : []);
                                            return (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedQIds(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(idx)) next.delete(idx); else next.add(idx);
                                                            return next;
                                                        });
                                                    }}
                                                    className={`w-full text-left p-3.5 rounded-2xl border transition-all flex gap-3 items-start ${
                                                        isChecked
                                                            ? 'bg-black text-white border-black'
                                                            : 'bg-white text-neutral-800 border-neutral-200 hover:border-neutral-400'
                                                    }`}
                                                >
                                                    {/* Checkbox */}
                                                    <span className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                                                        isChecked ? 'bg-white border-white' : 'bg-white border-neutral-300'
                                                    }`}>
                                                        {isChecked && <Check className="w-2.5 h-2.5 text-black" />}
                                                    </span>

                                                    {/* Content */}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-bold mb-1 leading-snug">
                                                            <span className={`mr-1.5 ${isChecked ? 'text-neutral-300' : 'text-neutral-400'}`}>Q{idx + 1}.</span>
                                                            {q.questionText || '(No question text)'}
                                                        </p>
                                                        {(q.imageUrl || q.figureUrl) && (
                                                            <div className="my-1.5">
                                                                <img
                                                                    src={q.imageUrl || q.figureUrl}
                                                                    alt="figure"
                                                                    className="max-h-20 rounded-lg object-contain border border-neutral-200"
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                                            {opts.slice(0, 4).map((opt: string, oi: number) => (
                                                                <span
                                                                    key={oi}
                                                                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                                                        opt === (q.correctOption || q.correctAnswer)
                                                                            ? isChecked ? 'bg-green-400 border-green-300 text-black' : 'bg-green-100 border-green-200 text-green-700'
                                                                            : isChecked ? 'bg-neutral-700 border-neutral-600 text-neutral-200' : 'bg-neutral-100 border-neutral-200 text-neutral-500'
                                                                    }`}
                                                                >
                                                                    {String.fromCharCode(65 + oi)}. {opt.length > 20 ? opt.slice(0, 20) + '…' : opt}
                                                                </span>
                                                            ))}
                                                        </div>
                                                        <p className={`text-[10px] mt-1.5 font-bold ${isChecked ? 'text-neutral-300' : 'text-neutral-400'}`}>
                                                            {q.marks || 1} mark{(q.marks || 1) !== 1 ? 's' : ''}
                                                        </p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Footer action */}
                                    <div className="p-4 border-t border-neutral-200 flex items-center gap-3">
                                        <span className="text-xs text-neutral-400 font-medium flex-1">
                                            {selectedQIds.size === 0 ? 'No questions selected' : `${selectedQIds.size} question${selectedQIds.size !== 1 ? 's' : ''} ready to import`}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={handleImportSelected}
                                            disabled={selectedQIds.size === 0}
                                            className="px-5 py-2.5 bg-black text-white text-xs font-black rounded-xl hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                        >
                                            Import {selectedQIds.size > 0 ? selectedQIds.size : ''} Selected
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
