import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, CheckCircle2, Clock3, Copy, Download, Search, UserCheck } from 'lucide-react';
import Layout from '../components/Layout';
import { api, API_URL } from '../utils/api';

interface BatchOption {
    id: string;
    name: string;
    timeSlot?: string | null;
}

interface AttendanceFeedRecord {
    id: string;
    checkedInAt: string;
    photoUrl: string | null;
    photoUrlExpiresAt: string | null;
    source: 'KIOSK' | 'MANUAL';
    note: string | null;
    manualMarkedBy: string | null;
    student: {
        id: string;
        name: string;
        humanId: string | null;
        parentWhatsapp: string;
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

interface StudentSearchResult {
    id: string;
    name: string;
    humanId: string | null;
    batch: {
        id: string;
        name: string;
    } | null;
}

function formatDateTime(value: string) {
    return new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function getTodayString() {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
}

function resolveAttendancePhotoUrl(photoUrl: string | null): string | null {
    if (!photoUrl) return null;

    const apiIsAbsolute = /^https?:\/\//i.test(API_URL);

    try {
        const parsed = /^https?:\/\//i.test(photoUrl)
            ? new URL(photoUrl)
            : new URL(photoUrl, window.location.origin);
        const isAttendancePhotoPath = parsed.pathname.includes('/api/public/attendance-photo/');

        if (isAttendancePhotoPath) {
            if (!apiIsAbsolute) {
                return `${parsed.pathname}${parsed.search}`;
            }

            const apiBase = new URL(API_URL);
            return `${apiBase.origin}${parsed.pathname}${parsed.search}`;
        }

        if (/^https?:\/\//i.test(photoUrl)) return photoUrl;
        if (apiIsAbsolute && photoUrl.startsWith('/')) {
            const apiBase = new URL(API_URL);
            return `${apiBase.origin}${photoUrl}`;
        }
        return photoUrl;
    } catch {
        if (apiIsAbsolute && photoUrl.startsWith('/')) {
            try {
                const apiBase = new URL(API_URL);
                return `${apiBase.origin}${photoUrl}`;
            } catch {
                return photoUrl;
            }
        }
        return photoUrl;
    }
}

export default function Attendance() {
    const [searchParams] = useSearchParams();
    const [date, setDate] = useState(getTodayString());
    const [batchId, setBatchId] = useState(() => searchParams.get('batchId') || '');
    const [batches, setBatches] = useState<BatchOption[]>([]);
    const [records, setRecords] = useState<AttendanceFeedRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [studentResults, setStudentResults] = useState<StudentSearchResult[]>([]);
    const [manualBusyId, setManualBusyId] = useState('');
    const [sweepStatus, setSweepStatus] = useState('');
    const [copied, setCopied] = useState('');
    const [brokenImageIds, setBrokenImageIds] = useState<Set<string>>(new Set());

    const selectedBatch = useMemo(() => batches.find((batch) => batch.id === batchId) || null, [batchId, batches]);

    const feedUrl = useMemo(() => {
        const params = new URLSearchParams({ date, limit: '100' });
        if (batchId) params.set('batchId', batchId);
        return `/attendance/feed?${params.toString()}`;
    }, [batchId, date]);

    const loadFeed = async () => {
        setLoading(true);
        try {
            const response = await api.get<AttendanceFeedResponse>(feedUrl);
            setRecords(response.records);
        } catch (error) {
            console.error('Failed to load attendance feed', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        api.get<BatchOption[]>('/batches')
            .then(setBatches)
            .catch((error) => console.error('Failed to load batches', error));
    }, []);

    useEffect(() => {
        loadFeed();
    }, [feedUrl]);

    useEffect(() => {
        if (!search.trim()) {
            setStudentResults([]);
            return;
        }

        const timer = window.setTimeout(async () => {
            try {
                const params = new URLSearchParams({ q: search.trim() });
                if (batchId) params.set('batchId', batchId);
                const response = await api.get<{ students: StudentSearchResult[] }>(`/attendance/students?${params.toString()}`);
                setStudentResults(response.students);
            } catch (error) {
                console.error('Failed to search students', error);
            }
        }, 220);

        return () => window.clearTimeout(timer);
    }, [search, batchId]);

    const markManual = async (studentId: string, status: 'PRESENT' | 'ABSENT') => {
        try {
            setManualBusyId(`${studentId}-${status}`);
            await api.post('/attendance/manual', {
                studentId,
                attendanceDate: date,
                status,
                note: status === 'ABSENT' ? 'Marked absent manually' : 'Marked present manually',
            });
            setSearch('');
            setStudentResults([]);
            await loadFeed();
        } catch (error) {
            console.error('Failed manual attendance update', error);
        } finally {
            setManualBusyId('');
        }
    };

    const handleRunSweep = async () => {
        setSweepStatus('Running 30-minute absence check...');
        try {
            const response = await api.post<{ processedBatches: number; absentAlertsQueued: number }>('/attendance/absence-sweep', {});
            setSweepStatus(`Processed ${response.processedBatches} batch(es), queued ${response.absentAlertsQueued} absent alert(s).`);
        } catch (error) {
            console.error('Failed to run sweep', error);
            setSweepStatus('Failed to run absence check.');
        }
    };

    const cameraUrl = batchId ? `/attendance/camera?batchId=${encodeURIComponent(batchId)}` : '/attendance/camera';
    const studentViewUrl = selectedBatch
        ? `${window.location.origin}/attendance/public/${selectedBatch.id}`
        : '';

    return (
        <Layout title="Attendance">
            <div className="space-y-6">
                <section className="rounded-[28px] border border-app-border bg-app-surface-opaque p-5 shadow-sm">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight text-app-text">Attendance Control</h1>
                            <p className="mt-1 text-sm text-app-text-secondary">Launch the dedicated camera preview page, manage absentees, and monitor live logs.</p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link
                                to={cameraUrl}
                                className="inline-flex items-center gap-2 rounded-2xl bg-app-text px-4 py-3 text-sm font-semibold text-app-bg transition-opacity hover:opacity-90"
                            >
                                <Camera className="h-4 w-4" />
                                Open Camera Preview
                            </Link>
                            <button
                                type="button"
                                onClick={handleRunSweep}
                                className="inline-flex items-center gap-2 rounded-2xl border border-app-border bg-app-bg px-4 py-3 text-sm font-semibold text-app-text transition-colors hover:border-app-text-secondary"
                            >
                                <Clock3 className="h-4 w-4" />
                                Run Absence Check
                            </button>
                        </div>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                        <label className="rounded-2xl border border-app-border bg-app-bg px-4 py-3">
                            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-app-text-tertiary">Attendance Date</span>
                            <input
                                type="date"
                                value={date}
                                onChange={(event) => setDate(event.target.value)}
                                className="w-full bg-transparent text-sm font-medium text-app-text outline-none"
                            />
                        </label>

                        <label className="rounded-2xl border border-app-border bg-app-bg px-4 py-3">
                            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-app-text-tertiary">Batch Filter</span>
                            <select
                                value={batchId}
                                onChange={(event) => setBatchId(event.target.value)}
                                className="w-full bg-transparent text-sm font-medium text-app-text outline-none"
                            >
                                <option value="">All batches</option>
                                {batches.map((batch) => (
                                    <option key={batch.id} value={batch.id}>{batch.name}</option>
                                ))}
                            </select>
                        </label>

                        <div className="rounded-2xl border border-app-border bg-app-bg px-4 py-3">
                            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-app-text-tertiary">Student View Link</span>
                            {selectedBatch ? (
                                <button
                                    type="button"
                                    onClick={async () => {
                                        await navigator.clipboard.writeText(studentViewUrl);
                                        setCopied('Student view link copied');
                                        window.setTimeout(() => setCopied(''), 1500);
                                    }}
                                    className="inline-flex items-center gap-2 text-sm font-semibold text-app-text hover:text-app-text-secondary"
                                >
                                    <Copy className="h-4 w-4" />
                                    Copy logged-in list link
                                </button>
                            ) : (
                                <p className="text-sm text-app-text-secondary">Select a batch to generate a student link.</p>
                            )}
                        </div>
                    </div>
                    <p className="mt-3 text-sm text-app-text-secondary">{copied || sweepStatus || 'Camera page captures after QR + 3 sec countdown and sends 12-hour photo links to parents.'}</p>
                </section>

                <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
                    <div className="rounded-[28px] border border-app-border bg-app-surface-opaque p-5 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-app-bg">
                                <UserCheck className="h-5 w-5 text-app-text" />
                            </div>
                            <div>
                                <h2 className="text-base font-semibold text-app-text">Manual Present / Absent</h2>
                                <p className="text-sm text-app-text-secondary">If card scan fails, mark attendance directly.</p>
                            </div>
                        </div>

                        <div className="relative mt-4">
                            <Search className="pointer-events-none absolute left-4 top-3.5 h-4 w-4 text-app-text-tertiary" />
                            <input
                                type="text"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Search by name or student ID"
                                className="w-full rounded-2xl border border-app-border bg-app-bg py-3 pl-11 pr-4 text-sm text-app-text outline-none transition-colors focus:border-app-text-secondary"
                            />
                        </div>

                        <div className="mt-4 space-y-3">
                            {studentResults.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-app-border bg-app-bg px-4 py-8 text-center text-sm text-app-text-secondary">
                                    Start typing to find a student.
                                </div>
                            ) : (
                                studentResults.map((student) => (
                                    <div key={student.id} className="rounded-2xl border border-app-border bg-app-bg p-4">
                                        <p className="text-sm font-semibold text-app-text">{student.name}</p>
                                        <p className="mt-1 text-xs text-app-text-secondary">{student.batch?.name || 'No batch'} {student.humanId ? `• ${student.humanId}` : ''}</p>
                                        <div className="mt-3 flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => markManual(student.id, 'PRESENT')}
                                                disabled={manualBusyId === `${student.id}-PRESENT` || manualBusyId === `${student.id}-ABSENT`}
                                                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                            >
                                                <CheckCircle2 className="h-4 w-4" />
                                                {manualBusyId === `${student.id}-PRESENT` ? 'Saving...' : 'Mark Present'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => markManual(student.id, 'ABSENT')}
                                                disabled={manualBusyId === `${student.id}-PRESENT` || manualBusyId === `${student.id}-ABSENT`}
                                                className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-50"
                                            >
                                                Mark Absent
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {selectedBatch && (
                            <a
                                href={`${API_URL}/batches/${selectedBatch.id}/id-cards`}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-app-border bg-app-bg px-4 py-3 text-sm font-semibold text-app-text transition-colors hover:border-app-text-secondary"
                            >
                                <Download className="h-4 w-4" />
                                Export {selectedBatch.name} ID Cards
                            </a>
                        )}
                    </div>

                    <div className="rounded-[28px] border border-app-border bg-app-surface-opaque p-5 shadow-sm">
                        <div className="mb-5 flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-base font-semibold text-app-text">Attendance Feed</h2>
                                <p className="text-sm text-app-text-secondary">Chronological log of who entered and who was marked manually.</p>
                            </div>
                            <div className="rounded-full bg-app-bg px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-app-text-tertiary">
                                {records.length} record{records.length === 1 ? '' : 's'}
                            </div>
                        </div>

                        {loading ? (
                            <div className="grid gap-4 md:grid-cols-2">
                                {Array.from({ length: 4 }).map((_, index) => (
                                    <div key={index} className="h-64 animate-pulse rounded-[24px] bg-app-bg" />
                                ))}
                            </div>
                        ) : records.length === 0 ? (
                            <div className="rounded-[24px] border border-dashed border-app-border bg-app-bg px-6 py-16 text-center text-sm text-app-text-secondary">
                                No attendance records for this selection yet.
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                                {records.map((record) => (
                                    <article key={record.id} className="overflow-hidden rounded-[24px] border border-app-border bg-app-bg">
                                        {record.photoUrl && !brokenImageIds.has(record.id) ? (
                                            <img
                                                src={resolveAttendancePhotoUrl(record.photoUrl) || undefined}
                                                alt={record.student.name}
                                                className="h-52 w-full object-cover"
                                                onError={() => setBrokenImageIds((prev) => {
                                                    const next = new Set(prev);
                                                    next.add(record.id);
                                                    return next;
                                                })}
                                            />
                                        ) : (
                                            <div className="flex h-52 items-center justify-center bg-app-surface text-app-text-tertiary">
                                                {record.photoUrl ? 'Photo unavailable or expired' : 'No photo for this entry'}
                                            </div>
                                        )}
                                        <div className="space-y-2 p-4">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <h3 className="text-base font-semibold text-app-text">{record.student.name}</h3>
                                                    <p className="text-sm text-app-text-secondary">{record.batch.name}</p>
                                                </div>
                                                <span className="rounded-full bg-app-surface px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-app-text-tertiary">
                                                    {record.source}
                                                </span>
                                            </div>
                                            <p className="text-sm text-app-text">{formatDateTime(record.checkedInAt)}</p>
                                            <p className="text-xs text-app-text-tertiary">
                                                {record.student.humanId || 'No student ID'}
                                                {record.manualMarkedBy ? ` • Marked by ${record.manualMarkedBy}` : ''}
                                            </p>
                                            {record.photoUrlExpiresAt && (
                                                <p className="text-xs text-app-text-secondary">Photo link expires at {formatDateTime(record.photoUrlExpiresAt)}</p>
                                            )}
                                            {record.note && <p className="text-sm text-app-text-secondary">{record.note}</p>}
                                        </div>
                                    </article>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </Layout>
    );
}
