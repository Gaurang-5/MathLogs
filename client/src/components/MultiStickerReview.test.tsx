import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { MultiStickerReview } from './MultiStickerReview';
const mocks=vi.hoisted(()=>({codes:vi.fn(),marks:vi.fn(),api:vi.fn()}));
vi.mock('../utils/api',()=>({apiRequest:mocks.api}));
vi.mock('../utils/multiSticker',()=>({readPhotoCodes:mocks.codes,extractAllPhotoMarks:mocks.marks}));
let container:HTMLDivElement,root:Root;const close=vi.fn();
const click=async(label:string)=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label)!;expect(button).toBeTruthy();await act(async()=>button.click());};
const render=async()=>act(async()=>root.render(<MultiStickerReview photo={new Blob(['photo'])} imageUrl="blob:fixture" testId="test" maxMarks={20} onClose={close}/>));
beforeEach(()=>{
 vi.clearAllMocks();container=document.createElement('div');document.body.append(container);root=createRoot(container);
 mocks.codes.mockResolvedValue({width:1000,height:1000,codes:['A','B'].map(humanId=>({humanId,corners:[]}))});
 mocks.marks.mockImplementation(async(_image,codes)=>codes.codes.map((code:any,i:number)=>({code,score:i===0?'0':'12'})));
 mocks.api.mockResolvedValue({results:[{humanId:'B',student:{id:'b',name:'Bela',humanId:'B',marks:[]}},{humanId:'A',student:{id:'a',name:'Aarav',humanId:'A',marks:[]}}]});
});
afterEach(()=>{act(()=>root.unmount());container.remove();vi.restoreAllMocks();});
it('uses one confirmation, preserves zero, and retries only failed saves',async()=>{
 await render();expect(document.querySelector<HTMLInputElement>('#sticker-score-0')!.value).toBe('0');expect(document.querySelector('img')).toBeNull();expect(document.querySelector('input[type=checkbox]')).toBeNull();expect(mocks.api.mock.calls.filter(([path])=>path==='/marks')).toHaveLength(0);
 let fail=true;mocks.api.mockImplementation(async(path:string,_method:string,body:any)=>{if(path==='/marks'&&body.studentId==='b'&&fail)throw new Error('Network failed');return {};});
 await click('Confirm');expect(document.body.textContent).toContain('Network failed');expect(close).not.toHaveBeenCalled();fail=false;await click('Confirm');expect(close).toHaveBeenCalledTimes(1);
 const saves=mocks.api.mock.calls.filter(([path])=>path==='/marks');expect(saves.map(([, ,body])=>body.studentId)).toEqual(['a','b','b']);expect(saves[0][2]).toEqual({testId:'test',studentId:'a',score:'0',expectedScore:null});
});
it('retains optimistic concurrency protection when confirming existing marks',async()=>{
 mocks.api.mockResolvedValue({results:[{humanId:'A',student:{id:'a',name:'Aarav',humanId:'A',marks:[{testId:'test',score:7}]}},{humanId:'B',student:{id:'b',name:'Bela',humanId:'B',marks:[]}}]});await render();await click('Confirm');expect(mocks.api).toHaveBeenCalledWith('/marks','POST',{testId:'test',studentId:'a',score:'0',expectedScore:7});
});
it('aborts pending recognition on dismissal and shows accessible upload progress',async()=>{
 mocks.marks.mockImplementation((_image,_codes,_test,_signal,progress)=>{progress({stage:'uploading',percent:42});return new Promise(()=>{});});await render();expect(document.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow')).toBe('42');const signal=mocks.marks.mock.calls[0][3];await act(async()=>document.querySelector<HTMLButtonElement>('[aria-label="Retake photo"]')!.click());act(()=>root.unmount());root=createRoot(container);expect(signal.aborted).toBe(true);
});
it('leaves failed OCR blank and disables confirmation',async()=>{
 mocks.marks.mockRejectedValue(new Error('Reader unavailable'));await render();expect(document.body.textContent).toContain('Aarav');expect(document.body.textContent).toContain('Reader unavailable');expect(document.querySelector<HTMLInputElement>('#sticker-score-0')!.value).toBe('');expect([...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm')!.disabled).toBe(true);
});
it('recovers identities without rereading marks',async()=>{
 mocks.api.mockRejectedValueOnce(new Error('Request timeout'));await render();await click('Retry student lookup');expect(document.querySelector<HTMLInputElement>('#sticker-score-0')!.value).toBe('0');expect(document.body.textContent).toContain('Aarav');expect(mocks.marks).toHaveBeenCalledTimes(1);expect(mocks.codes).toHaveBeenCalledTimes(1);
});
it('retries OCR without repeating identity lookup',async()=>{
 mocks.marks.mockRejectedValueOnce(new Error('Reader timed out'));await render();await click('Retry reading marks');expect(mocks.marks).toHaveBeenCalledTimes(2);expect(mocks.api).toHaveBeenCalledTimes(1);expect(document.querySelector<HTMLInputElement>('#sticker-score-0')!.value).toBe('0');
});
it('chunks identity lookup beyond ten without shifting rows',async()=>{
 mocks.codes.mockResolvedValue({width:1000,height:1000,codes:Array.from({length:23},(_,i)=>({humanId:String(i),corners:[]}))});mocks.api.mockImplementation(async(_path,_method,body)=>({results:[...body.humanIds].reverse().map((humanId:string)=>({humanId,student:{id:humanId,humanId,name:'Student '+humanId,marks:[]}}))}));await render();expect(mocks.api.mock.calls.map(c=>c[2].humanIds.length)).toEqual([10,10,3]);expect(document.querySelectorAll('input[inputmode=decimal]')).toHaveLength(23);expect(document.body.textContent).toContain('Student 22');
});
it('blocks duplicate identities',async()=>{mocks.codes.mockResolvedValue({width:100,height:100,codes:[{humanId:'A',corners:[]},{humanId:'A',corners:[]}]});await render();expect(document.body.textContent).toContain('Duplicate');expect([...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm')!.disabled).toBe(true);});

it('allows editing marks inline and prevents confirming an out-of-range value',async()=>{
 await render();const input=document.querySelector<HTMLInputElement>('#sticker-score-0')!;
 const change=async(value:string)=>act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
 await change('21');expect([...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm')!.disabled).toBe(true);expect(input.getAttribute('aria-invalid')).toBe('true');await change('7.5');await click('Confirm');expect(mocks.api).toHaveBeenCalledWith('/marks','POST',{testId:'test',studentId:'a',score:'7.5',expectedScore:null});
});
