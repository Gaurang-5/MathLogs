
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
                        { facingMode: "environment" },
                        {
                            fps: 10,
                            // Match overlay dimensions: w-[20rem] (320px) x h-[4.75rem] (~76px)
                            qrbox: { width: 320, height: 76 }
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

            {/* Scanner Active */}
            {scanning && (
                <div className="w-full max-w-md mx-auto px-4 pt-safe" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
                    <div className="bg-white p-6 rounded-3xl shadow-lg border border-slate-100">
                        {/* Scanner Preview */}
                        <div className="relative w-full rounded-2xl overflow-hidden shadow-inner bg-black" style={{ aspectRatio: '4/3' }}>
                            <div id={READER_ID} className="w-full h-full"></div>

                            {/* Scanner Overlay */}
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                {/* Scan Frame - Precision Layout (Matches 46mm x 11mm Sticker) */}
                                {/* Width 320px x Height 76px - Aspect Ratio 4.21 matches 46/11 closely */}
                                <div className="relative w-[20rem] h-[4.75rem] flex bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] rounded-sm overflow-hidden">

                                    {/* Left: QR Code Area */}
                                    {/* Calculated from PDF: QR area is ~25.5% of total width */}
                                    <div className="w-[25.5%] h-full border-r-2 border-white/50 relative flex items-center justify-center bg-green-500/10">
                                        {/* Green guide box for QR */}
                                        <div className="w-[85%] aspect-square border-2 border-green-400 rounded-sm relative">
                                            <div className="absolute inset-0 bg-green-400/5 animate-pulse"></div>
                                            {/* Corner markers */}
                                            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-green-400"></div>
                                            <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-green-400"></div>
                                            <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-green-400"></div>
                                            <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-green-400"></div>
                                        </div>
                                        <span className="absolute bottom-1 text-[8px] font-bold text-green-400 tracking-wider">QR</span>
                                    </div>

                                    {/* Right: Info Area (Remaining 74.5%) */}
                                    <div className="flex-1 flex flex-col relative">

                                        {/* Top: Name Area (PDF: 2pt to 14pt = ~12pt height -> ~45%) */}
                                        <div className="h-[45%] flex items-center pl-3 pt-1 border-b border-white/20">
                                            {/* Name Placeholder */}
                                            <div className="w-3/4 h-2.5 bg-white/20 rounded-sm"></div>
                                        </div>

                                        {/* Bottom: Marks Section (PDF: 14pt to end -> ~55%) */}
                                        <div className="h-[55%] flex items-center pl-3 pr-4 pb-1 gap-2 relative">
                                            {/* "MARKS:" Label */}
                                            <span className="text-white/80 text-[8px] font-bold tracking-wider uppercase min-w-fit mt-1">MARKS:</span>

                                            {/* Digit Boxes - Filling remaining width */}
                                            <div className="flex-1 flex gap-1 h-full items-end justify-start pb-1">
                                                {/* Three boxes matching PDF layout */}
                                                {[1, 2, 3].map((i) => (
                                                    <div key={i} className="flex-1 h-[85%] border border-white/50 rounded-[1px] bg-white/5 relative group">
                                                        {/* Bottom dashed guide line like in PDF */}
                                                        <div className="absolute bottom-[20%] left-0.5 right-0.5 h-px bg-white/30"></div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Vertical OCR Text (Matches PDF) */}
                                            <div className="absolute right-0.5 bottom-1 top-1 w-2 flex items-end justify-center overflow-visible pointer-events-none">
                                                <span className="text-[5px] text-white/30 font-mono -rotate-90 origin-bottom whitespace-nowrap mb-1 select-none">OCR</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Outer White Border for the whole sticker shape */}
                                    <div className="absolute inset-0 pointer-events-none rounded-sm border border-white/30"></div>

                                    {/* Fiducial Guide Markers (Corners) */}
                                    {/* Top-Left */}
                                    <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-white rounded-tl-sm shadow-sm"></div>
                                    {/* Top-Right */}
                                    <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-white rounded-tr-sm shadow-sm"></div>
                                    {/* Bottom-Right */}
                                    <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-white rounded-br-sm shadow-sm"></div>
                                    {/* Bottom-Left */}
                                    <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-white rounded-bl-sm shadow-sm"></div>
                                </div>

                                {/* Instruction Text */}
                                <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                                    <div className="text-white text-xs font-semibold bg-black/60 px-4 py-2 rounded-full backdrop-blur-md border border-white/10 shadow-lg">
                                        Align QR in green box
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Status and Stop Button */}
                        <div className="mt-6 text-center space-y-4">
                            <p className="text-slate-500 text-sm font-medium flex items-center justify-center gap-2">
                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                Scanning for QR codes...
                            </p>
                            <button
                                onClick={() => window.location.reload()}
                                className="text-sm font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-4 py-2 rounded-lg transition-all active:scale-95"
                            >
                                Stop Scanner
                            </button>

                            {/* OCR Status Indicator */}
                            {isProcessingOCR && (
                                <div className="mt-4 animate-in fade-in slide-in-from-bottom-2">
                                    <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 px-4 py-2 rounded-full border border-indigo-100 shadow-sm">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span className="text-sm font-bold">Extracting Marks (AI)...</span>
                                    </div>
                                </div>
                            )}
                        </div>
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
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
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
