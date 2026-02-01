
import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { apiRequest } from '../utils/api';
import Layout from '../components/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check } from 'lucide-react';

export default function ScanMarks() {
    const [searchParams] = useSearchParams();
    const [scanning, setScanning] = useState(false);
    const [student, setStudent] = useState<any>(null);
    const [score, setScore] = useState('');
    const [tests, setTests] = useState<any[]>([]);
    const [selectedTestId, setSelectedTestId] = useState(searchParams.get('testId') || '');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [existingMark, setExistingMark] = useState<number | null>(null);
    const [pendingStudent, setPendingStudent] = useState<any>(null);

    const scannerRef = useRef<Html5Qrcode | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        // Fetch available tests
        apiRequest('/tests').then(setTests).catch(console.error);

        // Cleanup scanner on unmount
        return () => {
            mountedRef.current = false;
            // safeguard: if valid scanner actually running
            if (scannerRef.current && scannerRef.current.isScanning) {
                scannerRef.current.stop().catch(console.error);
            }
        };
    }, []);

    const startScanner = async () => {
        if (!selectedTestId) {
            alert("Please select a test first!");
            return;
        }

        setScanning(true);
        // Use verbose ID but safeguard it
        const html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;

        try {
            await html5QrCode.start(
                { facingMode: "environment" },
                {
                    fps: 10,
                    qrbox: { width: 280, height: 100 }
                },
                async (decodedText) => {
                    // Success callback
                    console.log("Matched: " + decodedText);

                    // Pause scanning
                    html5QrCode.pause();

                    // Lookup Student
                    try {
                        const studentData = await apiRequest('/students/lookup/' + decodedText);

                        const existing = studentData.marks?.find((m: any) => m.testId === selectedTestId);

                        if (existing) {
                            setExistingMark(existing.score);
                            setPendingStudent(studentData);
                        } else {
                            setStudent(studentData);
                        }
                    } catch (e) {
                        alert('Student not found or Invalid Barcode');
                        html5QrCode.resume();
                    }
                },
                (_errorMessage: any) => {
                    // ignore
                }
            );
        } catch (err) {
            console.error(err);
            setScanning(false);
            alert('Failed to start camera. Ensure permission is granted.');
        }
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

            // Success feedback
            // alert('Marks saved for ' + student.name);

            // Reset
            setStudent(null);
            setScore('');

            // Resume scanning
            if (scannerRef.current) {
                scannerRef.current.resume();
            }
        } catch (e) {
            alert('Failed to save mark');
        }
    };

    const handleCancelInput = () => {
        setStudent(null);
        setScore('');
        if (scannerRef.current) {
            scannerRef.current.resume();
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
            <div className="w-full max-w-md mx-auto px-4 pt-safe" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
                <div className="bg-white p-6 rounded-3xl shadow-lg border border-slate-100">
                    {/* Scanner Preview */}
                    <div className="relative w-full rounded-2xl overflow-hidden shadow-inner bg-black" style={{ aspectRatio: '4/3' }}>
                        <div id="reader" className="w-full h-full"></div>

                        {/* Scanner Overlay */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            {/* Scan Frame */}
                            <div className="relative w-full max-w-xs">
                                {/* Corners */}
                                <div className="absolute top-0 left-0 w-16 h-16 border-t-4 border-l-4 border-white rounded-tl-2xl"></div>
                                <div className="absolute top-0 right-0 w-16 h-16 border-t-4 border-r-4 border-white rounded-tr-2xl"></div>
                                <div className="absolute bottom-0 left-0 w-16 h-16 border-b-4 border-l-4 border-white rounded-bl-2xl"></div>
                                <div className="absolute bottom-0 right-0 w-16 h-16 border-b-4 border-r-4 border-white rounded-br-2xl"></div>

                                {/* Center indicator */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="h-1 w-3/4 bg-green-400 shadow-lg shadow-green-400/50 rounded-full animate-pulse"></div>
                                </div>
                            </div>

                            {/* Instruction Text */}
                            <div className="absolute bottom-8 left-0 right-0 flex justify-center">
                                <div className="text-white text-sm font-medium bg-black/70 px-6 py-2.5 rounded-full backdrop-blur-md border border-white/20 shadow-lg">
                                    Align barcode within box
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Status and Stop Button */}
                    <div className="mt-6 text-center space-y-4">
                        <p className="text-slate-500 text-sm font-medium flex items-center justify-center gap-2">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            Scanning for barcodes...
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="text-sm font-bold text-red-500 hover:text-red-700 hover:bg-red-50 px-4 py-2 rounded-lg transition-all active:scale-95"
                        >
                            Stop Scanner
                        </button>
                    </div>
                </div>
            </div>

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
