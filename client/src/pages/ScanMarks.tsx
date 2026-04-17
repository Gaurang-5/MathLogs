
import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { apiRequest } from '../utils/api';
import Layout from '../components/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { extractMarksFromSticker } from '../utils/ocr';
import { loadOpenCV, detectAndWarpSticker } from '../utils/cv';

declare global {
    interface Window {
        cv?: unknown;
    }
}

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
    batch?: {
        className?: string | null;
    };
    marks?: StudentMark[];
}

interface OCRScanResult {
    score: string;
    confidence: number;
    debugImage?: string | null;
}

interface FocusCapabilities extends MediaTrackCapabilities {
    focusMode?: string[];
}

export default function ScanMarks() {
    const [searchParams] = useSearchParams();
    const [scanning, setScanning] = useState(false);
    const [student, setStudent] = useState<StudentLookupResponse | null>(null);
    const [score, setScore] = useState('');
    const [tests, setTests] = useState<ScanTest[]>([]);
    const [selectedTestId, setSelectedTestId] = useState(searchParams.get('testId') || '');

    // Restored State Variables
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [existingMark, setExistingMark] = useState<number | null>(null);
    const [pendingStudent, setPendingStudent] = useState<StudentLookupResponse | null>(null);

    // OCR State
    const [isProcessingOCR, setIsProcessingOCR] = useState(false);
    const [debugImage, setDebugImage] = useState<string | null>(null);

    const scannerRef = useRef<Html5Qrcode | null>(null);
    const mountedRef = useRef(true);
    const processingRef = useRef(false);
    const testsRef = useRef<ScanTest[]>([]);

    // Helper function for toast notifications
    const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-yellow-500';
        toast.className = `fixed top-20 left-1/2 -translate-x-1/2 ${bgColor} text-white px-6 py-3 rounded-lg shadow-lg z-[300] animate-fadeIn max-w-md text-center`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    };

    useEffect(() => {
        mountedRef.current = true;
        // Fetch available tests
        apiRequest<ScanTest[]>('/tests').then(setTests).catch(console.error);

        return () => {
            mountedRef.current = false;
            // Immediate cleanup if unmounting
            if (scannerRef.current) {
                if (scannerRef.current.isScanning) {
                    scannerRef.current.stop().catch(err => console.error("Failed to stop scanner", err));
                }
                // clear() returns Promise<void> usually, but let's be safe
                scannerRef.current.clear().catch((error: unknown) => {
                    console.debug("Failed to clear scanner on unmount", error);
                });
            }
        };
    }, []);

    useEffect(() => {
        testsRef.current = tests;
    }, [tests]);

    // Load OpenCV on mount
    useEffect(() => {
        loadOpenCV().then(() => console.log("OpenCV Loaded")).catch(console.error);
    }, []);

    // Use a unique ID to prevent collisions
    const READER_ID = "reader-scan-marks";

    // Effect to start scanner when 'scanning' state becomes true
    useEffect(() => {
        if (scanning && mountedRef.current) {
            console.log("🎬 Scanner initialization triggered");
            // Slight delay to ensure DOM is ready and previous instance is cleaned
            const timer = setTimeout(async () => {
                console.log("⏰ Timer executed, checking DOM...");
                // Double check if element exists
                const readerElement = document.getElementById(READER_ID);
                if (!readerElement) {
                    console.error("❌ Reader element not found!");
                    setScanning(false);
                    return;
                }
                console.log("✅ Reader element found:", readerElement);

                // Reset processing lock
                processingRef.current = false;

                // Prevent multiple initializations
                if (scannerRef.current?.isScanning) {
                    console.log("⚠️ Scanner already running, skipping init");
                    return;
                }

                // Cleanup any existing instance
                if (scannerRef.current) {
                    console.log("🧹 Cleaning up existing scanner...");
                    await scannerRef.current.clear();
                }

                console.log("🚀 Creating new Html5Qrcode instance...");
                const html5QrCode = new Html5Qrcode(READER_ID);
                scannerRef.current = html5QrCode;

                try {
                    console.log("📸 Starting camera with config...");
                    await html5QrCode.start(
                        {
                            facingMode: "environment"
                        },
                        {
                            fps: 10, // Lower FPS is more stable on iOS/mobile
                            // Scan the full frame. In iOS PWAs, object-fit: cover can cause qrbox 
                            // to internally scan the wrong region of the camera feed.
                            disableFlip: false
                        },
                        async (decodedText) => {
                            if (processingRef.current) return;
                            processingRef.current = true;

                            console.log("✅ QR Matched: " + decodedText);

                            // Start student lookup immediately (doesn't need the frame)
                            const studentLookupPromise = apiRequest<StudentLookupResponse>('/students/lookup/' + encodeURIComponent(decodedText) + '?testId=' + selectedTestId);

                            setIsProcessingOCR(true);
                            setDebugImage(null);
                            let extractedMark = "";

                            // OCR processing — brief settle then capture
                            const ocrPromise = (async (): Promise<OCRScanResult> => {
                                try {
                                    // ⏳ Brief settle: QR fires instantly but sticker may
                                    // still be moving. 100ms is enough.
                                    await new Promise(r => setTimeout(r, 100));

                                    // NOW pause (video still had live frames during the wait)
                                    html5QrCode.pause();

                                    const videoElement = document.querySelector(`#${READER_ID} video`) as HTMLVideoElement;
                                    if (!videoElement) return { score: "", confidence: 0, debugImage: null };

                                    // CV detection: 3 attempts × 100ms = max 300ms
                                    let smartImage = null;
                                    if (window.cv) {
                                        try {
                                            const cvCanvas = document.createElement('canvas');
                                            for (let i = 0; i < 3; i++) {
                                                smartImage = await detectAndWarpSticker(videoElement, cvCanvas);
                                                if (smartImage) {
                                                    console.log(`✅ CV warp succeeded on attempt ${i + 1}`);
                                                    break;
                                                }
                                                if (i < 2) await new Promise(r => setTimeout(r, 100));
                                            }
                                        } catch (error) {
                                            console.debug('CV warp attempt failed', error);
                                        }
                                    }

                                    if (!smartImage) console.warn("⚠️ CV warp failed — using raw video fallback");

                                    // Get maxMarks from the selected test for OCR range validation
                                    const currentTest = testsRef.current.find(t => t.id === selectedTestId);
                                    const testMaxMarks = currentTest?.maxMarks;

                                    return smartImage
                                        ? await extractMarksFromSticker(videoElement, smartImage, testMaxMarks)
                                        : await extractMarksFromSticker(videoElement, undefined, testMaxMarks);
                                } catch (ocrErr) {
                                    console.error("❌ OCR Error:", ocrErr);
                                    return { score: "", confidence: 0, debugImage: null };
                                }
                            })();


                            // Wait for both in parallel
                            try {
                                console.log("⏳ Waiting for student lookup and OCR...");
                                const [studentData, ocrResult] = await Promise.all([studentLookupPromise, ocrPromise]);

                                console.log("✅ Student Data:", studentData);
                                console.log("✅ OCR Result:", ocrResult);

                                extractedMark = ocrResult.score;
                                if (ocrResult.debugImage) setDebugImage(ocrResult.debugImage);
                                setIsProcessingOCR(false);

                                // Check if student belongs to the selected test's batch
                                const selectedTest = testsRef.current.find(t => t.id === selectedTestId);
                                if (selectedTest && studentData.batch) {
                                    // Check if className matches (if test has className)
                                    if (selectedTest.className && studentData.batch.className !== selectedTest.className) {
                                        setScanning(false);
                                        showToast(`⚠️ Wrong Batch! ${studentData.name} is in ${studentData.batch.className}, but test is for ${selectedTest.className}`, 'warning');
                                        processingRef.current = false;
                                        setTimeout(() => setScanning(true), 3000); // Auto-resume after 3s
                                        return;
                                    }
                                }

                                const existing = studentData.marks?.find((mark) => mark.testId === selectedTestId);

                                // Hide scanner overlay so modal can appear
                                setScanning(false);

                                if (existing) {
                                    console.log("⚠️ Student already has marks:", existing.score);
                                    setExistingMark(existing.score);
                                    setPendingStudent(studentData);
                                    if (extractedMark && extractedMark.trim() !== "") {
                                        setScore(extractedMark);
                                    }
                                } else {
                                    console.log("✅ Setting student and score:", extractedMark);
                                    setStudent(studentData);
                                    if (extractedMark && extractedMark.trim() !== "") {
                                        setScore(extractedMark);
                                    }
                                }

                                // Reset processing flag so modal can appear and next scan can work
                                processingRef.current = false;
                                console.log("✅ Modal should appear now!");
                            } catch (error: unknown) {
                                console.error("❌ Error in scan processing:", error);
                                setIsProcessingOCR(false);
                                setScanning(false);
                                showToast(error instanceof Error ? error.message : 'Student not found or Invalid QR Code', 'error');
                                processingRef.current = false;
                                setTimeout(() => setScanning(true), 2000); // Auto-resume after 2s
                            }
                        },
                        () => undefined
                    );

                    // Enable tap-to-focus on the video element
                    setTimeout(() => {
                        const videoElement = document.querySelector(`#${READER_ID} video`) as HTMLVideoElement;
                        if (videoElement && videoElement.srcObject) {
                            const stream = videoElement.srcObject as MediaStream;
                            const track = stream.getVideoTracks()[0];

                            videoElement.addEventListener('click', async () => {
                                try {
                                    const capabilities = track.getCapabilities() as FocusCapabilities;
                                    if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                                        await track.applyConstraints({
                                            advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet]
                                        } as MediaTrackConstraints);
                                        console.log('📷 Autofocus enabled');
                                    }
                                } catch (error) {
                                    console.warn('Tap-to-focus not supported:', error);
                                }
                            });
                        }
                    }, 1000);

                    console.log("✅ Scanner started successfully!");
                } catch (error: unknown) {
                    console.error("❌ Error starting scanner:", error);
                    console.error("Error details:", {
                        message: error instanceof Error ? error.message : 'Unknown error',
                        name: error instanceof Error ? error.name : 'UnknownError',
                        stack: error instanceof Error ? error.stack : undefined
                    });
                    setScanning(false);
                    showToast('Failed to start camera: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
                }
            }, 300); // Increased delay for safety

            return () => {
                clearTimeout(timer);
                if (scannerRef.current && scannerRef.current.isScanning) {
                    scannerRef.current.stop().catch(console.error);
                }
            };
        }
    }, [scanning, selectedTestId]);

    const startScanner = () => {
        if (!selectedTestId) {
            alert("Please select a test first!");
            return;
        }
        setScanning(true);
    };

    const handleSubmitMark = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!student || !selectedTestId) return;

        try {
            await apiRequest('/marks', 'POST', {
                testId: selectedTestId,
                studentId: student.id,
                score
            });

            // Single success toast
            showToast(`✓ ${student.name}: ${score} marks saved`, 'success');

            // Reset for next scan
            setStudent(null);
            setScore('');
            setExistingMark(null);
            setPendingStudent(null);
            setDebugImage(null);

            // CONTINUOUS SCANNING: Immediately resume scanner
            processingRef.current = false;

            // Resume the scanner if it exists and is paused
            if (scannerRef.current) {
                try {
                    // Check if scanner is in a paused state
                    if (scannerRef.current.getState() === 2) { // State 2 = PAUSED
                        await scannerRef.current.resume();
                        console.log('✅ Scanner resumed for next scan');
                    }
                } catch (resumeError) {
                    console.warn('Could not resume scanner, will restart:', resumeError);
                    // If resume fails, restart the scanner
                    setScanning(false);
                    setTimeout(() => setScanning(true), 100);
                    return;
                }
            }

            // Keep scanning overlay visible
            setScanning(true);
        } catch (error: unknown) {
            console.error('Save mark error:', error);
            // Extract error message from backend response
            const errorMsg = error instanceof Error ? error.message : 'Failed to save mark';
            showToast(errorMsg, 'error');
            // Don't resume scanning on error - let user fix the issue
        }
    };

    const handleCancelInput = () => {
        setStudent(null);
        setScore('');
        setDebugImage(null);
        processingRef.current = false;

        // Resume scanner
        if (scannerRef.current) {
            try {
                if (scannerRef.current.getState() === 2) { // State 2 = PAUSED
                    scannerRef.current.resume();
                }
            } catch (error) {
                console.warn('Could not resume scanner on cancel:', error);
            }
        }
        setScanning(true); // Show scanner overlay again
    };

    return (
        <Layout title="Scan Marks">
            {/* Hide top and bottom navigation bars when in immersive scanning mode or showing modals */}
            {(scanning || student || pendingStudent) && (
                <style>{`
                    nav.fixed.bottom-6 { display: none !important; }
                    header.fixed.top-0 { display: none !important; }
                `}</style>
            )}

            {/* Test Selector */}
            {!scanning && (
                <div className="max-w-md mx-auto mt-10">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                        <h2 className="text-xl font-bold mb-6 text-slate-800">Start Assessment</h2>
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Select Test</label>
                            <div className="relative">
                                <button
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-left flex justify-between items-center outline-none focus:ring-2 focus:ring-blue-500 transition"
                                >
                                    <span className={selectedTestId ? "text-slate-800 font-medium" : "text-slate-400"}>
                                        {selectedTestId
                                            ? (() => {
                                                const t = tests.find(t => t.id === selectedTestId);
                                                return t ? `${t.name} (${t.subject}) • ${t.className}` : "Unknown Test";
                                            })()
                                            : "-- Choose Test --"}
                                    </span>
                                    <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${isDropdownOpen ? "rotate-180" : ""}`} />
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
                                                        <span className="text-slate-400 text-xs font-normal">{t.subject} • {t.className}</span>
                                                    </div>
                                                    {selectedTestId === t.id && <Check className="w-4 h-4 text-blue-600" />}
                                                </button>
                                            ))}
                                            {tests.length === 0 && (
                                                <div className="p-4 text-center text-slate-400 text-sm">No tests available</div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                        <button
                            onClick={startScanner}
                            className={`w-full font-bold py-4 rounded-xl transition-all shadow-md flex items-center justify-center
                                ${selectedTestId
                                    ? 'bg-gray-900 hover:bg-black text-white shadow-lg shadow-gray-200 hover:shadow-gray-300'
                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                            disabled={!selectedTestId}
                        >
                            <span className="mr-2">📷</span> Start Camera
                        </button>
                    </div>
                </div>
            )}

            {/* Scanner Active - Immersive Fullscreen Mobile UI */}
            {scanning && (
                <div className="fixed inset-0 z-[200] bg-black overflow-hidden">
                    {/* Camera Viewfinder */}
                    <style>{`
                        /* Hide html5-qrcode's default qrbox border AND background */
                        #${READER_ID} #qr-shaded-region { 
                            border: none !important; 
                            box-shadow: none !important;
                            background: transparent !important;
                        }
                        #${READER_ID} div[style*="border"] { 
                            border: none !important; 
                        }
                        /* Hide the gray rectangle background */
                        #${READER_ID} > div:not(video) {
                            background: transparent !important;
                        }
                    `}</style>
                    <div id={READER_ID} className="w-full h-full absolute inset-0 flex items-center justify-center bg-black"></div>

                    {/* Dark Backdrop for non-scanned area */}
                    <div className="absolute inset-0 bg-black/40 pointer-events-none"></div>

                    {/* Minimal Corner Guides - No rectangle, just corners */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-[75vw] max-w-lg aspect-[39/21] pointer-events-none">
                        {/* Top-left corner */}
                        <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-lg shadow-[0_0_20px_rgba(74,222,128,0.6)]"></div>

                        {/* Top-right corner */}
                        <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-lg shadow-[0_0_20px_rgba(74,222,128,0.6)]"></div>

                        {/* Bottom-left corner */}
                        <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-lg shadow-[0_0_20px_rgba(74,222,128,0.6)]"></div>

                        {/* Bottom-right corner */}
                        <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-lg shadow-[0_0_20px_rgba(74,222,128,0.6)]"></div>

                        {/* Subtle center guide text */}
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/70 text-sm font-medium bg-black/50 px-4 py-2 rounded-full backdrop-blur-sm">
                            Align sticker here
                        </div>
                    </div>

                    {/* Bottom Controls */}
                    <div className="absolute bottom-10 left-0 right-0 z-20 flex flex-col items-center gap-4 px-6">
                        {isProcessingOCR ? (
                            <div className="flex items-center gap-3 bg-white/90 backdrop-blur-md px-6 py-3 rounded-full shadow-xl animate-in slide-in-from-bottom-4">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                <span className="font-bold text-slate-800">Hold steady — reading marks...</span>
                            </div>
                        ) : (
                            <div className="bg-black/60 backdrop-blur-md text-white text-center px-4 py-2 rounded-full border border-white/10 max-w-xs">
                                <p className="text-xs font-medium">Hold 10-15cm from sticker</p>
                                <p className="text-[10px] text-white/70 mt-0.5">Tap screen to focus if blurry</p>
                            </div>
                        )}

                        <button
                            onClick={() => window.location.reload()} // Reload is safest way to cleanly kill camera stream
                            className="mt-4 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/50 px-8 py-3 rounded-xl font-bold transition active:scale-95 backdrop-blur-sm"
                        >
                            Cancel Scan
                        </button>
                    </div>
                </div>
            )}


            {/* Warning Modal */}
            {
                pendingStudent && (
                    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                        <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center">
                            <div className="w-16 h-16 bg-yellow-50 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold shadow-sm">!</div>
                            <h2 className="text-xl font-bold text-slate-800 mb-2">Marks Already Exist</h2>
                            <p className="text-slate-600 mb-4">
                                <span className="font-bold">{pendingStudent.name}</span> has already scored <span className="font-bold">{existingMark}</span> in this test.
                            </p>
                            <p className="text-sm text-slate-500 mb-6">Do you want to overwrite the score?</p>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => {
                                        setPendingStudent(null);
                                        setExistingMark(null);
                                        if (scannerRef.current) {
                                            scannerRef.current.resume();
                                            processingRef.current = false;
                                        }
                                        setScanning(true); // Show scanner overlay again
                                    }}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        setStudent(pendingStudent);
                                        setPendingStudent(null);
                                        setExistingMark(null);
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition"
                                >
                                    Overwrite
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Mark Entry Modal */}
            {
                student && (
                    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[150] animate-fadeIn">
                        <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 transform transition-all scale-100 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-teal-500"></div>

                            <div className="text-center mb-8">
                                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold shadow-sm">
                                    {student.name.charAt(0)}
                                </div>
                                <h2 className="text-2xl font-bold text-slate-800">{student.name}</h2>
                                <p className="text-slate-500 text-sm mt-1">{student.batch?.name}</p>
                                <div className="inline-block bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded mt-2 font-mono">
                                    {student.humanId}
                                </div>
                            </div>

                            {/* Debug Image Preview */}
                            {debugImage && (
                                <div className="mb-4">
                                    <p className="text-xs text-slate-400 mb-1 text-center">AI Vision Capture:</p>
                                    <img src={debugImage} alt="OCR Debug" className="w-full h-auto rounded-lg border border-slate-200" />
                                </div>
                            )}

                            <form onSubmit={handleSubmitMark}>
                                <div className="mb-8">
                                    <label className="block text-center text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Obtained Marks</label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        className="w-full text-center text-5xl font-black text-slate-800 bg-transparent border-none focus:ring-0 placeholder-slate-200 outline-none"
                                        placeholder="00"
                                        autoFocus
                                        value={score}
                                        onChange={e => setScore(e.target.value.replace(/[^0-9.]/g, ''))}
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        type="button"
                                        onClick={handleCancelInput}
                                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3.5 rounded-xl transition"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 rounded-xl shadow-lg hover:shadow-green-200 transition"
                                    >
                                        Save
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }
        </Layout >
    );
}
