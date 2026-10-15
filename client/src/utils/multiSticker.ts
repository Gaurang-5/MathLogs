import { uploadStickerPhoto, type OCRProgress } from './ocr';
import { squareToQuad, project } from './stickerGeometry';
import { scanDeadline } from './scanDeadline';

export type Point = { x: number; y: number };
export type PhotoCode = { humanId: string; corners: Point[] };
export type PhotoReading = { x: number; y: number; score: string };
export type PhotoCodes = { codes: PhotoCode[]; width: number; height: number };
const center = (code: PhotoCode): Point => ({ x: code.corners.reduce((v,p)=>v+p.x,0)/4, y: code.corners.reduce((v,p)=>v+p.y,0)/4 });
const distance = (a: Point, b: Point) => Math.hypot(a.x-b.x,a.y-b.y);

/** Spatial matching, never response order or an AI-generated student ID. Ambiguity stays blank. */
export function matchStickerReadings(photo: PhotoCodes, readings: PhotoReading[]): { code: PhotoCode; score: string; error?: string }[] {
    const centers = photo.codes.map(center);
    const candidates = readings.map(row => ({ row, point: { x: row.x*photo.width/1000, y: row.y*photo.height/1000 } }));
    return photo.codes.map((code, index) => {
        if (photo.codes.filter(other=>other.humanId===code.humanId).length>1) return { code, score:'', error:'Duplicate student QR in this photo. Retake with one sticker per student.' };
        const size = Math.min(...code.corners.map((p,i)=>distance(p,code.corners[(i+1)%4])));
        const nearestOther = Math.min(...centers.filter((_,i)=>i!==index).map(p=>distance(p,centers[index])));
        const radius = Math.min(size*.65,nearestOther*.3);
        const nearby = candidates.filter(({point})=>distance(point,centers[index])<=radius);
        if(nearby.length!==1) return { code,score:'',error:'Could not safely match handwriting to this QR. Enter the mark from the photo.' };
        const candidate=nearby[0];
        if(centers.some((p,i)=>i!==index && distance(p,candidate.point)<=radius*2)) return { code,score:'',error:'Stickers are too close for a reliable match. Enter the mark manually.' };
        const score = /^\d+(?:\.\d+)?$/.test(candidate.row.score) ? candidate.row.score : '';
        return {code,score,...(!score?{error:'Handwriting needs review. Enter the mark from the photo.'}:{})};
    });
}

/** Decode all visible QR positions; scaling/tiling is confined to local QR analysis. */
export async function decodePhotoCodes(source: HTMLCanvasElement | HTMLImageElement, signal?: AbortSignal): Promise<PhotoCodes> {
    const width=source instanceof HTMLImageElement?source.naturalWidth:source.width;
    const height=source instanceof HTMLImageElement?source.naturalHeight:source.height;
    if(!width||!height) throw new Error('The photo could not be opened.');
    const worker=new Worker(new URL('./stickerQR.worker.ts',import.meta.url),{type:'module'});
    const canvas=document.createElement('canvas');const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx){worker.terminate();throw new Error('The photo could not be opened.');}
    const codes:PhotoCode[]=[];
    const decode=async()=>{
        const tile=1600;
        const offsets=(length:number)=>{const values=[0];for(let n=1200;n+tile<length;n+=1200)values.push(n);if(length>tile)values.push(length-tile);return [...new Set(values)];};
        const regions=[{x:0,y:0,w:width,h:height,max:2400},...offsets(width).flatMap(x=>offsets(height).map(y=>({x,y,w:Math.min(tile,width),h:Math.min(tile,height),max:tile})))];
        for(const region of regions){
            if(signal?.aborted) throw new DOMException('Cancelled','AbortError');
            const scale=Math.min(1,region.max/Math.max(region.w,region.h));
            canvas.width=Math.round(region.w*scale);canvas.height=Math.round(region.h*scale);
            ctx.drawImage(source,region.x,region.y,region.w,region.h,0,0,canvas.width,canvas.height);
            const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
            const found=await new Promise<PhotoCode[]>((resolve,reject)=>{
                worker.onmessage=e=>e.data.error?reject(new Error(e.data.error)):resolve(e.data.codes||[]);
                worker.onerror=()=>reject(new Error('QR reader failed. Retry the photo.'));
                worker.postMessage({pixels:pixels.data,width:pixels.width,height:pixels.height,multiple:true},[pixels.data.buffer]);
            });
            for(const item of found){
                const code={humanId:item.humanId,corners:item.corners.map(p=>({x:region.x+p.x/scale,y:region.y+p.y/scale}))};
                // Same QR seen in overlapping tiles is one observation; separate printed copies stay duplicates.
                if(!codes.some(other=>other.humanId===code.humanId && distance(center(other),center(code))<Math.max(8,distance(code.corners[0],code.corners[2])*.3))) codes.push(code);
            }
        }
        if(!codes.length)throw new Error('No QR codes were readable. Move closer or photograph fewer stickers.');
        return {codes:codes.sort((a,b)=>center(a).y-center(b).y||center(a).x-center(b).x),width,height};
    };
    try{return await scanDeadline(decode(),30000,'Reading all QRs timed out. Use fewer stickers or move closer.',signal);}
    finally{worker.terminate();canvas.width=canvas.height=0;}
}

export async function readPhotoCodes(image: Blob, signal?: AbortSignal): Promise<PhotoCodes> {
    const url=URL.createObjectURL(image);
    try{const source=new Image();source.src=url;await scanDeadline(source.decode(),5000,'Photo could not be opened.',signal);return await decodePhotoCodes(source,signal);}
    finally{URL.revokeObjectURL(url);}
}

export async function extractPhotoMarks(image: Blob,testId: string,signal?: AbortSignal,
    onProgress?: (progress: OCRProgress) => void, targets?: Point[]):Promise<PhotoReading[]> {
    const data = await uploadStickerPhoto<{stickers?: PhotoReading[]}>(image,signal,testId,onProgress,'multiple',targets);
    if(!Array.isArray(data.stickers)||data.stickers.length>10)throw new Error('Invalid marks response. Retake the photo.');
    return data.stickers.filter(row=>Number.isFinite(row.x)&&Number.isFinite(row.y)&&row.x>=0&&row.x<=1000&&row.y>=0&&row.y<=1000&&typeof row.score==='string');
}

export type PhotoMatch = ReturnType<typeof matchStickerReadings>[number];
export type PhotoGroup = { codes:PhotoCode[]; x:number; y:number; width:number; height:number; turn:number };
export function stickerQuarterTurn(code:PhotoCode):number {
    const [a,b]=code.corners;
    return (Math.round(Math.atan2(b.y-a.y,b.x-a.x)/(Math.PI/2))+4)%4;
}
export function uprightPoint(p:Point,width:number,height:number,turn:number):Point {
    if(turn===1)return {x:p.y,y:width-p.x};
    if(turn===2)return {x:width-p.x,y:height-p.y};
    if(turn===3)return {x:height-p.y,y:p.x};
    return p;
}
/** Split by spatial location, retaining generous margins around QR and writing areas. */
export function photoGroups(photo:PhotoCodes):PhotoGroup[] {
    const groups:PhotoGroup[]=[];
    const split=(codes:PhotoCode[])=>{
        if(codes.length>10){
            const points=codes.map(center),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
            const axis=Math.max(...xs)-Math.min(...xs)>Math.max(...ys)-Math.min(...ys)?'x':'y';
            const sorted=[...codes].sort((a,b)=>center(a)[axis]-center(b)[axis]);
            const mid=Math.ceil(sorted.length/2);split(sorted.slice(0,mid));split(sorted.slice(mid));return;
        }
        // The writing box is beside the QR in its own orientation. Use that
        // plane to retain the whole sticker without pulling in adjacent rows.
        const points=codes.flatMap(c=>{
            const h=squareToQuad(c.corners);
            if(!h)return c.corners;
            return [...c.corners,...[[-.4,-.9],[3.5,-.9],[3.5,1.5],[-.4,1.5]].map(([x,y])=>project(h,x,y)).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))];
        });
        const x=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x))));
        const y=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))));
        groups.push({codes,x,y,turn:stickerQuarterTurn(codes[0]),width:Math.min(photo.width,Math.ceil(Math.max(...points.map(p=>p.x))))-x,
            height:Math.min(photo.height,Math.ceil(Math.max(...points.map(p=>p.y))))-y});
    };
    for(let turn=0;turn<4;turn++){const codes=photo.codes.filter(c=>stickerQuarterTurn(c)===turn);if(codes.length)split(codes);}
    return groups;
}
export async function extractAllPhotoMarks(image:Blob,photo:PhotoCodes,testId:string,signal?:AbortSignal,
    onProgress?:(progress:OCRProgress)=>void):Promise<PhotoMatch[]> {
    if(photo.codes.length<=10 && photo.codes.every(c=>stickerQuarterTurn(c)===0)) return matchStickerReadings(photo,await extractPhotoMarks(image,testId,signal,onProgress));
    const url=URL.createObjectURL(image),source=new Image();
    try {
        source.src=url;await scanDeadline(source.decode(),8000,'Could not open photo for reading.',signal);
        const results=new Map<PhotoCode,PhotoMatch>();const groups=photoGroups(photo);let completed=0;
        for(const group of groups){
            if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
            const canvas=document.createElement('canvas');canvas.width=group.turn%2?group.height:group.width;canvas.height=group.turn%2?group.width:group.height;
            const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Could not prepare the photo.');
            if(group.turn===1)ctx.setTransform(0,-1,1,0,0,group.width);
            else if(group.turn===2)ctx.setTransform(-1,0,0,-1,group.width,group.height);
            else if(group.turn===3)ctx.setTransform(0,1,-1,0,group.height,0);
            ctx.drawImage(source,group.x,group.y,group.width,group.height,0,0,group.width,group.height);
            const localCodes=group.codes.map(c=>({...c,corners:c.corners.map(p=>uprightPoint({x:p.x-group.x,y:p.y-group.y},group.width,group.height,group.turn))}));
            try {
                const blob=await scanDeadline(new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not prepare photo.')),'image/jpeg',.9)),8000,'Photo preparation timed out.',signal);
                const targets=localCodes.map(c=>({x:center(c).x/canvas.width*1000,y:center(c).y/canvas.height*1000}));
                const readings=await extractPhotoMarks(blob,testId,signal,p=>onProgress?.({...p,completed,total:photo.codes.length}),targets);
                const matches=matchStickerReadings({codes:localCodes,width:canvas.width,height:canvas.height},readings);
                matches.forEach((match,i)=>results.set(group.codes[i],{...match,code:group.codes[i]}));
            } catch(error) {
                if(signal?.aborted)throw error;
                group.codes.forEach(code=>results.set(code,{code,score:'',error:error instanceof Error?error.message:'Could not read marks.'}));
            } finally {canvas.width=canvas.height=0;}
            completed+=group.codes.length;onProgress?.({stage:'reading',completed,total:photo.codes.length});
        }
        // Duplicate IDs across separate groups must still be rejected.
        return photo.codes.map(code=>photo.codes.filter(c=>c.humanId===code.humanId).length>1
            ?{code,score:'',error:'Duplicate student QR. Retake with one sticker per student.'}:results.get(code)!);
    } finally {source.src='';URL.revokeObjectURL(url);}
}
