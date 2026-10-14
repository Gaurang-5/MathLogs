import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../utils/api';
import { TeacherButton } from './teacher-ui/TeacherButton';

interface StudentOption { id: string; name: string; humanId: string; batch?: { name?: string } }

export function StickerStudentPicker({ image, message, score, onSelect, onRetake }: {
    image: string | null; message: string; score: string;
    onSelect: (humanId: string) => Promise<void>; onRetake: () => void;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<StudentOption[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [searched, setSearched] = useState(false);
    const mounted = useRef(true);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    const search = async (event: React.FormEvent) => {
        event.preventDefault();
        if (busy || query.trim().length < 2) return;
        setBusy(true); setError(''); setSearched(false); setResults([]);
        try {
            const students = await apiRequest<StudentOption[]>('/students/search?q=' + encodeURIComponent(query.trim()), 'GET', undefined, { timeoutMs: 15000 });
            if (mounted.current) { setResults(students); setSearched(true); }
        } catch { if (mounted.current) setError('Student search failed. Please try again.'); }
        finally { if (mounted.current) setBusy(false); }
    };
    const select = async (humanId: string) => {
        if (busy) return;
        setBusy(true); setError('');
        try { await onSelect(humanId); }
        catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Student lookup failed.'); }
        finally { if (mounted.current) setBusy(false); }
    };
    return <div className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-3xl bg-app-surface-opaque p-6 text-app-text">
        <h2 className="text-xl font-semibold">Select the student</h2>
        <p role="status" className="mt-2 text-sm text-app-text-secondary">{message}</p>
        {image && <img src={image} alt="Photo kept for marks review" className="my-4 max-h-40 w-full object-contain rounded-xl" />}
        <p className="my-3 text-sm">{score ? `Marks read: ${score}. Confirm after selecting the student.` : 'You can enter marks after selecting the student.'}</p>
        <form onSubmit={search} className="flex flex-col gap-3">
            <label htmlFor="sticker-student-search" className="text-sm font-medium">Student name or ID</label>
            <input id="sticker-student-search" value={query} onChange={event => setQuery(event.target.value)} minLength={2} required
                className="min-h-11 w-full rounded-xl border border-app-border bg-app-bg px-3 text-base" autoComplete="off" />
            <TeacherButton type="submit" loading={busy} disabled={busy || query.trim().length < 2}>Search students</TeacherButton>
        </form>
        {error && <p role="alert" className="mt-3 text-sm">{error}</p>}
        {searched && results.length === 0 && <p className="mt-3 text-sm">No students found. Try the name or ID printed on the sticker.</p>}
        <div className="my-4 flex flex-col gap-2">
            {results.map(student => <TeacherButton key={student.id} variant="secondary" disabled={busy} onClick={() => void select(student.humanId)} className="h-auto whitespace-normal text-left">
                {student.name} · {student.humanId}{student.batch?.name ? ` · ${student.batch.name}` : ''}
            </TeacherButton>)}
        </div>
        <TeacherButton variant="secondary" onClick={onRetake} className="w-full">Retake photo</TeacherButton>
    </div>;
}
