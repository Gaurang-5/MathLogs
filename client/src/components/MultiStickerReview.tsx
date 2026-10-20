import { useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { TeacherButton, TeacherSurface } from './teacher-ui';
import { apiRequest } from '../utils/api';
import { extractAllPhotoMarks, readPhotoCodes, type PhotoCode, type PhotoCodes, type PhotoMatch } from '../utils/multiSticker';
import { markStickerResearchOutcome, startStickerResearchCapture, updateStickerResearchGeometry, type OCRProgress } from '../utils/ocr';
import { StickerScanProgress } from './StickerScanProgress';
import { StickerStudentPicker } from './StickerStudentPicker';

type Student = { id:string; name:string; humanId:string; marks?:{testId:string;score:number}[] };
type Row = {code:PhotoCode;score:string;ocrScore:string;student?:Student;previous:number|null;saved:boolean;blocked?:string;error?:string;conflict?:{currentScore:number|null}};
type LookupResult = {humanId:string;student?:Student;error?:string};
export const validPhotoScore=(score:string,max:number)=>/^\d+(?:\.\d{1,2})?$/.test(score)&&Number(score)<=max;
const lookupStudents=async(codes:PhotoCode[],testId:string,signal?:AbortSignal):Promise<Map<string,LookupResult>>=>{
    const ids=[...new Set(codes.map(code=>code.humanId))],results=new Map<string,LookupResult>();
    for(let i=0;i<ids.length;i+=10){
        if(signal?.aborted)break;
        const humanIds=ids.slice(i,i+10);
        try{
            const data=await apiRequest<{results:LookupResult[]}>('/students/lookup-many','POST',{humanIds,testId},{timeoutMs:25000});
            data.results.forEach(result=>results.set(result.humanId,result));
        }catch{humanIds.forEach(humanId=>results.set(humanId,{humanId,error:'Could not find this student. Retry student lookup.'}));}
    }
    return results;
};
const progressText=(p:OCRProgress)=>p.stage==='preparing'?'Preparing photo…':p.stage==='uploading'?'Uploading photo…':p.stage==='receiving'?'Sending photo to the reader…':`Reading marks…${p.total?` ${p.completed ?? 0}/${p.total}`:''}`;

export function MultiStickerReview({photo,imageUrl,testId,researchCaptureId,maxMarks,onClose}:{photo:Blob;imageUrl:string;testId:string;researchCaptureId?:string;maxMarks:number;onClose:()=>void}){
    const [rows,setRows]=useState<Row[]>([]),[geometry,setGeometry]=useState<PhotoCodes|null>(null);
    const [savingRows,setSavingRows]=useState<number[]>([]);
    const [reading,setReading]=useState(true),[saving,setSaving]=useState(false),[matching,setMatching]=useState(false);
    const [progress,setProgress]=useState<OCRProgress|null>(null),[message,setMessage]=useState('Reading student QRs…');
    const [ocrFailed,setOcrFailed]=useState(false),[qrError,setQrError]=useState('');
    const root=useRef<HTMLDivElement>(null),alive=useRef(true),lock=useRef(false),request=useRef<AbortController|null>(null);
    const reviewStartedAt=useRef(Date.now()),completed=useRef(false);
    const patch=(i:number,values:Partial<Row>)=>setRows(current=>current.map((row,index)=>i===index?{...row,...values}:row));
    const updateProgress=(p:OCRProgress)=>{if(alive.current){setProgress(p);setMessage(progressText(p));}};
    useEffect(()=>{
        alive.current=true;let disposed=false;const controller=new AbortController();request.current=controller;
        void(async()=>{
            // Research storage is best-effort: an outage must never stop a teacher saving marks.
            const researchUpload=researchCaptureId
                ? startStickerResearchCapture(photo,testId,researchCaptureId,controller.signal).catch(()=>undefined)
                : Promise.resolve(undefined);
            let codes:PhotoCodes;
            try{codes=await readPhotoCodes(photo,controller.signal);}catch(error){if(!disposed){setQrError(error instanceof Error?error.message:'QR not readable.');setReading(false);}return;}
            await researchUpload;
            if(disposed)return;setGeometry(codes);if(researchCaptureId)void updateStickerResearchGeometry(researchCaptureId,codes,controller.signal).catch(()=>undefined);
            const marks=extractAllPhotoMarks(photo,codes,testId,controller.signal,p=>{if(!disposed)updateProgress(p);},researchCaptureId)
                .catch((error:Error):PhotoMatch[]=>codes.codes.map(code=>({code,score:'',error:error.message})));
            const [students,matches]=await Promise.all([lookupStudents(codes.codes,testId,controller.signal),marks]);
            if(disposed)return;
            setRows(matches.map(match=>{
                const result=students.get(match.code.humanId),student=result?.student;
                const duplicate=codes.codes.filter(c=>c.humanId===match.code.humanId).length>1;
                const readScore=validPhotoScore(match.score,maxMarks)?match.score:'';
                return {code:match.code,score:readScore,ocrScore:readScore,student,previous:student?.marks?.find(m=>m.testId===testId)?.score??null,saved:false,
                    blocked:duplicate?'Duplicate student QR. Retake with one sticker per student.':student?undefined:result?.error||'Student not found.',error:match.error};
            }));
            setOcrFailed(matches.some(m=>!!m.error));setReading(false);setMessage('');
        })().catch(()=>{if(!disposed){setMessage('Could not read the photo. Retake it.');setReading(false);}});
        return()=>{disposed=true;alive.current=false;controller.abort();request.current?.abort();};
    },[photo,testId,maxMarks,researchCaptureId]);
    const retryMarks=async()=>{
        if(lock.current||reading||matching||!geometry)return;
        const controller=new AbortController();request.current=controller;setReading(true);updateProgress({stage:'preparing'});
        try{
            const matches=await extractAllPhotoMarks(photo,geometry,testId,controller.signal,updateProgress,researchCaptureId);
            if(!alive.current)return;
            setRows(current=>current.map((row,i)=>row.saved||row.score?row:{...row,score:validPhotoScore(matches[i].score,maxMarks)?matches[i].score:'',ocrScore:validPhotoScore(matches[i].score,maxMarks)?matches[i].score:'',error:matches[i].error}));
            setOcrFailed(matches.some(m=>!!m.error));setMessage('');
        }catch(error){if(alive.current)setMessage(error instanceof Error?error.message:'Could not read marks.');}
        finally{if(alive.current)setReading(false);}
    };
    const retryStudents=async()=>{
        if(lock.current||reading||matching)return;setMatching(true);
        const results=await lookupStudents(rows.filter(row=>!row.student).map(row=>row.code),testId);
        if(!alive.current)return;
        setRows(current=>current.map(row=>{
            if(row.student||current.filter(other=>other.code.humanId===row.code.humanId).length>1)return row;
            const result=results.get(row.code.humanId),student=result?.student;
            return {...row,student,previous:student?.marks?.find(m=>m.testId===testId)?.score??null,blocked:student?undefined:result?.error||row.blocked};
        }));setMatching(false);
    };
    const close=()=>{if(lock.current)return;if(rows.some(row=>!row.saved)&&!window.confirm('Discard these unsaved marks?'))return;if(researchCaptureId&&!completed.current)void markStickerResearchOutcome(researchCaptureId,'RETAKE').catch(()=>undefined);onClose();};
    const closeRef=useRef(close);closeRef.current=close;
    useEffect(()=>{
        const previous=document.activeElement as HTMLElement|null;root.current?.focus();
        const keyboard=(event:KeyboardEvent)=>{
            if(event.key==='Escape'){event.preventDefault();closeRef.current();}
            if(event.key!=='Tab')return;
            const controls=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')||[]),first=controls[0],last=controls[controls.length-1];
            if(event.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){event.preventDefault();last?.focus();}
            else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===root.current)){event.preventDefault();first?.focus();}
        };
        document.addEventListener('keydown',keyboard);return()=>{document.removeEventListener('keydown',keyboard);previous?.focus();};
    },[]);
    const pending=rows.filter(row=>!row.saved);
    const canConfirm=pending.length>0&&pending.every(row=>row.student&&!row.blocked&&!row.conflict&&validPhotoScore(row.score,maxMarks));
    const save=async()=>{
        if(lock.current||reading||matching||!canConfirm)return;
        lock.current=true;setSaving(true);let failed=false;
        const entries=rows.map((row,i)=>({row,i})).filter(({row})=>!row.saved);
        for(let start=0;start<entries.length&&alive.current;start+=20){
            const group=entries.slice(start,start+20);
            setSavingRows(group.map(({i})=>i));
            try{
                const response=await apiRequest<{results:{studentId:string;saved:boolean;error?:string;conflict?:boolean;currentScore?:number|null}[]}>('/marks/batch','POST',{
                    testId,marks:group.map(({row,i})=>{
                        const center=row.code.corners.length?{x:row.code.corners.reduce((sum,p)=>sum+p.x,0)/row.code.corners.length,y:row.code.corners.reduce((sum,p)=>sum+p.y,0)/row.code.corners.length}:null;
                        return {studentId:row.student!.id,score:row.score,expectedScore:row.previous,...(researchCaptureId?{researchCaptureId,researchStickerIndex:i,
                            researchOcrScore:row.ocrScore||undefined,researchQrHumanId:row.code.humanId,
                            researchQrX:center&&geometry?center.x/geometry.width*1000:undefined,researchQrY:center&&geometry?center.y/geometry.height*1000:undefined,
                            researchIdentitySource:row.code.corners.length?'qr':'manual_picker',researchReviewDurationMs:Math.max(0,Date.now()-reviewStartedAt.current)}:{})};
                    })
                });
                const results=new Map(response.results.map(result=>[result.studentId,result]));
                for(const {row,i} of group){
                    const result=results.get(row.student!.id);
                    if(!result?.saved)failed=true;
                    if(alive.current)patch(i,{saved:result?.saved===true,error:result?.saved?undefined:result?.error||'No save confirmation received. Confirm to retry.',
                        conflict:result?.conflict?{currentScore:result.currentScore??null}:undefined});
                }
            }catch(error){
                failed=true;
                if(alive.current)for(const {i} of group)patch(i,{error:error instanceof Error?error.message:'Could not save. Confirm to retry.'});
                // A server/network failure should not trigger a long chain of failing requests.
                break;
            }
        }
        lock.current=false;if(alive.current){setSavingRows([]);setSaving(false);if(!failed){completed.current=true;setMessage('');toast.success(`${rows.length} ${rows.length===1?'mark':'marks'} saved`);}else setMessage('Some marks were not confirmed saved. Your entries are kept. Retry only the remaining rows.');}
    };
    const busy=reading||matching||saving;
    const allSaved=rows.length>0&&rows.every(row=>row.saved);
    const percent=reading&&progress?.stage==='uploading'?progress.percent:undefined;
    return <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Review marks" className="fixed inset-0 z-[210] overflow-y-auto bg-app-bg p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-2xl pb-20">
            <div className="relative z-20 flex justify-end"><h2 className="sr-only">Review marks</h2><TeacherButton variant="secondary" aria-label="Retake photo" disabled={saving} onClick={close}><X aria-hidden="true" size={20}/></TeacherButton></div>
            {(reading||matching)&&<div className="fixed inset-0 z-10 flex items-center justify-center bg-app-bg px-8" aria-live="polite">
                <StickerScanProgress imageUrl={imageUrl} geometry={geometry} message={matching?'Finding students…':message} percent={percent} />
            </div>}
            {qrError?<StickerStudentPicker image={imageUrl} message={qrError} score="" onRetake={close} onSelect={async humanId=>{
                const student=await apiRequest<Student>(`/students/lookup/${encodeURIComponent(humanId)}?testId=${encodeURIComponent(testId)}`);
                if(alive.current){setRows([{code:{humanId,corners:[]},student,score:'',ocrScore:'',previous:student.marks?.find(m=>m.testId===testId)?.score??null,saved:false}]);setQrError('');setMessage('');}
            }}/>:<>
                {!busy&&message&&<p role="alert" className="mb-3 text-sm text-app-text-secondary">{message}</p>}
                <TeacherSurface className="divide-y divide-app-border overflow-hidden">
                    {rows.map((row,i)=><div key={`${row.code.humanId}-${i}`} className="px-4 py-4">
                        <div className="flex items-center gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <label htmlFor={`sticker-score-${i}`} className="min-w-0 break-words text-base font-bold text-app-text">{row.student?.name||row.code.humanId}</label>
                                    {row.saved&&<span role="status" aria-label={`Saved for ${row.student?.name||row.code.humanId}`} className="shrink-0 text-success"><Check aria-hidden="true" size={20} strokeWidth={2.5} className="sticker-saved-check"/></span>}
                                </div>
                                {!row.saved&&row.previous!==null&&<p className="mt-1 text-xs text-app-text-secondary">Previously saved: <strong>{row.previous}</strong>{validPhotoScore(row.score,maxMarks)&&Number(row.score)!==row.previous?' · Will be replaced':''}</p>}
                                {(savingRows.includes(i)||row.saved)&&<div role={row.saved?undefined:'progressbar'} aria-label={row.saved?undefined:`Saving marks for ${row.student?.name||row.code.humanId}`} className="mt-2 h-0.5 overflow-hidden rounded-full bg-app-border">
                                    <div className={`h-full rounded-full bg-success ${row.saved?'w-full':'w-1/3 sticker-reading-sweep'}`}/>
                                </div>}
                            </div>
                            <input id={`sticker-score-${i}`} aria-label={`Marks for ${row.student?.name||row.code.humanId}`} aria-invalid={!row.saved&&!!row.score&&!validPhotoScore(row.score,maxMarks)} inputMode="decimal" value={row.score} placeholder="—" disabled={busy||row.saved||!!row.blocked}
                                onChange={event=>patch(i,{score:event.target.value,error:undefined})} className="min-h-11 w-24 shrink-0 rounded-lg border border-app-border bg-app-bg px-2 text-center text-xl font-bold text-app-text focus-visible:outline-2 focus-visible:outline-offset-2"/>
                        </div>
                        {row.blocked&&<p role="alert" className="mt-2 text-sm text-danger">{row.blocked}</p>}
                        {!row.saved&&row.score&&!validPhotoScore(row.score,maxMarks)&&<p role="alert" className="mt-2 text-sm text-danger">Enter 0–{maxMarks}, with at most two decimal places.</p>}
                        {!row.saved&&row.error&&<p role="alert" className="mt-2 text-xs text-app-text-secondary">{row.error}</p>}
                        {row.conflict&&<div className="mt-2 text-sm text-app-text-secondary">
                            <p>Currently saved: <strong>{row.conflict.currentScore??'No mark'}</strong>. Your entry: <strong>{row.score}</strong>.</p>
                            <TeacherButton variant="secondary" className="mt-2" onClick={()=>patch(i,{previous:row.conflict!.currentScore,conflict:undefined,error:undefined})}>Review complete — use my entry</TeacherButton>
                        </div>}
                    </div>)}
                </TeacherSurface>
                {!busy&&ocrFailed&&pending.some(row=>!row.score)&&<TeacherButton variant="secondary" className="mt-3" onClick={()=>void retryMarks()}>Retry reading marks</TeacherButton>}
                {!busy&&rows.some(row=>!row.student)&&<TeacherButton variant="secondary" className="mt-3" onClick={()=>void retryStudents()}>Retry student lookup</TeacherButton>}
                <div className="fixed inset-x-0 bottom-0 border-t border-app-border bg-app-surface-opaque p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"><TeacherButton className="mx-auto w-full max-w-2xl" disabled={busy||(!allSaved&&!canConfirm)} onClick={()=>allSaved?onClose():void save()}>{allSaved?'Done':saving?'Saving…':'Confirm'}</TeacherButton></div>
            </>}
        </div>
    </div>;
}
