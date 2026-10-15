
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from '../utils/api';
import Layout from '../components/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { captureStickerFrame, stickerFrameBlob, readStudentQR, readStudentQRFromPhoto, extractMarksFromSticker } from '../utils/ocr';
import { useStickerCamera } from '../utils/useStickerCamera';
import { TeacherButton } from '../components/teacher-ui/TeacherButton';
import { MultiStickerReview } from '../components/MultiStickerReview';
import { StickerStudentPicker } from '../components/StickerStudentPicker';
import { scanDeadline } from '../utils/scanDeadline';
interface ScanTest {
    id: string;
    name?: string;
    subject?: string;
    className?: string | null;
    maxMarks?: number;
}

interface StudentMark {
    testId: string;
    score: number;
}

interface StudentLookupResponse {
    id: string;
    name: string;
    humanId?: string;
    batch?: {
        name?: string;
        className?: string | null;
    };
    marks?: StudentMark[];
    testEligible?: boolean;
}

export default function ScanMarks() {
    const [searchParams] = useSearchParams();
    const [scanning, setScanning] = useState(false);
    const [multiple, setMultiple] = useState(false);
    const [multiPhoto, setMultiPhoto] = useState<Blob | null>(null);
    const [cameraSessionOpen, setCameraSessionOpen] = useState(false);
    const [usingPhoneCamera, setUsingPhoneCamera] = useState(false);
    const photoInput = useRef<HTMLInputElement>(null);
    const [readStatus, setReadStatus] = useState<'read' | 'needs_review' | null>(null);
    const [student, setStudent] = useState<StudentLookupResponse | null>(null);
    const [score, setScore] = useState('');
    const [tests, setTests] = useState<ScanTest[]>([]);
    const [selectedTestId, setSelectedTestId] = useState(searchParams.get('testId') || '');

    // Review and overwrite state
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [existingMark, setExistingMark] = useState<number | null>(null);
    const [pendingStudent, setPendingStudent] = useState<StudentLookupResponse | null>(null);

    // OCR State
    const [isProcessingOCR, setIsProcessingOCR] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const savingRef = useRef(false);
    const [debugImage, setDebugImage] = useState<string | null>(null);

    const { videoRef, ready: cameraReady, error: cameraError, devices: cameraDevices,
        deviceId: cameraDeviceId, markReady: markCameraReady, selectDevice: selectCameraDevice,
        restart: restartCamera } = useStickerCamera(cameraSessionOpen && !usingPhoneCamera);
    const mountedRef = useRef(true);
    const processingRef = useRef(false);
    const captureRequest = useRef<AbortController | null>(null);
    const previewUrl = useRef<string | null>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const [scanError, setScanError] = useState('');
    const [identityError, setIdentityError] = useState('');
    const [ocrError, setOcrError] = useState('');
    const [captureStage, setCaptureStage] = useState('Taking photo…');
    const [elapsed, setElapsed] = useState(0);
    const [ocrStage, setOcrStage] = useState('Preparing photo…');

    useEffect(() => {
        const input = photoInput.current;
        const restoreCamera = () => setUsingPhoneCamera(false);
        input?.addEventListener('cancel', restoreCamera);
        return () => input?.removeEventListener('cancel', restoreCamera);
    }, [cameraSessionOpen]);

    useEffect(() => {
        if (!isProcessingOCR) return;
        const started = Date.now();
        setElapsed(0);
        const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
        return () => clearInterval(timer);
    }, [isProcessingOCR]);

    const clearPreview = () => {
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = null;
        setDebugImage(null);
    };

    // Helper function for toast notifications
    const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-yellow-500';
        toast.className = `fixed top-20 left-1/2 -translate-x-1/2 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg z-[300] motion-safe:animate-fadeIn max-w-md text-center`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    useEffect(() => {
        mountedRef.current = true;
        apiRequest<ScanTest[]>('/tests').then(setTests).catch(console.error);
        return () => {
            mountedRef.current = false;
            captureRequest.current?.abort();
            if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        };
    }, []);

    // Trap focus in camera/review overlays and restore the initiating control on close.
    useEffect(() => {
        if (!scanning && !student && !pendingStudent && !identityError) return;
        const previous = document.activeElement as HTMLElement | null;
        const overlay = overlayRef.current;
        overlay?.focus();
        const trap = (event: KeyboardEvent) => {
            if (event.key !== 'Tab' || !overlay) return;
            const controls = Array.from(overlay.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([hidden]):not(:disabled), select:not(:disabled), [tabindex="0"]'));
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (!first) { event.preventDefault(); return; }
            if (event.shiftKey && (document.activeElement === first || document.activeElement === overlay)) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === overlay)) {
                event.preventDefault(); first.focus();
            }
        };
        document.addEventListener('keydown', trap);
        return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
    }, [scanning, student, pendingStudent, identityError]);

    const cancelCapture = () => {
        setMultiPhoto(null);
        captureRequest.current?.abort();
        processingRef.current = false;
        setIsProcessingOCR(false);
        setScanning(false);
        setCameraSessionOpen(false);
        setUsingPhoneCamera(false);
        setScanError('');
        setIdentityError('');
        clearPreview();
    };

    const handleCapture = async (photo?: File) => {
        if (!mountedRef.current || !cameraSessionOpen || processingRef.current) return;
        if (!photo && (!videoRef.current || videoRef.current.readyState < 2 || !videoRef.current.videoWidth)) {
            void videoRef.current?.play().catch(() => undefined);
            setScanError('Camera is starting. Try Capture again when the preview is moving, or use phone camera.');
            return;
        }
        processingRef.current = true;
        const request = new AbortController();
        captureRequest.current = request;
        setIsProcessingOCR(true);
        setScanError('');
        setIdentityError('');
        setOcrError('');
        setCaptureStage('Taking photo…');
        setOcrStage('Preparing photo…');
        setScore('');
        setReadStatus(null);
        clearPreview();
        try {
            if (photo && !['image/jpeg', 'image/png', 'image/webp'].includes(photo.type)) {
                throw new Error('Choose a JPEG, PNG, or WebP photo. Other formats are not converted automatically.');
            }
            const frame = photo ? null : captureStickerFrame(videoRef.current!);
            const image = photo ?? await stickerFrameBlob(frame!);
            if (request.signal.aborted) return;
            previewUrl.current = URL.createObjectURL(image);
            setDebugImage(previewUrl.current);
            if (multiple) { setMultiPhoto(image); setScanning(false); return; }
            // Start OCR immediately. QR and identity lookup use the very same captured frame.
            setCaptureStage('Reading student QR…');
            const current = () => mountedRef.current && !request.signal.aborted && captureRequest.current === request;
            const ocrPromise = extractMarksFromSticker(image, request.signal, selectedTestId, progress => {
                if (current()) setOcrStage(progress.stage === 'preparing' ? 'Preparing photo…'
                    : progress.stage === 'reading' ? 'Reading marks…'
                    : `Uploading photo${progress.percent == null ? '' : ` ${progress.percent}%`}…`);
            })
                .catch((error: Error) => ({ score: '', status: 'needs_review' as const, error: error.message }))
                .then(ocr => {
                    if (!current()) return;
                    const selectedTest = tests.find(test => test.id === selectedTestId);
                    const outOfRange = ocr.score !== '' && selectedTest?.maxMarks != null && Number(ocr.score) > selectedTest.maxMarks;
                    setScore(outOfRange ? '' : ocr.score);
                    setReadStatus(ocr.score !== '' && !outOfRange ? 'read' : 'needs_review');
                    setOcrError(outOfRange
                        ? `Read ${ocr.score}, which exceeds this test's maximum of ${selectedTest.maxMarks}. Check the photo and enter the correct mark.`
                        : 'error' in ocr ? String(ocr.error) : '');
                });
            const identityPromise = (async () => {
                const humanId = photo ? await readStudentQRFromPhoto(photo, request.signal) : await readStudentQR(frame!, request.signal);
                if (current()) setCaptureStage('Finding student…');
                return await scanDeadline(lookupStudent(humanId), 15000, 'Student lookup timed out. Select the student below.', request.signal);
            })().then(studentData => {
                if (current()) reviewStudent(studentData);
            }).catch((error: Error) => {
                if (current()) setIdentityError(error.message || 'QR not readable. Select the student below.');
            }).finally(() => {
                // The teacher can review/type/save as soon as identity is available.
                // OCR keeps running independently and cannot overwrite a manual entry.
                if (current()) setScanning(false);
            });
            await Promise.all([identityPromise, ocrPromise]);
        } catch (error) {
            if (!request.signal.aborted && mountedRef.current) {
                setScanError(error instanceof Error ? error.message : 'Capture failed. Please try again.');
                clearPreview();
            }
            request.abort();
        } finally {
            if (captureRequest.current === request && mountedRef.current) {
                processingRef.current = false;
                setIsProcessingOCR(false);
            }
        }
    };

    const lookupStudent = (humanId: string) => apiRequest<StudentLookupResponse>(
        '/students/lookup/' + encodeURIComponent(humanId) + '?testId=' + encodeURIComponent(selectedTestId), 'GET', undefined, { timeoutMs: 15000 });

    const reviewStudent = (studentData: StudentLookupResponse) => {
        const selectedTest = tests.find(test => test.id === selectedTestId);
        if (!studentData.testEligible && selectedTest?.className && studentData.batch?.className !== selectedTest.className) {
            throw new Error(`${studentData.name} is not in this test's class. Select the correct student.`);
        }
        const existing = studentData.marks?.find(mark => mark.testId === selectedTestId);
        setExistingMark(existing?.score ?? null);
        if (existing) setPendingStudent(studentData);
        else setStudent(studentData);
        setIdentityError('');
    };

    const startScanner = () => {
        if (!selectedTestId) {
            alert("Please select a test first!");
            return;
        }
        setScanError('');
        setCameraSessionOpen(true);
        setScanning(true);
    };

    const handleSubmitMark = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!student || !selectedTestId || savingRef.current || !/^\d+(?:\.\d+)?$/.test(score)) return;
        const maxMarks = tests.find(test => test.id === selectedTestId)?.maxMarks;
        if (maxMarks != null && Number(score) > maxMarks) {
            setOcrError(`Marks cannot exceed this test's maximum of ${maxMarks}.`);
            return;
        }
        captureRequest.current?.abort();
        setIsProcessingOCR(false);
        savingRef.current = true;
        setIsSaving(true);
        try {
            await apiRequest('/marks', 'POST', {
                testId: selectedTestId,
                studentId: student.id,
                score,
                expectedScore: existingMark
            });

            // Single success toast
            showToast(`✓ ${student.name}: ${score} marks saved`, 'success');

            // Reset for next scan
            setStudent(null);
            setScore('');
            setExistingMark(null);
            setPendingStudent(null);
            setDebugImage(null);

            clearPreview();
            processingRef.current = false;
            setScanning(true);
        } catch (error: unknown) {
            console.error('Save mark error:', error);
            // Extract error message from backend response
            const errorMsg = error instanceof Error ? error.message : 'Failed to save mark';
            showToast(errorMsg, 'error');
            // Don't resume scanning on error - let user fix the issue
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    };

    const handleCancelInput = () => {
        if (savingRef.current) return;
        captureRequest.current?.abort();
        setIsProcessingOCR(false);
        setIdentityError('');
        setStudent(null);
        setPendingStudent(null);
        setExistingMark(null);
        setScore('');
        setScanError('');
        setDebugImage(null);
        processingRef.current = false;

        clearPreview();
        setScanning(true);
    };

    return (
        <Layout title="Scan Marks" hideMobileNav={scanning || !!student || !!pendingStudent || !!identityError || !!multiPhoto}>
            {/* Test Selector */}
            {!scanning && !student && !pendingStudent && !identityError && !multiPhoto && (
                <div className="max-w-md mx-auto mt-10">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                        <h2 className="text-xl font-bold mb-6 text-app-text">Start Assessment</h2>
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Select Test</label>
                            <div className="relative">
                                <button
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-left flex justify-between items-center outline-none focus:ring-2 focus:ring-blue-500 transition"
                                >
                                    <span className={selectedTestId ? "text-app-text font-medium" : "text-app-text-tertiary"}>
                                        {selectedTestId
                                            ? (() => {
                                                const t = tests.find(t => t.id === selectedTestId);
                                                return t ? `${t.name} (${t.subject}) • ${t.className}` : "Unknown Test";
                                            })()
                                            : "-- Choose Test --"}
                                    </span>
                                    <ChevronDown className={`w-5 h-5 text-app-text-tertiary transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
                                </button>

                                <AnimatePresence>
                                    {isDropdownOpen && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto"
                                        >
                                            {tests.map(t => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => {
                                                        setSelectedTestId(t.id);
                                                        setIsDropdownOpen(false);
                                                    }}
                                                    className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between group"
                                                >
                                                    <div className="flex flex-col text-left">
                                                        <span className="text-slate-700 font-medium group-hover:text-blue-600 transition-colors">{t.name}</span>
                                                        <span className="text-app-text-tertiary text-xs font-normal">{t.subject} • {t.className}</span>
                                                    </div>
                                                    {selectedTestId === t.id && <Check className="w-4 h-4 text-blue-600" />}
                                                </button>
                                            ))}
                                            {tests.length === 0 && (
                                                <div className="p-4 text-center text-app-text-tertiary text-sm">No tests available</div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                        <fieldset className="mb-4 flex flex-wrap gap-3 text-sm text-app-text">
                            <legend className="mb-2 font-medium">Stickers per photo</legend>
                            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="sticker-mode" checked={!multiple} onChange={() => setMultiple(false)} />One sticker</label>
                            <label className="flex min-h-11 items-center gap-2"><input type="radio" name="sticker-mode" checked={multiple} onChange={() => setMultiple(true)} />Multiple stickers (up to 10)</label>
                            {multiple && <p className="w-full text-app-text-secondary">Arrange stickers so every QR and marks box is visible. Review each result before saving.</p>}
                        </fieldset>
                        <button
                            onClick={startScanner}
                            className={`w-full font-bold py-4 rounded-xl transition-all shadow-md flex items-center justify-center
                                ${selectedTestId
                                    ? 'bg-gray-900 hover:bg-black text-white shadow-lg shadow-gray-200 hover:shadow-gray-300'
                                    : 'bg-slate-200 text-app-text-tertiary cursor-not-allowed'}`}
                            disabled={!selectedTestId}
                        >
                            <span className="mr-2">📷</span> Start Camera
                        </button>
                    </div>
                </div>
            )}

            {multiPhoto && debugImage && createPortal(<MultiStickerReview photo={multiPhoto} imageUrl={debugImage}
                testId={selectedTestId} maxMarks={tests.find(test => test.id === selectedTestId)?.maxMarks ?? 100}
                onClose={() => { setMultiPhoto(null); clearPreview(); setScanning(true); }} />, document.body)}

            {/* Scanner Active - Immersive Fullscreen Mobile UI */}
            {cameraSessionOpen && createPortal(
                <div ref={scanning ? overlayRef : undefined} tabIndex={scanning ? -1 : undefined}
                    role={scanning ? 'dialog' : undefined} aria-modal={scanning || undefined} aria-hidden={!scanning}
                    aria-label="Capture marks sticker" onKeyDown={event => { if (event.key === 'Escape') cancelCapture(); }}
                    className={`fixed inset-0 bg-black overflow-hidden ${scanning ? 'z-[200]' : 'invisible pointer-events-none -z-10'}`}>
                    <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden
                        onChange={event => {
                            const photo = event.target.files?.[0];
                            event.target.value = '';
                            setUsingPhoneCamera(false);
                            if (photo) void handleCapture(photo);
                        }} />
                    {/* Camera Viewfinder */}
                    <video ref={videoRef} autoPlay playsInline muted onLoadedData={markCameraReady} onCanPlay={markCameraReady} onPlaying={markCameraReady}
                        className="absolute inset-0 h-full w-full object-contain" aria-label="Sticker camera preview" />
                    {isProcessingOCR && debugImage && <img src={debugImage} alt="Captured sticker" className="absolute inset-0 h-full w-full object-contain" />}

                    {scanning && !isProcessingOCR && !usingPhoneCamera && (
                        <div className="absolute top-[max(1rem,env(safe-area-inset-top))] inset-x-4 z-20 mx-auto flex max-w-lg flex-wrap gap-2">
                            {cameraDevices.length > 1 && <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-app-surface-opaque px-3 text-app-text text-sm">
                                <span>Camera</span>
                                <select aria-label="Camera lens" value={cameraDeviceId} onChange={event => selectCameraDevice(event.target.value)}
                                    className="min-h-11 min-w-0 flex-1 bg-transparent focus-visible:outline-2">
                                    <option value="">Auto (rear)</option>
                                    {cameraDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}
                                </select>
                            </label>}
                            <TeacherButton variant="secondary" onClick={restartCamera}>Restart camera</TeacherButton>
                        </div>
                    )}
                    {/* Bottom Controls */}
                    <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-0 right-0 z-20 flex flex-col items-center gap-4 px-6">
                        {isProcessingOCR ? (
                            <div className="flex items-center gap-3 bg-white/90 backdrop-blur-md px-6 py-3 rounded-full shadow-xl animate-in slide-in-from-bottom-4">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                <span role="status" className="font-bold text-app-text">{captureStage} {elapsed}s</span>
                            </div>
                        ) : (
                            <div className="bg-black/60 backdrop-blur-md text-white text-center px-4 py-2 rounded-full border border-white/10 max-w-xs">
                                <p className="text-sm font-medium">{cameraReady ? 'Ready — tap Capture' : 'Starting camera…'}</p>
                                <p className="text-xs text-white/70 mt-0.5">Keep one whole sticker visible. It does not need to fill the screen.</p>
                            </div>
                        )}

                        {(scanError || cameraError) && <p role="alert" className="max-w-sm rounded-xl bg-app-surface-opaque p-3 text-app-text">{scanError || cameraError}</p>}
                        <TeacherButton variant="secondary" size="lg" onClick={() => void handleCapture()}
                            disabled={isProcessingOCR || usingPhoneCamera} loading={isProcessingOCR} className="w-full max-w-xs">
                            {isProcessingOCR ? 'Reading marks…' : 'Capture'}
                        </TeacherButton>
                        <div className="flex flex-wrap justify-center gap-2">
                            <TeacherButton variant="secondary" disabled={isProcessingOCR} onClick={() => {
                                if (usingPhoneCamera) { setUsingPhoneCamera(false); return; }
                                // Release the live track before handing camera control to iOS/Android.
                                const stream = videoRef.current?.srcObject as MediaStream | null;
                                stream?.getTracks().forEach(track => track.stop());
                                setUsingPhoneCamera(true);
                                photoInput.current?.click();
                            }}>{usingPhoneCamera ? 'Return to live camera' : 'Use phone camera'}</TeacherButton>
                            <TeacherButton variant="secondary" onClick={cancelCapture}>Cancel Scan</TeacherButton>
                        </div>
                    </div>
                </div>, document.body
            )}

            {identityError && createPortal(
                <div ref={overlayRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Select student for captured photo"
                    onKeyDown={event => { if (event.key === 'Escape') handleCancelInput(); }}
                    className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 p-4 py-[max(1rem,env(safe-area-inset-top))]">
                    <StickerStudentPicker image={debugImage} message={identityError} score={score} onRetake={handleCancelInput}
                        onSelect={async humanId => {
                            const request = captureRequest.current;
                            const selected = await lookupStudent(humanId);
                            if (mountedRef.current && request && !request.signal.aborted && request === captureRequest.current) reviewStudent(selected);
                        }} />
                </div>, document.body
            )}


            {/* Warning Modal */}
            {
                pendingStudent && createPortal(
                    <div ref={overlayRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Review captured marks" onKeyDown={event => { if (event.key === 'Escape') handleCancelInput(); }} className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 py-[max(1rem,env(safe-area-inset-top))] z-50 motion-safe:animate-fadeIn">
                        <div className="bg-app-surface-opaque rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center">
                            <div className="w-16 h-16 bg-yellow-50 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold shadow-sm">!</div>
                            <h2 className="text-xl font-bold text-app-text mb-2">Marks Already Exist</h2>
                            <p className="text-app-text-secondary mb-4">
                                <span className="font-bold">{pendingStudent.name}</span> has already scored <span className="font-bold">{existingMark}</span> in this test.
                            </p>
                            <p className="text-sm text-app-text-secondary mb-6">Do you want to overwrite the score?</p>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={handleCancelInput}
                                    className="bg-slate-100 hover:bg-slate-200 text-app-text-secondary font-bold py-3 rounded-xl transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        setStudent(pendingStudent);
                                        setPendingStudent(null);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition"
                                >
                                    Overwrite
                                </button>
                            </div>
                        </div>
                    </div>, document.body
                )
            }

            {/* Mark Entry Modal */}
            {
                student && createPortal(
                    <div ref={overlayRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Review captured marks" onKeyDown={event => { if (event.key === 'Escape') handleCancelInput(); }} className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 py-[max(1rem,env(safe-area-inset-top))] z-[150] motion-safe:animate-fadeIn">
                        <div className="bg-app-surface-opaque rounded-3xl shadow-2xl max-w-sm w-full max-h-[85dvh] overflow-y-auto p-6 transform transition-all scale-100 relative">


                            <div className="text-center mb-8">
                                <div className="w-16 h-16 bg-app-bg text-app-text rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold shadow-sm">
                                    {student.name.charAt(0)}
                                </div>
                                <h2 className="text-2xl font-bold text-app-text">{student.name}</h2>
                                <p className="text-app-text-secondary text-sm mt-1">{student.batch?.name}</p>
                                <div className="inline-block bg-slate-100 text-app-text-secondary text-xs px-2 py-1 rounded mt-2 font-mono">
                                    {student.humanId}
                                </div>
                            </div>

                            {/* Debug Image Preview */}
                            {debugImage && (
                                <div className="mb-4">
                                    <p className="text-xs text-app-text-tertiary mb-1 text-center">Captured photo:</p>
                                    <img src={debugImage} alt="Original captured sticker" className="w-full max-h-40 object-contain rounded-lg border border-app-border" />
                                </div>
                            )}

                            <p role="status" className="mb-4 text-center text-sm text-app-text-secondary">
                                {isProcessingOCR ? `${ocrStage} You can enter marks now.` : ocrError || (readStatus === 'read' ? 'Read successfully. Confirm the marks before saving.' : 'Needs review. Enter the marks or retake the photo.')}
                            </p>
                            <form onSubmit={handleSubmitMark}>
                                <div className="mb-8">
                                    <label className="block text-center text-xs font-bold text-app-text-tertiary uppercase tracking-widest mb-2">Obtained Marks</label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        pattern="[0-9]+([.][0-9]+)?"
                                        className="w-full text-center text-5xl font-black text-app-text bg-transparent border-none focus:ring-0 placeholder-slate-200 rounded-xl border border-app-border outline-none focus-visible:ring-2 focus-visible:ring-app-text"
                                        aria-label="Obtained marks"
                                        placeholder="—"
                                        disabled={isSaving}
                                        value={score}
                                        onChange={e => {
                                            captureRequest.current?.abort();
                                            setIsProcessingOCR(false);
                                            processingRef.current = false;
                                            setReadStatus(null);
                                            setOcrError('');
                                            setScore(e.target.value.replace(/[^0-9.]/g, ''));
                                        }}
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <TeacherButton variant="secondary" disabled={isSaving} onClick={handleCancelInput}>Retake</TeacherButton>
                                    <TeacherButton type="submit" disabled={isSaving || score === ''}>{isSaving ? 'Saving…' : 'Save'}</TeacherButton>
                                </div>
                            </form>
                        </div>
                    </div>, document.body
                )
            }
        </Layout >
    );
}
