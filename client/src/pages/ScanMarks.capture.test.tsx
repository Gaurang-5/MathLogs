import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ScanMarks from './ScanMarks';
const mocks=vi.hoisted(()=>({api:vi.fn(),review:vi.fn(),camera:vi.fn()}));
vi.mock('../utils/api',()=>({apiRequest:mocks.api}));
vi.mock('../components/Layout',()=>({default:({children}:any)=><>{children}</>}));
vi.mock('../components/MultiStickerReview',()=>({MultiStickerReview:(props:any)=>{mocks.review(props);return <button onClick={props.onClose}>Close review</button>;}}));
let root:Root,container:HTMLDivElement;
const click=async(label:string)=>act(async()=>{[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()===label)!.click();});
const choose=async(file?:File)=>{const input=document.querySelector<HTMLInputElement>('input[type=file]')!;Object.defineProperty(input,'files',{configurable:true,value:file?[file]:[]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));};
beforeEach(async()=>{
 vi.clearAllMocks();vi.stubGlobal('URL',{createObjectURL:vi.fn(()=> 'blob:photo'),revokeObjectURL:vi.fn()});vi.stubGlobal('navigator',{...navigator,mediaDevices:{getUserMedia:mocks.camera}});
 mocks.api.mockResolvedValue([{id:'test',name:'Demo',maxMarks:20}]);container=document.createElement('div');document.body.append(container);root=createRoot(container);
 await act(async()=>root.render(<MemoryRouter initialEntries={['/scan?testId=test']}><ScanMarks/></MemoryRouter>));
});
afterEach(()=>{act(()=>root.unmount());container.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('opens native rear camera directly without a browser camera stream',async()=>{
 const input=document.querySelector<HTMLInputElement>('input[type=file]')!,open=vi.spyOn(input,'click');expect(input.getAttribute('capture')).toBe('environment');await click('Take photo');expect(open).toHaveBeenCalledOnce();expect(document.querySelector('video')).toBeNull();expect(mocks.camera).not.toHaveBeenCalled();
});
it('passes the original phone photo to review and frees it on close',async()=>{
 const file=new File(['original'],'photo.jpg',{type:'image/jpeg'});await choose(file);expect(mocks.review.mock.calls.at(-1)![0]).toMatchObject({photo:file,testId:'test',maxMarks:20,imageUrl:'blob:photo'});await click('Close review');expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo');expect(document.body.textContent).toContain('Take photo');
});
it('canceling the picker leaves the page usable and allows the same photo again',async()=>{
 await choose();expect(mocks.review).not.toHaveBeenCalled();const file=new File(['photo'],'photo.jpg',{type:'image/jpeg'});await choose(file);await click('Close review');await choose(file);expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
});
it('rejects unsupported photos without starting OCR',async()=>{
 await choose(new File(['bad'],'photo.heic',{type:'image/heic'}));expect(document.body.textContent).toContain('Choose a JPEG');expect(mocks.review).not.toHaveBeenCalled();
});
it('cleans up the captured photo when leaving the page',async()=>{
 await choose(new File(['photo'],'photo.jpg',{type:'image/jpeg'}));act(()=>root.unmount());root=createRoot(container);expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo');
});
