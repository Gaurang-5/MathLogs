import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Camera } from 'lucide-react';
import Layout from '../components/Layout';
import Dropdown from '../components/Dropdown';
import { TeacherButton, TeacherSurface } from '../components/teacher-ui';
import { MultiStickerReview } from '../components/MultiStickerReview';
import { apiRequest } from '../utils/api';

type ScanTest = { id: string; name?: string; subject?: string; maxMarks?: number };
export default function ScanMarks() {
    const [searchParams] = useSearchParams();
    const [tests, setTests] = useState<ScanTest[]>([]);
    const [selectedTestId, setSelectedTestId] = useState(searchParams.get('testId') || '');
    const [photo, setPhoto] = useState<{ file: File; url: string; researchCaptureId: string } | null>(null);
    const [error, setError] = useState('');
    const photoInput = useRef<HTMLInputElement>(null), previewUrl = useRef<string | null>(null);
    useEffect(() => {
        let active = true;
        void apiRequest<ScanTest[]>('/tests').then(value => { if (active) setTests(value); })
            .catch(() => { if (active) setError('Could not load tests. Reload to try again.'); });
        return () => { active = false; if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); };
    }, []);
    const clearPhoto = () => {
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = null; setPhoto(null);
    };
    return <Layout title="Scan Marks" hideMobileNav={!!photo}>
        <TeacherSurface className="mx-auto mt-10 max-w-md space-y-5 p-6">
            <h2 className="text-xl font-semibold text-app-text">Scan marks</h2>
            <Dropdown label="Select test" value={selectedTestId} onChange={setSelectedTestId} placeholder="Choose test" searchable
                options={tests.map(test => ({ value: test.id, label: `${test.name || 'Test'}${test.subject ? ` · ${test.subject}` : ''}` }))} />
            <p className="text-sm text-app-text-secondary">Take a photo of one sticker or several together. Keep every QR and handwritten mark clearly visible.</p>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <TeacherButton className="w-full" disabled={!tests.some(test => test.id === selectedTestId)}
                onClick={() => { setError(''); photoInput.current?.click(); }}><Camera size={20} aria-hidden="true" />Take photo</TeacherButton>
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={event => {
                const file = event.target.files?.[0]; event.target.value = '';
                if (!file) return;
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPEG, PNG, or WebP photo.'); return; }
                clearPhoto(); setError('');
                const url = URL.createObjectURL(file); previewUrl.current = url; setPhoto({ file, url, researchCaptureId: crypto.randomUUID() });
            }} />
        </TeacherSurface>
        {photo && createPortal(<MultiStickerReview photo={photo.file} imageUrl={photo.url} testId={selectedTestId}
            researchCaptureId={photo.researchCaptureId} maxMarks={tests.find(test => test.id === selectedTestId)?.maxMarks ?? 100} onClose={clearPhoto} />, document.body)}
    </Layout>;
}
