import { act } from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {it,expect,vi} from 'vitest';
import BulkScanMarks from './BulkScanMarks';
const {api,read,write}=vi.hoisted(()=>({api:vi.fn(),read:vi.fn(),write:vi.fn(async()=>{})}));
vi.mock('../utils/api',()=>({apiRequest:api}));
vi.mock('../utils/scanDrafts',()=>({readScanDrafts:read,writeScanDrafts:write,scanDraftOwner:()=> 'teacher'}));
vi.mock('../components/Layout',()=>({default:({children}:{children:React.ReactNode})=><>{children}</>}));
it('restores zero marks, preserves uncertain rows and saves only reviewed eligible results',async()=>{
    api.mockImplementation(async(path:string)=>path==='/tests'?[{id:'test',name:'Maths',maxMarks:50}]:{});
    read.mockResolvedValue([
        {humanId:'A',name:'Zero student',studentId:'a',image:'data:image/png;base64,AA',score:'0',state:'review',overwrite:false},
        {humanId:'B',name:'Uncertain student',studentId:'b',image:'data:image/png;base64,AA',score:'',state:'review',overwrite:false},
        {humanId:'C',name:'Existing student',studentId:'c',image:'data:image/png;base64,AA',score:'9',previous:8,state:'review',overwrite:false}
    ]);
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    await act(async()=>root.render(<MemoryRouter><BulkScanMarks/></MemoryRouter>));
    await act(async()=>{const select=host.querySelector('select')!;select.value='test';select.dispatchEvent(new Event('change',{bubbles:true}));});
    expect(host.textContent).toContain('Save 1 reviewed results');
    const save=Array.from(host.querySelectorAll('button')).find(button=>button.textContent?.includes('Save 1'))!;
    await act(async()=>save.click());
    expect(api).toHaveBeenCalledWith('/marks','POST',{testId:'test',studentId:'a',score:'0',expectedScore:null});
    expect(api.mock.calls.filter(call=>call[0]==='/marks')).toHaveLength(1);
    expect(host.textContent).toContain('1 results saved');
    expect(write).toHaveBeenCalled();
    await act(async()=>root.unmount());host.remove();
});
