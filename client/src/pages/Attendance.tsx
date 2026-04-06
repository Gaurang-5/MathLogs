import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, CheckCircle2, Clock3, Download, Search, UserCheck } from 'lucide-react';
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

export default function Attendance() {
    const [date, setDate] = useState(getTodayString());
    const [batchId, setBatchId] = useState('');
    const [batches, setBatches] = useState<BatchOption[]>([]);
    const [records, setRecords] = useState<AttendanceFeedRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [studentResults, setStudentResults] = useState<StudentSearchResult[]>([]);
    const [manualBusyId, setManualBusyId] = useState('');
    const [sweepStatus, setSweepStatus] = useState('');

    const feedUrl = useMemo(() => {
        const params = new URLSearchParams({ date });
        if (batchId) params.set('batchId', batchId);
        params.set('limit', '100');
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

    const handleManualPresent = async (studentId: string) => {
        try {
            setManualBusyId(studentId);
            await api.post('/attendance/manual', {
                studentId,
                attendanceDate: date,
                note: 'Manual override from attendance dashboard',
            });
            setSearch('');
            setStudentResults([]);
            await loadFeed();
        } catch (error) {
            console.error('Failed to mark student manually', error);
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

    const selectedBatch = batches.find((batch) => batch.id === batchId);

    return (
        <Layout title="Attendance">
            <div className="space-y-6">
                <section className="rounded-[28px] border border-app-border bg-app-surface-opaque p-5 shadow-sm">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <h1 className="text-2xl font-semibold tracking-tight text-app-text">Snap-Scan Admin View</h1>
                            <p className="mt-1 text-sm text-app-text-secondary">See today’s proof photos, run absence checks, and mark late arrivals manually.</p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link
                                to={batchId ? `/attendance/kiosk?batchId=${encodeURIComponent(batchId)}` : '/attendance/kiosk'}
                                className="inline-flex items-center gap-2 rounded-2xl bg-app-text px-4 py-3 text-sm font-semibold text-app-bg transition-opacity hover:opacity-90"
                            >
                                <Camera className="h-4 w-4" />
                                Open Kiosk
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
                            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-app-text-tertiary">Absence Sweep</span>
                            <p className="text-sm text-app-text-secondary">{sweepStatus || 'The background worker auto-checks 30 minutes after each batch start.'}</p>
                        </div>
                    </div>
                </section>

                <section className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
                    <div className="rounded-[28px] border border-app-border bg-app-surface-opaque p-5 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-app-bg">
                                <UserCheck className="h-5 w-5 text-app-text" />
                            </div>
                            <div>
                                <h2 className="text-base font-semibold text-app-text">Manual Override</h2>
                                <p className="text-sm text-app-text-secondary">Mark present for students who forgot their ID card.</p>
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
                                        <button
                                            type="button"
                                            onClick={() => handleManualPresent(student.id)}
                                            disabled={manualBusyId === student.id}
                                            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-app-text px-3 py-2 text-xs font-semibold text-app-bg transition-opacity hover:opacity-90 disabled:opacity-50"
                                        >
                                            <CheckCircle2 className="h-4 w-4" />
                                            {manualBusyId === student.id ? 'Saving...' : 'Mark Present'}
                                        </button>
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
                                <h2 className="text-base font-semibold text-app-text">Chronological Photo Feed</h2>
                                <p className="text-sm text-app-text-secondary">Most recent entries first, with the saved proof photo attached.</p>
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
                                        {record.photoUrl ? (
                                            <img src={record.photoUrl} alt={record.student.name} className="h-52 w-full object-cover" />
                                        ) : (
                                            <div className="flex h-52 items-center justify-center bg-app-surface text-app-text-tertiary">
                                                Manual entry, no photo captured
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
