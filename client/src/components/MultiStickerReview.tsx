import { useEffect, useRef, useState } from 'react';
import { TeacherButton, TeacherSurface } from './teacher-ui';
import { apiRequest } from '../utils/api';
import { extractPhotoMarks, matchStickerReadings, readPhotoCodes, type PhotoCode, type PhotoCodes } from '../utils/multiSticker';

type Student = { id: string; name: string; humanId: string; marks?: { testId:string; score:number }[] };
type Row = { code:PhotoCode; score:string; student?:Student; previous:number|null; confirmed:boolean; overwrite:boolean; saved:boolean; blocked?:string; error?:string };
export const validPhotoScore=(score:string,max:number)=>/^\d+(?:\.\d{1,2})?$/.test(score)&&Number(score)<=max;

export function MultiStickerReview({ photo, imageUrl, testId, maxMarks, onClose }: {
    photo:Blob; imageUrl:string; testId:string; maxMarks:number; onClose:()=>void;
}) {
    const [rows,setRows]=useState<Row[]>([]);
    const [geometry,setGeometry]=useState<PhotoCodes|null>(null);
    const [reading,setReading]=useState(true);
    const [saving,setSaving]=useState(false);
    const [message,setMessage]=useState('Reading student QRs and marks…');
    const [selected,setSelected]=useState(0);
    const [elapsed,setElapsed]=useState(0);
    const root=useRef<HTMLDivElement>(null);
    const alive=useRef(true);
    const saveLock=useRef(false);
    const patch=(index:number,values:Partial<Row>)=>setRows(current=>current.map((row,i)=>i===index?{...row,...values}:row));
    useEffect(()=>{
        alive.current=true;
        let disposed=false;
        const request=new AbortController();
        const timer=setInterval(()=>setElapsed(value=>value+1),1000);
        const ocr=extractPhotoMarks(photo,testId,request.signal).then(readings=>({readings,error:''}),error=>({readings:[],error:error.message as string}));
        const identities=readPhotoCodes(photo,request.signal).then(async codes=>{
            if(!disposed){setGeometry(codes);setMessage(`${codes.codes.length} QR codes found. Matching students and marks…`);}
            const students=await Promise.all(codes.codes.map(async code=>{
                try {return {student:await apiRequest<Student>(`/students/lookup/${encodeURIComponent(code.humanId)}?testId=${encodeURIComponent(testId)}`,'GET',undefined,{timeoutMs:12000})};}
                catch(error){return {error:error instanceof Error?error.message:'Student lookup failed.'};}
            }));
            return {codes,students};
        });
        void Promise.all([identities,ocr]).then(([{codes,students},marks])=>{
            if(disposed)return;
            const matched=matchStickerReadings(codes,marks.readings);
            setRows(matched.map((match,i)=>{
                const student=students[i].student;
                const duplicate=codes.codes.filter(code=>code.humanId===match.code.humanId).length>1;
                return {code:match.code,score:validPhotoScore(match.score,maxMarks)?match.score:'',student,
                    previous:student?.marks?.find(mark=>mark.testId===testId)?.score??null,
                    confirmed:false,overwrite:false,saved:false,
                    blocked:duplicate?'Duplicate student QR. Retake with one sticker per student.':students[i].error,
                    error:marks.error||match.error,
                };
            }));
            setMessage(`${codes.codes.length} QR codes found. Check the numbered photo and confirm every result you want to save. Unreadable QRs are not included.`);
        }).catch(error=>{
            request.abort();
            if(!disposed)setMessage(error.message||'The photo could not be read. Retake with fewer stickers.');
        }).finally(()=>{clearInterval(timer);if(!disposed)setReading(false);});
        return()=>{disposed=true;alive.current=false;request.abort();clearInterval(timer);};
    },[photo,testId,maxMarks]);
    const close=()=>{
        if(saveLock.current)return;
        if(rows.some(row=>!row.saved)&&!window.confirm('Discard the unsaved results from this photo?'))return;
        onClose();
    };
    const closeRef=useRef(close);closeRef.current=close;
    useEffect(()=>{
        const previous=document.activeElement as HTMLElement|null;root.current?.focus();
        const keyboard=(event:KeyboardEvent)=>{
            if(event.key==='Escape'){event.preventDefault();closeRef.current();}
            if(event.key!=='Tab')return;
            const controls=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')||[]);
            const first=controls[0],last=controls[controls.length-1];
            if(event.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){event.preventDefault();last?.focus();}
            else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===root.current)){event.preventDefault();first?.focus();}
        };
        document.addEventListener('keydown',keyboard);
        return()=>{document.removeEventListener('keydown',keyboard);previous?.focus();};
    },[]);
    const canSave=(row:Row)=>!row.saved&&!row.blocked&&!!row.student&&row.confirmed&&validPhotoScore(row.score,maxMarks)&&(row.previous===null||row.overwrite);
    const count=rows.filter(canSave).length;
    const save=async()=>{
        if(saveLock.current||reading||!count)return;
        saveLock.current=true;setSaving(true);let saved=0;
        for(const [i,row] of rows.entries()){
            if(!canSave(row)||!alive.current)continue;
            try{
                await apiRequest('/marks','POST',{testId,studentId:row.student!.id,score:row.score,expectedScore:row.previous});
                if(alive.current)patch(i,{saved:true,error:undefined});saved++;
            }catch(error){if(alive.current)patch(i,{error:error instanceof Error?error.message:'Save failed. Retry this row.'});}
        }
        saveLock.current=false;
        if(alive.current){setSaving(false);setMessage(`${saved} results saved. Failed and unconfirmed results remain for review.`);}
    };
    return <div ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Review multiple stickers" className="fixed inset-0 z-[210] overflow-y-auto bg-app-bg p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-5xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold text-app-text">Review multiple stickers</h2><TeacherButton variant="secondary" disabled={saving} onClick={close}>{reading?'Cancel':'Back to camera'}</TeacherButton></div>
            <p role="status" className="text-sm text-app-text-secondary">{message}{reading?` ${elapsed}s`:''}</p>
            <div className="grid items-start gap-4 md:grid-cols-2">
                <TeacherSurface className="p-2 md:sticky md:top-2">
                    <div className="relative">
                        <img src={imageUrl} alt="Original photo of all captured stickers" className="block h-auto w-full rounded-lg" />
                        {geometry&&<svg aria-hidden="true" viewBox={`0 0 ${geometry.width} ${geometry.height}`} className="pointer-events-none absolute inset-0 h-full w-full">
                            {geometry.codes.map((code,i)=>{
                                const x=code.corners.reduce((v,p)=>v+p.x,0)/4,y=code.corners.reduce((v,p)=>v+p.y,0)/4;
                                const r=Math.max(geometry.width,geometry.height)*.015;
                                return <g key={i}><polygon points={code.corners.map(p=>`${p.x},${p.y}`).join(' ')} fill="none" stroke={i===selected?'#ffffff':'#111111'} strokeWidth={r*.18}/><circle cx={x} cy={y} r={r} fill="#111111" stroke="white" strokeWidth={r*.12}/><text x={x} y={y} dy=".35em" textAnchor="middle" fill="white" fontSize={r*1.3} fontWeight="bold">{i+1}</text></g>;
                            })}
                        </svg>}
                    </div>
                    <p className="px-2 pt-2 text-xs text-app-text-secondary">Numbers identify decoded QRs. Compare each student and mark with the original photo. Keep this page open until saving finishes.</p>
                </TeacherSurface>
                <div className="space-y-3">{rows.map((row,i)=><TeacherSurface key={i} className="p-4 space-y-3">
                    <button type="button" onClick={()=>setSelected(i)} className="min-h-11 w-full text-left font-semibold text-app-text">{i+1}. {row.student?.name||row.code.humanId}{row.saved?' · Saved':''}</button>
                    <p className="text-xs text-app-text-secondary">{row.code.humanId}</p>
                    {row.blocked?<p role="alert" className="text-sm text-danger">{row.blocked}</p>:<>
                        <label className="block text-sm text-app-text">Marks out of {maxMarks}<input aria-label={`Marks for sticker ${i+1}`} inputMode="decimal" value={row.score} disabled={saving||row.saved} onFocus={()=>setSelected(i)} onChange={e=>patch(i,{score:e.target.value,confirmed:false,error:undefined})} className="mt-1 block min-h-11 w-32 rounded-xl border border-app-border bg-app-bg px-3" /></label>
                        {row.score&&!validPhotoScore(row.score,maxMarks)&&<p role="alert" className="text-sm text-danger">Enter 0–{maxMarks}, with at most two decimal places.</p>}
                        {row.previous!==null&&!row.saved&&<label className="flex min-h-11 gap-3 items-center text-sm"><input type="checkbox" checked={row.overwrite} disabled={saving} onChange={e=>patch(i,{overwrite:e.target.checked})}/>Replace existing score {row.previous}</label>}
                        {!row.saved&&<label className="flex min-h-11 gap-3 items-center text-sm"><input aria-label={`Confirm sticker ${i+1}`} type="checkbox" checked={row.confirmed} disabled={saving||!validPhotoScore(row.score,maxMarks)} onChange={e=>patch(i,{confirmed:e.target.checked})}/>I checked this student and mark</label>}
                    </>}
                    {row.error&&!row.saved&&<p role="alert" className="text-sm text-app-text-secondary">{row.error}</p>}
                </TeacherSurface>)}</div>
            </div>
            {!reading&&<div className="sticky bottom-0 rounded-xl border border-app-border bg-app-surface-opaque p-3"><TeacherButton className="w-full" disabled={!count||saving} loading={saving} onClick={()=>void save()}>Save {count} confirmed results</TeacherButton></div>}
        </div>
    </div>;
}
