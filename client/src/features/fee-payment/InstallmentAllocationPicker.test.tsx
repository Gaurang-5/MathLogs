import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { InstallmentAllocationPicker } from './InstallmentAllocationPicker';
vi.mock('../../utils/api',()=>({api:{get:vi.fn().mockResolvedValue({installments:[{id:'sep',name:'September',batchName:'Math',amount:700,paid:0,remaining:700},{id:'oct',name:'October',batchName:'Math',amount:1000,paid:0,remaining:1000}]})}}));
it('requires selection, allows a reviewed split, and clears selection when amount changes',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const onChange=vi.fn();
 try{
 await act(async()=>root.render(<InstallmentAllocationPicker studentId="s" amount="1700" onChange={onChange}/>));
 expect(onChange).toHaveBeenLastCalledWith([],false);
 const boxes=host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');expect(boxes[0].checked).toBe(false);expect(boxes[1].checked).toBe(false);
 await act(async()=>boxes[0].click());expect(onChange).toHaveBeenLastCalledWith([{installmentId:'sep',amount:700}],false);
 await act(async()=>boxes[1].click());expect(onChange).toHaveBeenLastCalledWith([{installmentId:'sep',amount:700},{installmentId:'oct',amount:1000}],true);
 expect(host.textContent).toContain('October: ₹1000 → remaining ₹0');
 await act(async()=>root.render(<InstallmentAllocationPicker studentId="s" amount="500" onChange={onChange}/>));expect(onChange).toHaveBeenLastCalledWith([],false);
 await act(async()=>boxes[1].click());expect(onChange).toHaveBeenLastCalledWith([{installmentId:'oct',amount:500}],true);
 }finally{await act(async()=>root.unmount());host.remove();}
});
