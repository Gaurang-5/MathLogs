import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CheckCircle2, Loader2, RefreshCw, ShieldAlert, UserRound } from 'lucide-react';
import Layout from '../components/Layout';
import { API_URL, api } from '../utils/api';

interface AttendanceFeedRecord {
    id: string;
    checkedInAt: string;
    photoUrl: string | null;
    source: 'KIOSK' | 'MANUAL';
    student: {
        id: string;
        name: string;
        humanId: string | null;
    };
    batch: {
        id: string;
        name: string;
        timeSlot: string | null;
    };
}

interface AttendanceFeedResponse {
    date: string;
    records: AttendanceFeedRecord[];
}

interface CheckInResponse {
    success: boolean;
    duplicate: boolean;
    record: {
        id: string;
        studentId: string;
        studentName: string;
        batchName: string;
        checkedInAt: string;
        photoUrl: string | null;
        source: 'KIOSK' | 'MANUAL';
    };
}

const READER_ID = 'attendance-kiosk-reader';

async function captureCompressedFrame(video: HTMLVideoElement): Promise<Blob> {
    const sourceWidth = video.videoWidth || 1280;
    const sourceHeight = video.videoHeight || 720;
    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / sourceWidth);
    const width = Math.max(320, Math.round(sourceWidth * scale));
    const height = Math.max(240, Math.round(sourceHeight * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    if (!context) {
        throw new Error('Unable to capture camera frame');
    }

    context.drawImage(video, 0, 0, width, height);

    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Failed to compress proof photo'));
                return;
            }
            resolve(blob);
        }, 'image/jpeg', 0.72);
    });
}

function formatTimestamp(value: string) {
    return new Intl.DateTimeFormat('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        day: '2-digit',
        month: 'short',
    }).format(new Date(value));
}

export default function AttendanceKiosk() {
    const [searchParams] = useSearchParams();
    const batchId = searchParams.get('batchId') || '';
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const mountedRef = useRef(true);
    const processingRef = useRef(false);
    const [isStarting, setIsStarting] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState<CheckInResponse['record'] | null>(null);
    const [recentRecords, setRecentRecords] = useState<AttendanceFeedRecord[]>([]);

    const loadFeed = async () => {
        try {
            const endpoint = batchId ? `/attendance/feed?batchId=${encodeURIComponent(batchId)}&limit=8` : '/attendance/feed?limit=8';
            const response = await api.get<AttendanceFeedResponse>(endpoint);
            setRecentRecords(response.records);
        } catch (feedError) {
            console.error('Failed to load attendance feed', feedError);
        }
    };

    useEffect(() => {
        mountedRef.current = true;
        loadFeed();

        return () => {
            mountedRef.current = false;
            const scanner = scannerRef.current;
            if (!scanner) return;
            if (scanner.isScanning) {
                scanner.stop().catch((stopError) => console.error('Failed to stop kiosk scanner', stopError));
            }
            scanner.clear().catch((clearError) => console.debug('Failed to clear kiosk scanner', clearError));
        };
    }, [batchId]);

    useEffect(() => {
        const startScanner = async () => {
            const scanner = new Html5Qrcode(READER_ID);
            scannerRef.current = scanner;

            try {
                await scanner.start(
                    { facingMode: 'user' },
                    {
                        fps: 10,
                        qrbox: undefined,
                        disableFlip: false,
                    },
                    async (decodedText) => {
                        if (processingRef.current) return;
                        processingRef.current = true;
                        setError('');

                        try {
                            scanner.pause(true);
                            const video = document.querySelector(`#${READER_ID} video`) as HTMLVideoElement | null;
                            if (!video) throw new Error('Camera frame unavailable');

                            const blob = await captureCompressedFrame(video);
                            const formData = new FormData();
                            formData.append('humanId', decodedText);
                            if (batchId) formData.append('batchId', batchId);
                            formData.append('image', blob, 'attendance-checkin.jpg');

                            const token = localStorage.getItem('token');
                            const response = await fetch(`${API_URL}/attendance/check-in`, {
                                method: 'POST',
                                headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                                body: formData,
                            });

                            if (!response.ok) {
                                const payload = await response.json().catch(() => ({ error: 'Check-in failed' }));
                                throw new Error(payload.error || 'Check-in failed');
                            }

                            const payload = await response.json() as CheckInResponse;
                            if (!mountedRef.current) return;

                            setSuccess(payload.record);
                            await loadFeed();

                            window.setTimeout(() => {
                                if (!mountedRef.current) return;
                                setSuccess(null);
                                processingRef.current = false;
                                scanner.resume();
                            }, 2000);
                        } catch (scanError) {
                            console.error('Attendance check-in failed', scanError);
                            if (!mountedRef.current) return;
                            setError(scanError instanceof Error ? scanError.message : 'Check-in failed');
                            window.setTimeout(() => {
                                if (!mountedRef.current) return;
                                processingRef.current = false;
                                scanner.resume();
                            }, 1400);
                        }
                    },
                    () => {
                        // Silent scan failures are expected while the camera is live.
                    }
                );

                if (mountedRef.current) {
                    setIsStarting(false);
                }
            } catch (cameraError) {
                console.error('Failed to start attendance kiosk camera', cameraError);
                if (!mountedRef.current) return;
                setError(cameraError instanceof Error ? cameraError.message : 'Failed to start camera');
                setIsStarting(false);
            }
        };

        startScanner();

        return () => {
            const scanner = scannerRef.current;
            if (!scanner) return;
            if (scanner.isScanning) {
                scanner.stop().catch(() => undefined);
            }
        };
    }, [batchId]);

    return (
        <Layout title="Attendance Kiosk">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_380px]">
                <section className="relative overflow-hidden rounded-[32px] border border-app-border bg-[#08111f] p-4 shadow-[0_24px_70px_-24px_rgba(8,17,31,0.7)]">
                    <div className="mb-4 flex items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-white/5 px-4 py-3 text-white/90">
                        <div>
                            <p className="text-sm font-semibold tracking-wide">Snap-Scan Live</p>
                            <p className="text-xs text-white/65">Front camera stays active. A still proof photo is captured instantly after every QR match.</p>
                        </div>
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                            <Camera className="h-5 w-5" />
                        </div>
                    </div>

                    <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-black">
                        <div id={READER_ID} className="min-h-[520px] [&>div]:border-0 [&_video]:min-h-[520px] [&_video]:w-full [&_video]:object-cover" />

                        {isStarting && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                                <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold text-white">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Starting camera...
                                </div>
                            </div>
                        )}

                        {success && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-500/88 text-white backdrop-blur-md">
                                <CheckCircle2 className="mb-4 h-20 w-20" strokeWidth={1.6} />
                                <p className="text-sm uppercase tracking-[0.24em] text-emerald-50/80">Checked In</p>
                                <h2 className="mt-2 text-3xl font-bold tracking-tight">{success.studentName}</h2>
                                <p className="mt-2 text-sm text-emerald-50/85">{success.batchName}</p>
                            </div>
                        )}

                        {!success && error && (
                            <div className="absolute left-4 right-4 top-4 rounded-2xl border border-rose-200/30 bg-rose-500/90 px-4 py-3 text-sm font-medium text-white shadow-xl">
                                {error}
                            </div>
                        )}
                    </div>
                </section>

                <aside className="space-y-4">
                    <div className="rounded-[28px] border border-app-border bg-app-surface-opaque p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-app-text">Queue-Friendly Mode</p>
                                <p className="mt-1 text-sm text-app-text-secondary">Each success screen holds for 2 seconds, then scanning resumes automatically.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => loadFeed()}
                                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-app-border bg-app-bg text-app-text-secondary transition-colors hover:text-app-text"
                                title="Refresh recent feed"
                            >
                                <RefreshCw className="h-4 w-4" />
                            </button>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                            <div className="rounded-2xl bg-app-bg px-4 py-3">
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-app-text-tertiary">Camera</p>
                                <p className="mt-2 text-sm font-semibold text-app-text">Front-facing</p>
                            </div>
                            <div className="rounded-2xl bg-app-bg px-4 py-3">
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-app-text-tertiary">Upload</p>
                                <p className="mt-2 text-sm font-semibold text-app-text">On-device JPEG compression</p>
                            </div>
                            <div className="rounded-2xl bg-app-bg px-4 py-3">
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-app-text-tertiary">Batch Lock</p>
                                <p className="mt-2 text-sm font-semibold text-app-text">{batchId ? 'Enabled' : 'Any batch allowed'}</p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[28px] border border-app-border bg-app-surface-opaque p-5 shadow-sm">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-base font-semibold text-app-text">Recent Check-ins</h3>
                                <p className="text-sm text-app-text-secondary">Newest proof photos appear here in real time.</p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {recentRecords.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-app-border bg-app-bg px-4 py-8 text-center text-sm text-app-text-secondary">
                                    No check-ins yet for today.
                                </div>
                            ) : (
                                recentRecords.map((record) => (
                                    <div key={record.id} className="flex items-center gap-3 rounded-2xl border border-app-border bg-app-bg p-3">
                                        {record.photoUrl ? (
                                            <img src={record.photoUrl} alt={record.student.name} className="h-14 w-14 rounded-2xl object-cover" />
                                        ) : (
                                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-app-surface text-app-text-tertiary">
                                                <UserRound className="h-5 w-5" />
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-app-text">{record.student.name}</p>
                                            <p className="truncate text-xs text-app-text-secondary">{record.batch.name}</p>
                                            <p className="mt-1 text-xs text-app-text-tertiary">{formatTimestamp(record.checkedInAt)}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
                        <div className="flex items-start gap-3">
                            <ShieldAlert className="mt-0.5 h-5 w-5 flex-none" />
                            <p>The photo is only used as proof of entry for the parent to verify. No biometric matching is performed.</p>
                        </div>
                    </div>
                </aside>
            </div>
        </Layout>
    );
}
