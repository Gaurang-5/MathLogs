import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { extractAllPhotoMarks,photoGroups,uprightPoint,type PhotoCodes } from './multiSticker';
const upload=vi.hoisted(()=>vi.fn());vi.mock('./ocr',()=>({uploadStickerPhoto:upload}));
const photo:PhotoCodes={width:1600,height:3200,codes:Array.from({length:21},(_,i)=>({humanId:String(i),corners:[{x:100+(i%3)*400,y:100+Math.floor(i/3)*400},{x:160+(i%3)*400,y:100+Math.floor(i/3)*400},{x:160+(i%3)*400,y:160+Math.floor(i/3)*400},{x:100+(i%3)*400,y:160+Math.floor(i/3)*400}]}))};
beforeEach(()=>{
 vi.clearAllMocks();vi.stubGlobal('Image',class{src='';decode=async()=>{}});vi.stubGlobal('URL',{createObjectURL:vi.fn(()=>'blob:test'),revokeObjectURL:vi.fn()});
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn(),setTransform:vi.fn()} as any);vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(cb=>cb(new Blob(['crop'],{type:'image/jpeg'})));
 upload.mockImplementation(async(_image,_signal,_test,_progress,_mode,targets)=>({stickers:[...targets].reverse().map((p:any)=>({...p,score:'7.5'}))}));
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('reads every group, remaps crop positions, and restores original row order',async()=>{
 const progress=vi.fn(),result=await extractAllPhotoMarks(new Blob(['photo']),photo,'test',undefined,progress);
 expect(result.map(r=>r.code.humanId)).toEqual(photo.codes.map(c=>c.humanId));expect(result.every(r=>r.score==='7.5')).toBe(true);expect(upload).toHaveBeenCalledTimes(photoGroups(photo).length);expect(upload.mock.calls.every(c=>c[5].length<=10)).toBe(true);expect(progress).toHaveBeenLastCalledWith({stage:'reading',completed:21,total:21});expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it('retains successful groups when another group fails and never shifts neighboring marks',async()=>{
 upload.mockRejectedValueOnce(new Error('Reader unavailable'));const result=await extractAllPhotoMarks(new Blob(['photo']),photo,'test');const failedIds=new Set(photoGroups(photo)[0].codes.map(c=>c.humanId));
 for(const row of result)expect(row.score).toBe(failedIds.has(row.code.humanId)?'':'7.5');expect(result.filter(r=>r.error)).toHaveLength(failedIds.size);
});
it('cancels before any additional groups upload',async()=>{
 const controller=new AbortController();upload.mockImplementationOnce(async()=>{controller.abort();throw new DOMException('Cancelled','AbortError');});await expect(extractAllPhotoMarks(new Blob(['photo']),photo,'test',controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(upload).toHaveBeenCalledTimes(1);
});

it('normalizes all quarter turns without changing student associations',async()=>{
 const rotated:PhotoCodes={width:500,height:500,codes:[0,1,2,3].map(turn=>({humanId:String(turn),corners:[{x:100,y:100},{x:160,y:100},{x:160,y:160},{x:100,y:160}].map(p=>uprightPoint(p,500,500,turn))}))};
 const result=await extractAllPhotoMarks(new Blob(['photo']),rotated,'test');
 expect(result.map(r=>r.code.humanId)).toEqual(['0','1','2','3']);expect(result.every(r=>r.score==='7.5')).toBe(true);expect(upload).toHaveBeenCalledTimes(4);
 expect(uprightPoint({x:20,y:30},100,200,1)).toEqual({x:30,y:80});
 expect(uprightPoint({x:20,y:30},100,200,2)).toEqual({x:80,y:170});
 expect(uprightPoint({x:20,y:30},100,200,3)).toEqual({x:170,y:20});
});
