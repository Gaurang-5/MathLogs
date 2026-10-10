import jsQR from 'jsqr';
import { squareToQuad, project } from './stickerGeometry';

export interface StickerCapture { image: string; humanId: string; sharpness: number }
// Use the decoded QR's own corners instead of unrelated page contours. The
// known label layout is shared with server stickerController: 39x21mm, 34pt QR.
export function captureSticker(video: HTMLVideoElement, expectedId?: string): StickerCapture | null {
    const canvas=document.createElement('canvas');
    const scale=Math.min(1,1600/video.videoWidth);
    canvas.width=Math.round(video.videoWidth*scale); canvas.height=Math.round(video.videoHeight*scale);
    if (!canvas.width || !canvas.height) return null;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}); if(!ctx) return null;
    ctx.drawImage(video,0,0,canvas.width,canvas.height);
    const frame=ctx.getImageData(0,0,canvas.width,canvas.height);
    const code=jsQR(frame.data,frame.width,frame.height,{inversionAttempts:'dontInvert'});
    if(!code || (expectedId && code.data!==expectedId)) return null;
    const p=code.location;
    const corners=[p.topLeftCorner,p.topRightCorner,p.bottomRightCorner,p.bottomLeftCorner];
    const minSide=Math.min(...corners.map((a,i)=>Math.hypot(a.x-corners[(i+1)%4].x,a.y-corners[(i+1)%4].y)));
    if(minSide<60) return null; // Recapture instead of inventing unreadable pixels.
    const h=squareToQuad(corners); if(!h) return null;
    const mm=2.83465, labelW=39*mm,labelH=21*mm, qrX=2*mm+2, qrY=(labelH-34)/2;
    const output=document.createElement('canvas'); output.width=780; output.height=420;
    const out=output.getContext('2d'); if(!out) return null;
    const target=out.createImageData(output.width,output.height);
    // All label corners must be on screen; avoid sending white/partial crops to OCR.
    for(const [x,y] of [[0,0],[labelW,0],[labelW,labelH],[0,labelH]]) {
        const q=project(h,(x-qrX)/34,(y-qrY)/34);
        if(!Number.isFinite(q.x)||!Number.isFinite(q.y)||q.x<0||q.y<0||q.x>=frame.width-1||q.y>=frame.height-1) return null;
    }
    let sharpness=0, samples=0;
    for(let y=0;y<output.height;y++) for(let x=0;x<output.width;x++) {
        const q=project(h,(x/output.width*labelW-qrX)/34,(y/output.height*labelH-qrY)/34);
        const sx=Math.floor(q.x),sy=Math.floor(q.y), fx=q.x-sx,fy=q.y-sy, dest=(y*output.width+x)*4;
        for(let c=0;c<3;c++) {
            const i=(sy*frame.width+sx)*4+c;
            target.data[dest+c]=frame.data[i]*(1-fx)*(1-fy)+frame.data[i+4]*fx*(1-fy)+frame.data[i+frame.width*4]*(1-fx)*fy+frame.data[i+frame.width*4+4]*fx*fy;
        }
        target.data[dest+3]=255;
        if(x>output.width*.44 && y>output.height*.35 && x%4===0 && y%4===0) { sharpness+=Math.abs(target.data[dest]-target.data[dest-4]); samples++; }
    }
    out.putImageData(target,0,0);
    return {image:output.toDataURL('image/png'), humanId:code.data,sharpness:sharpness/Math.max(1,samples)};
}
export async function loadOpenCV(): Promise<void> { /* QR geometry needs no remote runtime. */ }
export async function detectAndWarpSticker(video: HTMLVideoElement, _canvas?: HTMLCanvasElement, expectedId?: string): Promise<string | null> {
    return captureSticker(video,expectedId)?.image ?? null;
}
