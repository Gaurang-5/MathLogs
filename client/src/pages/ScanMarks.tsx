
import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { apiRequest } from '../utils/api';
import Layout from '../components/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { extractMarksFromSticker } from '../utils/ocr';
import { loadOpenCV, detectAndWarpSticker } from '../utils/cv';

export default function ScanMarks() {
    const [searchParams] = useSearchParams();
    const [scanning, setScanning] = useState(false);
    const [student, setStudent] = useState<any>(null);
    const [score, setScore] = useState('');
    const [tests, setTests] = useState<any[]>([]);
    const [selectedTestId, setSelectedTestId] = useState(searchParams.get('testId') || '');

    // Restored State Variables
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [existingMark, setExistingMark] = useState<number | null>(null);
    const [pendingStudent, setPendingStudent] = useState<any>(null);

    // OCR State
    const [isProcessingOCR, setIsProcessingOCR] = useState(false);
    const [debugImage, setDebugImage] = useState<string | null>(null);

    const scannerRef = useRef<Html5Qrcode | null>(null);
    const mountedRef = useRef(true);
    const processingRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        // Fetch available tests
        apiRequest('/tests').then(setTests).catch(console.error);

        return () => {
            mountedRef.current = false;
            // Immediate cleanup if unmounting
            if (scannerRef.current) {
                if (scannerRef.current.isScanning) {
                    scannerRef.current.stop().catch(err => console.error("Failed to stop scanner", err));
                }
                // clear() returns Promise<void> usually, but let's be safe
                try {
                    scannerRef.current.clear();
                } catch (e) {
                    // console.error("Failed to clear scanner", e);
                }
            }
        };
    }, []);

    // Load OpenCV on mount
    useEffect(() => {
        loadOpenCV().then(() => console.log("OpenCV Loaded")).catch(console.error);
    }, []);

    // Use a unique ID to prevent collisions
    const READER_ID = "reader-scan-marks";

    // Effect to start scanner when 'scanning' state becomes true
    useEffect(() => {
        if (scanning && mountedRef.current) {
            // Slight delay to ensure DOM is ready and previous instance is cleaned
            const timer = setTimeout(async () => {
                // Double check if element exists
                if (!document.getElementById(READER_ID)) {
                    console.error("Reader element not found");
                    setScanning(false);
                    return;
                }

                // Reset processing lock
                processingRef.current = false;

                // Prevent multiple initializations
                if (scannerRef.current?.isScanning) return;

                // Cleanup any existing instance
                if (scannerRef.current) {
                    await scannerRef.current.clear();
                }

                const html5QrCode = new Html5Qrcode(READER_ID);
                scannerRef.current = html5QrCode;

                try {
                    await html5QrCode.start(
                        {
                            facingMode: "environment"
                        },
                        {
                            fps: 10,
                            // Dynamic scan box matching the UI overlay
                            qrbox: (viewfinderWidth, _viewfinderHeight) => {
                                // Smaller scan area to avoid scanning adjacent QR codes
                                // 24rem = 384px (max width)
                                const maxWidth = 300;
                                const width = Math.min(maxWidth, viewfinderWidth * 0.6);
                                const height = width / 4.2; // 4.2:1 Aspect Ratio
                                return { width, height };
                            },
                            // Request high resolution for better focus
                            aspectRatio: 4 / 3,
                            disableFlip: false
                        },
                        async (decodedText) => {
                            // Success callback
                            if (processingRef.current) return; // Prevent multiple triggers
                            processingRef.current = true;

                            console.log("Matched: " + decodedText);
                            // Do NOT pause immediately so video keeps playing for CV detection
                            // html5QrCode.pause(); 

                            // Set processing state
                            setIsProcessingOCR(true);
                            setDebugImage(null); // Clear previous
                            let extractedMark = "";

                            try {
                                const videoElement = document.querySelector(`#${READER_ID} video`) as HTMLVideoElement;
                                if (videoElement) {
                                    console.log("🎥 Starting OCR processing...");

                                    // 1. Try OpenCV Smart Detection (Dewarping) - Burst Mode
                                    // Try 5 times over 500ms to get a good lock
                                    let smartImage = null;
                                    try {
                                        if (window.cv) {
                                            const cvCanvas = document.createElement('canvas'); // Not used by worker but kept for signature
                                            for (let i = 0; i < 5; i++) {
                                                smartImage = await detectAndWarpSticker(videoElement, cvCanvas);
                                                if (smartImage) break; // Found it!
                                                await new Promise(r => setTimeout(r, 100)); // Wait 100ms
                                            }
                                        }
                                    } catch (cvErr) {
                                        console.warn("CV Detection failed:", cvErr);
                                    }

                                    // NOW pause the scanner to save resources while we process OCR and show the modal
                                    html5QrCode.pause();

                                    let ocrResult;

                                    if (smartImage) {
                                        console.log("✨ Smart Detection Success! Sending dewarped image to AI.");
                                        ocrResult = await extractMarksFromSticker(videoElement, smartImage);
                                    } else {
                                        console.log("⚠️ Smart Detection Failed - Falling back to simple center crop.");
                                        ocrResult = await extractMarksFromSticker(videoElement);
                                    }

                                    extractedMark = ocrResult.score;
                                    if (ocrResult.debugImage) setDebugImage(ocrResult.debugImage);

                                    console.log("✅ OCR Complete!");
                                    console.log("   - Raw Score:", ocrResult.score);
                                    console.log("   - Confidence:", ocrResult.confidence);
                                    console.log("   - Has Debug Image:", !!ocrResult.debugImage);

                                    if (ocrResult.debugImage) {
                                        setDebugImage(ocrResult.debugImage);
                                    }
                                }
                            } catch (ocrErr) {
                                console.error("❌ OCR Error:", ocrErr);
                            } finally {
                                setIsProcessingOCR(false);
                            }

                            // Lookup Student
                            try {
                                const studentData = await apiRequest('/students/lookup/' + encodeURIComponent(decodedText) + '?testId=' + selectedTestId);
                                const existing = studentData.marks?.find((m: any) => m.testId === selectedTestId);

                                if (existing) {
                                    setExistingMark(existing.score);
                                    setPendingStudent(studentData);
                                } else {
                                    setStudent(studentData);
                                    // Pre-fill score if OCR detected anything (including "0")
                                    if (extractedMark && extractedMark.trim() !== "") {
                                        console.log("📝 Auto-filling score field with:", extractedMark);
                                        setScore(extractedMark);
                                    } else {
                                        console.log("⚠️ No marks detected by OCR - manual entry required");
                                    }
                                }
                            } catch (e) {
                                alert('Student not found or Invalid QR Code');
                                html5QrCode.resume();
                            }
                        },
                        (_errorMessage: any) => { /* ignore */ }
                    );

                    // Enable tap-to-focus on the video element
                    setTimeout(() => {
                        const videoElement = document.querySelector(`#${READER_ID} video`) as HTMLVideoElement;
                        if (videoElement && videoElement.srcObject) {
                            const stream = videoElement.srcObject as MediaStream;
                            const track = stream.getVideoTracks()[0];

                            videoElement.addEventListener('click', async () => {
                                try {
                                    const capabilities = track.getCapabilities() as any;
                                    if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
                                        await track.applyConstraints({
                                            advanced: [{ focusMode: 'continuous' } as any]
                                        });
                                        console.log('📷 Autofocus enabled');
                                    }
                                } catch (e) {
                                    console.warn('Tap-to-focus not supported:', e);
                                }
                            });
                        }
                    }, 1000);
                } catch (err) {
                    console.error("Error starting scanner:", err);
                    setScanning(false);
                    alert('Failed to start camera. Ensure permission is granted.');
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

            // Reset
            setStudent(null);
            setScore('');
            setExistingMark(null);
            setPendingStudent(null);
            setDebugImage(null);

            // Resume scanning
            if (scannerRef.current) {
                scannerRef.current.resume();
                processingRef.current = false;
            }
        } catch (e) {
            alert('Failed to save mark');
        }
    };

    const handleCancelInput = () => {
        setStudent(null);
        setScore('');
        setDebugImage(null);
        if (scannerRef.current) {
            scannerRef.current.resume();
            processingRef.current = false;
        }
    };

    return (
        <Layout title="Scan Marks">
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
                <div className="fixed inset-0 z-[100] bg-black overflow-hidden">
                    {/* Camera Viewfinder */}
                    <div id={READER_ID} className="w-full h-full absolute inset-0 [&>video]:object-cover [&>video]:w-full [&>video]:h-full"></div>

                    {/* Dark Backdrop for non-scanned area */}
                    <div className="absolute inset-0 bg-black/40 pointer-events-none"></div>

                    {/* Scanner Overlay - Absolute Center Force */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-[70vw] max-w-sm aspect-[4.2/1] flex bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] rounded-lg overflow-hidden border-2 border-white/50 ring-1 ring-black/20">

                        {/* Scanner Logic UI Components */}
                        {/* Left: QR Code Area */}
                        <div className="w-[25.5%] h-full border-r-2 border-white/50 relative flex items-center justify-center bg-green-500/10">
                            <div className="w-[85%] aspect-square border-2 border-green-400 rounded-sm relative shadow-[0_0_15px_rgba(74,222,128,0.5)]">
                                <div className="absolute inset-0 bg-green-400/10 animate-pulse"></div>
                                {/* Corner markers */}
                                <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-green-400"></div>
                                <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-green-400"></div>
                                <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-green-400"></div>
                                <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-green-400"></div>
                            </div>
                            <span className="absolute bottom-1 text-[8px] font-bold text-green-400 tracking-wider shadow-black drop-shadow-md">QR</span>
                        </div>

                        {/* Right: Info Area */}
                        <div className="flex-1 flex flex-col relative bg-white/5 backdrop-blur-[2px]">
                            {/* Top: Name Area */}
                            <div className="h-[45%] flex items-center pl-3 pt-1 border-b border-white/20">
                                <div className="w-3/4 h-2.5 bg-white/20 rounded-sm"></div>
                            </div>

                            {/* Bottom: Marks Section */}
                            <div className="h-[55%] flex items-center pl-3 pr-4 pb-1 gap-2 relative">
                                <span className="text-white/90 text-[8px] font-bold tracking-wider uppercase min-w-fit mt-1 drop-shadow-md">MARKS:</span>
                                <div className="flex-1 flex gap-1 h-full items-end justify-start pb-1">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="flex-1 h-[85%] border border-white/50 rounded-[1px] bg-white/10 relative">
                                            <div className="absolute bottom-[20%] left-0.5 right-0.5 h-px bg-white/40"></div>
                                        </div>
                                    ))}
                                </div>
                                <div className="absolute right-0.5 bottom-1 top-1 w-2 flex items-end justify-center pointer-events-none">
                                    <span className="text-[5px] text-white/50 font-mono -rotate-90 origin-bottom whitespace-nowrap mb-1">OCR</span>
                                </div>
                            </div>
                        </div>

                        {/* Guide Corners for entire sticker */}
                        <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-white/80 rounded-tl-sm"></div>
                        <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-white/80 rounded-tr-sm"></div>
                        <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-white/80 rounded-br-sm"></div>
                        <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-white/80 rounded-bl-sm"></div>
                    </div>

                    {/* Bottom Controls */}
                    <div className="absolute bottom-10 left-0 right-0 z-20 flex flex-col items-center gap-4 px-6">
                        {isProcessingOCR ? (
                            <div className="flex items-center gap-3 bg-white/90 backdrop-blur-md px-6 py-3 rounded-full shadow-xl animate-in slide-in-from-bottom-4">
                                <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                                <span className="font-bold text-slate-800">Processing Scan...</span>
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
            {pendingStudent && (
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
                                    if (scannerRef.current) scannerRef.current.resume();
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
            )}

            {/* Mark Entry Modal */}
            {student && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[150] animate-fadeIn">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 transform transition-all scale-100 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-500"></div>

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
                                    type="number"
                                    inputMode="numeric"
                                    className="w-full text-center text-5xl font-black text-slate-800 bg-transparent border-none focus:ring-0 placeholder-slate-200 outline-none"
                                    placeholder="00"
                                    autoFocus
                                    value={score}
                                    onChange={e => setScore(e.target.value)}
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
            )}
        </Layout>
    );
}
