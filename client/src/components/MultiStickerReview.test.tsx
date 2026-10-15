import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { MultiStickerReview } from './MultiStickerReview';
const mocks=vi.hoisted(()=>({codes:vi.fn(),marks:vi.fn(),api:vi.fn(),toast:vi.fn()}));
vi.mock('react-hot-toast',()=>({default:{success:mocks.toast}}));
vi.mock('../utils/api',()=>({apiRequest:mocks.api}));
vi.mock('../utils/multiSticker',()=>({readPhotoCodes:mocks.codes,extractAllPhotoMarks:mocks.marks}));
let container:HTMLDivElement,root:Root;const close=vi.fn();
const click=async(label:string)=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===label)!;expect(button).toBeTruthy();await act(async()=>button.click());};
const render=async()=>act(async()=>root.render(<MultiStickerReview photo={new Blob(['photo'])} imageUrl="blob:fixture" testId="test" maxMarks={20} onClose={close}/>));
beforeEach(()=>{
 vi.clearAllMocks();vi.spyOn(window,'confirm').mockReturnValue(true);container=document.createElement('div');document.body.append(container);root=createRoot(container);
 mocks.codes.mockResolvedValue({width:1000,height:1000,codes:['A','B'].map(humanId=>({humanId,corners:[]}))});
 mocks.marks.mockImplementation(async(_image,codes)=>codes.codes.map((code:any,i:number)=>({code,score:i===0?'0':'12'})));
 mocks.api.mockImplementation(async(path,_method,body)=>path==='/marks/batch'?{results:body.marks.map((m:any)=>({studentId:m.studentId,saved:true}))}:{results:[{humanId:'B',student:{id:'b',name:'Bela',humanId:'B',marks:[]}},{humanId:'A',student:{id:'a',name:'Aarav',humanId:'A',marks:[]}}]});
});
afterEach(()=>{act(()=>root.unmount());container.remove();vi.restoreAllMocks();});
it('saves in one request, preserves zero, and retries only failed rows',async()=>{
 await render();expect(document.querySelector<HTMLInputElement>('#sticker-score-0')!.value).toBe('0');expect(document.querySelector('img')).toBeNull();
 let fail=true;mocks.api.mockImplementation(async(_path,_method,body)=>({results:body.marks.map((m:any)=>({studentId:m.studentId,saved:m.studentId!=='b'||!fail,error:m.studentId==='b'&&fail?'Network failed':undefined}))}));
 await click('Confirm');expect(close).not.toHaveBeenCalled();fail=false;await click('Confirm');expect(close).toHaveBeenCalledTimes(1);
 const saves=mocks.api.mock.calls.filter(([path])=>path==='/marks/batch');expect(saves.map(c=>c[2].marks.map((m:any)=>m.studentId))).toEqual([['a','b'],['b']]);expect(saves[0][2].marks[0]).toEqual({studentId:'a',score:'0',expectedScore:null});expect(mocks.toast).toHaveBeenCalledWith('2 marks saved');
});
it('asks before replacing existing marks and retains optimistic protection',async()=>{
 mocks.api.mockResolvedValueOnce({results:[{humanId:'A',student:{id:'a',name:'Aarav',humanId:'A',marks:[{testId:'test',score:7}]}},{humanId:'B',student:{id:'b',name:'Bela',humanId:'B',marks:[]}}]});await render();vi.mocked(window.confirm).mockReturnValueOnce(false);await click('Confirm');expect(mocks.api).toHaveBeenCalledTimes(1);await click('Confirm');expect(mocks.api.mock.calls[1][2].marks[0]).toEqual({studentId:'a',score:'0',expectedScore:7});
});
it('requires reviewing a concurrent change before replacement',async()=>{
 await render();mocks.api.mockResolvedValueOnce({results:[{studentId:'a',saved:false,conflict:true,currentScore:9,error:'The saved mark changed.'},{studentId:'b',saved:true}]});await click('Confirm');expect(document.body.textContent).toContain('Currently saved: 9');expect([...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm')!.disabled).toBe(true);
 await click('Review complete — use my entry');await click('Confirm');expect(mocks.api.mock.calls.at(-1)![2].marks).toEqual([{studentId:'a',score:'0',expectedScore:9}]);
});
it('keeps entries after a request timeout and reports no success until retry confirms',async()=>{
 await render();mocks.api.mockRejectedValueOnce(new Error('Request timeout'));await click('Confirm');expect(close).not.toHaveBeenCalled();expect(mocks.toast).not.toHaveBeenCalled();expect(document.querySelector<HTMLInputElement>('#sticker-score-0')!.value).toBe('0');await click('Confirm');expect(close).toHaveBeenCalledTimes(1);
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
 await change('21');expect([...document.querySelectorAll('button')].find(b=>b.textContent==='Confirm')!.disabled).toBe(true);expect(input.getAttribute('aria-invalid')).toBe('true');await change('7.5');await click('Confirm');expect(mocks.api.mock.calls.at(-1)![2].marks[0]).toEqual({studentId:'a',score:'7.5',expectedScore:null});
});
it('saves larger photos in bounded batches and reports the complete saved count',async()=>{
 mocks.codes.mockResolvedValue({width:1000,height:1000,codes:Array.from({length:43},(_,i)=>({humanId:String(i),corners:[]}))});
 mocks.api.mockImplementation(async(path,_method,body)=>path==='/marks/batch'?{results:body.marks.map((m:any)=>({studentId:m.studentId,saved:true}))}:{results:body.humanIds.map((humanId:string)=>({humanId,student:{id:humanId,humanId,name:'Student '+humanId,marks:[]}}))});
 await render();await click('Confirm');expect(mocks.api.mock.calls.filter(c=>c[0]==='/marks/batch').map(c=>c[2].marks.length)).toEqual([20,20,3]);expect(mocks.toast).toHaveBeenCalledWith('43 marks saved');
});
