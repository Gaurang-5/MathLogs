import { afterEach, expect, it, vi } from 'vitest';
import { matchStickerReadings, type PhotoCode } from './multiSticker';
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

it('spatially groups more than ten QRs without dropping any and retains writing-area margins',async()=>{
 const {photoGroups}=await import('./multiSticker');const codes=Array.from({length:31},(_,i)=>code(String(i),150+(i%4)*400,150+Math.floor(i/4)*400));
 const groups=photoGroups({codes,width:2000,height:4000});expect(groups.every(g=>g.codes.length<=10)).toBe(true);expect(groups.flatMap(g=>g.codes).length).toBe(31);expect(new Set(groups.flatMap(g=>g.codes.map(c=>c.humanId))).size).toBe(31);
 for(const g of groups){expect(g.x).toBeGreaterThanOrEqual(0);expect(g.y).toBeGreaterThanOrEqual(0);expect(g.x+g.width).toBeLessThanOrEqual(2000);expect(g.y+g.height).toBeLessThanOrEqual(4000);for(const c of g.codes)for(const p of c.corners){expect(p.x).toBeGreaterThanOrEqual(g.x);expect(p.x).toBeLessThanOrEqual(g.x+g.width);expect(p.y).toBeGreaterThanOrEqual(g.y);expect(p.y).toBeLessThanOrEqual(g.y+g.height);}}
});
