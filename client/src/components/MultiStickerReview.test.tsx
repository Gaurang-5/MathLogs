import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { MultiStickerReview } from './MultiStickerReview';
const mocks=vi.hoisted(()=>({codes:vi.fn(),marks:vi.fn(),api:vi.fn()}));
vi.mock('../utils/api',()=>({apiRequest:mocks.api}));
vi.mock('../utils/multiSticker',async original=>({...await original<object>(),readPhotoCodes:mocks.codes,extractPhotoMarks:mocks.marks}));
let container:HTMLDivElement,root:Root;const close=vi.fn();
const click=async(label:string)=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label)!;expect(button).toBeTruthy();await act(async()=>button.click());};
const check=async(index:number)=>{await act(async()=>document.querySelector<HTMLInputElement>(`[aria-label="Confirm sticker ${index}"]`)!.click());};
const render=async()=>act(async()=>root.render(<MultiStickerReview photo={new Blob(['photo'])} imageUrl="blob:fixture" testId="test" maxMarks={20} onClose={close}/>));
beforeEach(()=>{
 vi.clearAllMocks();
 container=document.createElement('div');document.body.append(container);root=createRoot(container);
 mocks.codes.mockResolvedValue({width:1000,height:1000,codes:['A','B'].map((humanId,i)=>({humanId,corners:[{x:80+i*200,y:80},{x:120+i*200,y:80},{x:120+i*200,y:120},{x:80+i*200,y:120}]}))});
 mocks.marks.mockResolvedValue([{x:300,y:100,score:'12'},{x:100,y:100,score:'0'}]);
 mocks.api.mockResolvedValue({results:[{humanId:'B',student:{id:'b',name:'Bela',humanId:'B',marks:[]}},{humanId:'A',student:{id:'a',name:'Aarav',humanId:'A',marks:[]}}]});
});
afterEach(()=>{act(()=>root.unmount());container.remove();vi.restoreAllMocks();});
it('requires per-row confirmation, preserves zero, and never resaves successful rows after a partial failure',async()=>{
 await render();expect(document.querySelector<HTMLInputElement>('[aria-label="Marks for sticker 1"]')!.value).toBe('0');
 expect([...document.querySelectorAll('button')].find(b=>b.textContent==='Save 0 confirmed results')!.disabled).toBe(true);
 await check(1);await check(2);
 let fail=true;
 mocks.api.mockImplementation(async(path:string,_:string,body:any)=>{if(path==='/marks'&&body.studentId==='b'&&fail)throw new Error('Network failed');return {};});
 await click('Save 2 confirmed results');expect(document.body.textContent).toContain('Aarav · Saved');expect(document.body.textContent).toContain('Network failed');
 fail=false;await click('Save 1 confirmed results');
 const saves=mocks.api.mock.calls.filter(([path])=>path==='/marks');expect(saves.map(([, ,body])=>body.studentId)).toEqual(['a','b','b']);
 expect(saves[0][2]).toEqual({testId:'test',studentId:'a',score:'0',expectedScore:null});
});
it('requires explicit overwrite and retains the old value in the optimistic concurrency check',async()=>{
 mocks.api.mockResolvedValue({results:[{humanId:'A',student:{id:'a',name:'Aarav',humanId:'A',marks:[{testId:'test',score:7}]}}]});await render();await check(1);
 expect([...document.querySelectorAll('button')].find(b=>b.textContent==='Save 0 confirmed results')!.disabled).toBe(true);
 const overwrite=[...document.querySelectorAll('label')].find(l=>l.textContent?.includes('Replace existing score'))!.querySelector('input')!;
 await act(async()=>overwrite.click());await click('Save 1 confirmed results');
 expect(mocks.api).toHaveBeenCalledWith('/marks','POST',{testId:'test',studentId:'a',score:'0',expectedScore:7});
});
it('starts QR and marks concurrently and aborts recognition on dismissal',async()=>{
 mocks.codes.mockReturnValue(new Promise(()=>{}));mocks.marks.mockReturnValue(new Promise(()=>{}));await render();
 expect(mocks.codes).toHaveBeenCalledTimes(1);expect(mocks.marks).toHaveBeenCalledTimes(1);
 const signal=mocks.marks.mock.calls[0][2];await click('Cancel');expect(close).toHaveBeenCalled();
 act(()=>root.unmount());root=createRoot(container);expect(signal.aborted).toBe(true);
});
it('retains decoded identities and manual entry when OCR is unavailable',async()=>{
 mocks.marks.mockRejectedValue(new Error('Reader unavailable'));await render();
 expect(document.body.textContent).toContain('Aarav');expect(document.body.textContent).toContain('Reader unavailable');
 expect(document.querySelector<HTMLInputElement>('[aria-label="Marks for sticker 1"]')!.value).toBe('');
});

it('uses one batch request and recovers identities without losing OCR or rereading the photo',async()=>{
 mocks.api.mockRejectedValueOnce(new Error('Request timeout'));
 await render();expect(mocks.api).toHaveBeenCalledWith('/students/lookup-many','POST',{humanIds:['A','B'],testId:'test'},{timeoutMs:25000});
 expect(document.body.textContent).toContain('your marks are kept');
 await click('Retry student lookup');
 expect(document.querySelector<HTMLInputElement>('[aria-label="Marks for sticker 1"]')!.value).toBe('0');
 expect(document.body.textContent).toContain('Aarav');expect(mocks.marks).toHaveBeenCalledTimes(1);expect(mocks.codes).toHaveBeenCalledTimes(1);
 expect(mocks.api).toHaveBeenCalledTimes(2);
});
