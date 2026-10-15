import { afterEach, expect, it, vi } from 'vitest';
import { extractPhotoMarks, matchStickerReadings, type PhotoCode } from './multiSticker';
const code=(humanId:string,x:number,y:number):PhotoCode=>({humanId,corners:[{x:x-20,y:y-20},{x:x+20,y:y-20},{x:x+20,y:y+20},{x:x-20,y:y+20}]});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();localStorage.clear();});
it('matches reordered readings geometrically, retaining zero and decimals',()=>{
 const codes=[code('A',100,100),code('B',300,100),code('C',100,300)];
 const result=matchStickerReadings({codes,width:1000,height:1000},[{x:100,y:300,score:'7.5'},{x:100,y:100,score:'0'},{x:300,y:100,score:'19'}]);
 expect(result.map(r=>r.score)).toEqual(['0','19','7.5']);
});
it('leaves missing, competing and faraway readings blank rather than shifting neighboring scores',()=>{
 const codes=[code('A',100,100),code('B',300,100),code('C',100,300)];
 expect(matchStickerReadings({codes,width:1000,height:1000},[{x:300,y:100,score:'19'}]).map(r=>r.score)).toEqual(['','19','']);
 expect(matchStickerReadings({codes:[codes[0]],width:1000,height:1000},[{x:99,y:100,score:'1'},{x:101,y:100,score:'2'}])[0].score).toBe('');
 expect(matchStickerReadings({codes:[codes[0]],width:1000,height:1000},[{x:200,y:100,score:'1'}])[0].score).toBe('');
});
it('blocks separate copies of the same student QR',()=>{
 const result=matchStickerReadings({codes:[code('A',100,100),code('A',300,100)],width:1000,height:1000},[{x:100,y:100,score:'12'},{x:300,y:100,score:'19'}]);
 expect(result.every(r=>r.score===''&&r.error?.includes('Duplicate'))).toBe(true);
});
it('converts normalized coordinates using both photo dimensions',()=>{
 expect(matchStickerReadings({codes:[code('A',200,100)],width:2000,height:1000},[{x:100,y:100,score:'4'}])[0].score).toBe('4');
});
it('uploads the original photo once with authorized test context and multiple mode',async()=>{
 localStorage.setItem('token','fixture');const photo=new Blob(['untouched'],{type:'image/jpeg'});
 const request=vi.fn().mockResolvedValue({ok:true,json:async()=>({stickers:[{x:100,y:100,score:'0'}]})});vi.stubGlobal('fetch',request);
 expect(await extractPhotoMarks(photo,'test')).toEqual([{x:100,y:100,score:'0'}]);
 const body=request.mock.calls[0][1].body as FormData;
 expect(body.get('testId')).toBe('test');expect(body.get('mode')).toBe('multiple');
 const reader=new FileReader();const content=new Promise(resolve=>{reader.onload=()=>resolve(reader.result);});reader.readAsText(body.get('image') as Blob);expect(await content).toBe('untouched');
 expect(request).toHaveBeenCalledTimes(1);
});
it('bounds stalled multi-photo recognition and aborts the underlying upload',async()=>{
 vi.useFakeTimers();localStorage.setItem('token','fixture');const request=vi.fn().mockReturnValue(new Promise(()=>{}));vi.stubGlobal('fetch',request);
 const pending=extractPhotoMarks(new Blob(['photo']),'test').catch(error=>error.message);
 await vi.advanceTimersByTimeAsync(20001);expect(await pending).toContain('timed out');expect(request.mock.calls[0][1].signal.aborted).toBe(true);
});
