import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import { TeacherButton, TeacherPage, TeacherSurface } from '../components/teacher-ui';
import { apiRequest } from '../utils/api';
import { captureSticker } from '../utils/cv';
import { extractMarksFromSticker } from '../utils/ocr';
import { readScanDrafts, writeScanDrafts, scanDraftOwner } from '../utils/scanDrafts';

type Test = { id: string; name: string; maxMarks: number };
type Student = { id: string; name: string; marks: { testId: string; score: number }[] };
type Draft = { humanId: string; image: string; name?: string; studentId?: string; score: string; previous?: number; overwrite: boolean; state: 'reading'|'review'|'saved'|'error'; error?: string };
const validScore = (score: string, max: number) => /^\d+(\.\d{1,2})?$/.test(score) && Number(score)<=max;

export default function BulkScanMarks() {
    const [tests,setTests]=useState<Test[]>([]);
    const [testId,setTestId]=useState('');
    const [drafts,setDrafts]=useState<Draft[]>([]);
    const [running,setRunning]=useState(false);
    const [saving,setSaving]=useState(false);
    const [ready,setReady]=useState(false);
    const [message,setMessage]=useState('');
    const video=useRef<HTMLVideoElement>(null);
    const stream=useRef<MediaStream|null>(null);
    const alive=useRef(true);
    const active=useRef(false);
    const busy=useRef(0);
    const generation=useRef(0);
    const cameraGeneration=useRef(0);
    const rows=useRef<Draft[]>([]);
    const persist=useRef<Promise<void>>(Promise.resolve());
    const selected=tests.find(t=>t.id===testId);
    const storageKey=`${scanDraftOwner()}:${testId}`;
    const update=(fn:(current:Draft[])=>Draft[])=>{const next=fn(rows.current);rows.current=next;setDrafts(next);};
    const patch=(id:string,values:Partial<Draft>)=>update(current=>current.map(row=>row.humanId===id?{...row,...values}:row));
    const stop=()=>{cameraGeneration.current++;active.current=false;stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;setRunning(false);};
    useEffect(()=>{
        alive.current=true;
        apiRequest<Test[]>('/tests').then(setTests).catch(()=>setMessage('Could not load tests. Refresh to try again.'));
        return ()=>{alive.current=false;active.current=false;generation.current++;stream.current?.getTracks().forEach(track=>track.stop());};
    },[]);
    useEffect(()=>{
        let cancelled=false; generation.current++;setReady(false);rows.current=[];setDrafts([]);
        if(!testId) return;
        readScanDrafts<Draft[]>(storageKey).then(saved=>{
            if(cancelled) return;
            const restored=(saved||[]).map(row=>row.state==='reading'?{...row,state:'error' as const,error:'Reading interrupted. Retry recognition.'}:row);
            rows.current=restored;setDrafts(restored);setReady(true);
        }).catch(()=>{if(!cancelled){setMessage('Local draft storage unavailable. Keep this page open until marks are saved.');setReady(true);}});
        return ()=>{cancelled=true;};
    },[storageKey,testId]);
    useEffect(()=>{
        if(!ready || !testId) return;
        persist.current=persist.current.catch(()=>{}).then(()=>writeScanDrafts(storageKey,drafts)).catch(()=>{if(alive.current)setMessage('Could not preserve drafts on this device. Keep this page open until marks are saved.');});
    },[drafts,storageKey,ready,testId]);
    useEffect(()=>{
        const warn=(event:BeforeUnloadEvent)=>{if(rows.current.some(row=>row.state!=='saved')){event.preventDefault();event.returnValue='';}};
        window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
    },[]);
    const recognize=async(row:Draft)=>{
        if(!selected || !video.current) return;
        const version=generation.current;busy.current++;patch(row.humanId,{state:'reading',error:undefined});
        try {
            const [student,ocr]=await Promise.all([
                apiRequest<Student>(`/students/lookup/${encodeURIComponent(row.humanId)}?testId=${testId}`),
                fetch(row.image).then(response => response.blob()).then(image => extractMarksFromSticker(image, undefined, testId))
            ]);
            if(!alive.current || version!==generation.current) return;
            patch(row.humanId,{name:student.name,studentId:student.id,score:ocr.score,previous:student.marks.find(mark=>mark.testId===testId)?.score,state:'review',error:ocr.score?'':'Uncertain handwriting—check the crop and correct the score.'});
        } catch(error) {
            if(alive.current && version===generation.current) patch(row.humanId,{state:'error',error:error instanceof Error?error.message:'Could not identify this student. Retry.'});
        } finally {busy.current--;}
    };
    const start=async()=>{
        if(!selected || !ready || active.current) return;
        const cameraSession=++cameraGeneration.current;
        active.current=true;setRunning(true);
        setMessage('');
        try {
            const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1920},height:{ideal:1080}},audio:false});
            if(!alive.current || cameraSession!==cameraGeneration.current){media.getTracks().forEach(track=>track.stop());return;}
            stream.current=media;video.current!.srcObject=media;await video.current!.play();active.current=true;setRunning(true);
            let candidate='';let count=0;
            const capture=()=>{
                if(!active.current || !video.current || cameraSession!==cameraGeneration.current) return;
                if(busy.current<2 && rows.current.length<200){
                    const shot=captureSticker(video.current);
                    if(shot && !rows.current.some(row=>row.humanId===shot.humanId)) {
                        count=candidate===shot.humanId?count+1:1;candidate=shot.humanId;
                        if(count>=2){
                            const row:Draft={humanId:shot.humanId,image:shot.image,score:'',overwrite:false,state:'reading'};
                            // Update the duplicate guard before the asynchronous render.
                            rows.current=[...rows.current,row];setDrafts(rows.current);
                            void recognize(row);candidate='';count=0;
                        }
                    }else{candidate='';count=0;}
                }
                if(active.current)setTimeout(capture,350);
            };
            capture();
        }catch{stop();setMessage('Camera could not start. Allow camera access and try again.');}
    };
    const save=async()=>{
        if(!selected || saving)return;
        if(busy.current) return;
        stop();setSaving(true);
        let saved=0;
        for(const row of rows.current.filter(row=>row.state==='review' && row.studentId && validScore(row.score,selected.maxMarks) && (row.previous===undefined || row.overwrite))){
            try{
                await apiRequest('/marks','POST',{testId,studentId:row.studentId,score:row.score,expectedScore:row.previous??null});
                patch(row.humanId,{state:'saved',error:undefined});saved++;
            }catch(error){patch(row.humanId,{error:error instanceof Error?error.message:'Save failed. Review and retry.'});}
        }
        setSaving(false);setMessage(`${saved} results saved. Unsaved or uncertain rows stay in this list.`);
    };
    const countReady=selected?drafts.filter(row=>row.state==='review' && row.studentId && validScore(row.score,selected.maxMarks) && (row.previous===undefined||row.overwrite)).length:0;
    return <Layout><TeacherPage title="Scan a stack of papers" description="Keep handwritten totals. Hold each sticker fully in view, wait for it to appear below, then move to the next paper. Review the crops before saving." actions={<Link className="min-h-11 inline-flex items-center underline" to="/scan">Single-paper mode</Link>}>
        <TeacherSurface className="p-4 space-y-4">
            <label className="block text-sm">Test<select aria-label="Test" value={testId} disabled={running||saving||drafts.some(row=>row.state==='reading')} onChange={event=>setTestId(event.target.value)} className="block min-h-11 w-full bg-app-bg border border-app-border rounded-xl px-3 mt-1"><option value="">Choose a test</option>{tests.map(test=><option key={test.id} value={test.id}>{test.name} · {test.maxMarks} marks</option>)}</select></label>
            <video ref={video} muted playsInline className="w-full max-h-80 rounded-xl bg-black object-contain" aria-label="Live sticker camera" />
            <div className="flex flex-wrap gap-3"><TeacherButton disabled={!selected||!ready||saving} onClick={running?stop:start}>{running?'Pause camera':'Start camera'}</TeacherButton><TeacherButton variant="secondary" disabled={!countReady||saving||drafts.some(row=>row.state==='reading')} loading={saving} onClick={save}>Save {countReady} reviewed results</TeacherButton><TeacherButton variant="quiet" disabled={saving||!drafts.some(row=>row.state==='saved')} onClick={()=>update(current=>current.filter(row=>row.state!=='saved'))}>Clear saved results</TeacherButton></div>
            <p className="text-sm text-app-text-secondary" aria-live="polite">{drafts.length} captured · {drafts.filter(row=>row.state==='reading').length} reading · {drafts.filter(row=>row.state==='saved').length} saved. {drafts.length>=200?'Save this stack and clear saved rows before continuing.':''}</p>
            <p className="text-sm text-app-text-secondary">Recognition only suggests marks. Compare each crop and correct mistakes before selecting Save. Drafts remain on this device until you remove them.</p>
            {message&&<p role="status" className="text-sm">{message}</p>}
        </TeacherSurface>
        <div className="space-y-3">{drafts.map(row=><TeacherSurface key={row.humanId} className="p-4 flex flex-col sm:flex-row gap-4 items-start">
            <img src={row.image} alt={`Captured sticker for ${row.name||row.humanId}`} className="w-full sm:w-64 rounded-lg border border-app-border" />
            <div className="flex-1 min-w-0 space-y-2"><p className="font-semibold">{row.name||row.humanId}</p><p className="text-sm text-app-text-secondary">{row.humanId} · {row.state==='saved'?'Saved':row.state==='reading'?'Reading…':'Review required'}</p>
                <label className="block text-sm">Marks out of {selected?.maxMarks}<input aria-label={`Marks for ${row.name||row.humanId}`} value={row.score} disabled={saving||row.state==='reading'||row.state==='saved'} onChange={event=>patch(row.humanId,{score:event.target.value,error:undefined})} inputMode="decimal" className="block min-h-11 w-32 rounded-xl border border-app-border bg-app-bg px-3" /></label>
                {row.previous!==undefined&&row.state!=='saved'&&<label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={row.overwrite} disabled={saving} onChange={event=>patch(row.humanId,{overwrite:event.target.checked})}/>Replace existing score {row.previous}</label>}
                {row.error&&<p role="alert" className="text-sm text-danger">{row.error}</p>}
                <div className="flex gap-2">{row.state!=='reading'&&row.state!=='saved'&&<TeacherButton variant="quiet" disabled={saving||busy.current>=2} onClick={()=>void recognize(row)}>Retry reading</TeacherButton>}<TeacherButton variant="quiet" disabled={saving||row.state==='reading'} onClick={()=>update(current=>current.filter(item=>item.humanId!==row.humanId))}>{row.state==='saved'?'Clear saved row':'Discard draft'}</TeacherButton></div>
            </div>
        </TeacherSurface>)}</div>
    </TeacherPage></Layout>;
}
