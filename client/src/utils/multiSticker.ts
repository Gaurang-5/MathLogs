import { uploadStickerPhoto, type OCRProgress } from './ocr';
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
            if(codes.length>10)throw new Error('More than 10 stickers are visible. Take a smaller group.');
        }
        if(!codes.length)throw new Error('No QR codes were readable. Move closer or photograph fewer stickers.');
        return {codes:codes.sort((a,b)=>center(a).y-center(b).y||center(a).x-center(b).x),width,height};
    };
    try{return await scanDeadline(decode(),10000,'Reading all QRs timed out. Use fewer stickers or move closer.',signal);}
    finally{worker.terminate();canvas.width=canvas.height=0;}
}

export async function readPhotoCodes(image: Blob, signal?: AbortSignal): Promise<PhotoCodes> {
    const url=URL.createObjectURL(image);
    try{const source=new Image();source.src=url;await scanDeadline(source.decode(),5000,'Photo could not be opened.',signal);return await decodePhotoCodes(source,signal);}
    finally{URL.revokeObjectURL(url);}
}

export async function extractPhotoMarks(image: Blob,testId: string,signal?: AbortSignal,
    onProgress?: (progress: OCRProgress) => void):Promise<PhotoReading[]> {
    const data = await uploadStickerPhoto<{stickers?: PhotoReading[]}>(image,signal,testId,onProgress,'multiple');
    if(!Array.isArray(data.stickers)||data.stickers.length>10)throw new Error('Invalid marks response. Retake the photo.');
    return data.stickers.filter(row=>Number.isFinite(row.x)&&Number.isFinite(row.y)&&row.x>=0&&row.x<=1000&&row.y>=0&&row.y<=1000&&typeof row.score==='string');
}
