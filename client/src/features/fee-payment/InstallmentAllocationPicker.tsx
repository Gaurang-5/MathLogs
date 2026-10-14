import { useEffect, useState } from 'react';
import { api } from '../../utils/api';
import { TeacherButton } from '../../components/teacher-ui/TeacherButton';
export type PaymentAllocation = { installmentId: string; amount: number };
type Option = { id: string; name: string; batchName: string; amount: number; paid: number; remaining: number };
export function InstallmentAllocationPicker({studentId, amount, onChange}: {studentId:string;amount:string|number;onChange:(rows:PaymentAllocation[],ready:boolean)=>void}) {
  const [options,setOptions]=useState<Option[]>([]);
  const [selected,setSelected]=useState<Record<string,string>>({});
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;setLoading(true);setError('');setSelected({});onChange([],false);
    api.get<{installments:Option[]}>(`/fees/students/${studentId}/payment-options`).then(data=>{if(active)setOptions(data.installments);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Could not load installments.');}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[studentId,attempt]);
  useEffect(()=>{setSelected({});onChange([],false);},[amount]);
  const total=Math.round(Number(amount)*100);
  const rows=Object.entries(selected).map(([installmentId,value])=>({installmentId,amount:Number(value)}));
  const allocated=rows.reduce((n,r)=>n+Math.round(r.amount*100),0);
  const valid=Number.isSafeInteger(total)&&total>0&&!loading&&!error&&rows.length>0&&allocated===total&&rows.every(r=>Number.isFinite(r.amount)&&r.amount>0&&/^\d+(\.\d{1,2})?$/.test(selected[r.installmentId])&&r.amount<=(options.find(o=>o.id===r.installmentId)?.remaining||0));
  const update=(next:Record<string,string>)=>{
    setSelected(next);
    const entries=Object.entries(next).map(([installmentId,value])=>({installmentId,amount:Number(value)}));
    onChange(entries,entries.length>0&&entries.reduce((n,r)=>n+Math.round(r.amount*100),0)===total&&entries.every(r=>/^\d+(\.\d{1,2})?$/.test(next[r.installmentId])&&r.amount>0&&r.amount<=(options.find(o=>o.id===r.installmentId)?.remaining||0)));
  };
  if(loading)return <p role="status" className="text-sm text-app-text-secondary">Loading applicable installments…</p>;
  if(error)return <div role="alert"><p>{error}</p><TeacherButton variant="secondary" onClick={()=>setAttempt(a=>a+1)}>Retry installments</TeacherButton></div>;
  return <fieldset className="space-y-3 text-left"><legend className="mb-2 font-semibold text-app-text">Select installment(s)</legend>
    <p className="text-xs text-app-text-secondary">Choose where this payment belongs. Select more than one to split the amount.</p>
    {options.filter(o=>o.remaining>0).map(o=><div key={o.id} className="rounded-xl border border-app-border p-3">
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" aria-label={`Pay ${o.name} — ${o.batchName}`} checked={o.id in selected} onChange={e=>{const next={...selected};if(e.target.checked)next[o.id]=String(Math.min(o.remaining,Math.max(0,(total-allocated)/100)));else delete next[o.id];update(next);}}/><span className="min-w-0"><strong>{o.name}</strong><span className="block text-xs text-app-text-secondary">{o.batchName} · Fee ₹{o.amount.toLocaleString('en-IN')} · Paid ₹{o.paid.toLocaleString('en-IN')} · Remaining ₹{o.remaining.toLocaleString('en-IN')}</span></span></label>
      {o.id in selected&&<label className="block text-sm">Allocate to {o.name}<input aria-label={`Amount for ${o.name}`} inputMode="decimal" type="number" min="0.01" max={o.remaining} step="0.01" value={selected[o.id]} onChange={e=>update({...selected,[o.id]:e.target.value})} className="mt-1 min-h-11 w-full rounded-xl border border-app-border bg-app-surface-opaque px-3"/></label>}
    </div>)}
    {!options.some(o=>o.remaining>0)&&<p role="status">No payable installments. Manage this student’s fees before recording a payment.</p>}
    <div role="status" className="rounded-xl bg-app-surface-opaque p-3 text-sm"><strong>Received ₹{Number(amount||0).toLocaleString('en-IN')} · Allocated ₹{(allocated/100).toLocaleString('en-IN')}</strong>
      {valid?<p className="mt-1">{rows.map(r=>{const o=options.find(o=>o.id===r.installmentId)!;return `${o.name}: ₹${r.amount} → remaining ₹${Math.round((o.remaining-r.amount)*100)/100}`;}).join(' · ')}</p>:<p className="mt-1 text-app-text-secondary">Allocate the exact amount received. Overpayments cannot be recorded against an installment.</p>}
    </div>
  </fieldset>;
}
