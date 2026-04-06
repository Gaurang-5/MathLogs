import { useState } from 'react';
import axios from 'axios';
import { UserPlus, User, Phone, Mail, Link as LinkIcon, Gift, ArrowRight, CheckCircle, Copy, X } from 'lucide-react';
import type { Lead } from './types';

const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

interface OnboardingTabProps {
  leads: Lead[];
}

export default function OnboardingTab({ leads }: OnboardingTabProps) {
  const [showOnboardForm, setShowOnboardForm] = useState(false);
  const [plan, setPlan] = useState<'BASIC' | 'PRO' | 'CUSTOM'>('BASIC');
  const [discountPercent, setDiscountPercent] = useState<number | ''>(0);
  const [customPriceMonthly, setCustomPriceMonthly] = useState<number | ''>('');
  const [customPriceYearly, setCustomPriceYearly] = useState<number | ''>('');
  const [customMaxStudentsForInvite, setCustomMaxStudentsForInvite] = useState<number | ''>(100);
  const [isFreeTrial, setIsFreeTrial] = useState(false);
  const [trialDays, setTrialDays] = useState<number | ''>(14);

  const [isCreating, setIsCreating] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  const handleGenerateOnboardingLink = async (e: React.FormEvent) => {
      e.preventDefault();

      if (plan === 'CUSTOM' && !customPriceMonthly && !customPriceYearly) {
          alert('Please enter at least one custom price (monthly or yearly).');
          return;
      }

      if (isFreeTrial && (!trialDays || Number(trialDays) < 1)) {
          alert('Please enter valid trial days (minimum 1).');
          return;
      }

      setIsCreating(true);
      try {
          const token = localStorage.getItem('token');
          const res = await axios.post(`${API_URL}/admin-onboarding/create-link`, {
              plan,
              discountPercent: plan !== 'CUSTOM' ? (Number(discountPercent) || 0) : 0,
              customPriceMonthly: plan === 'CUSTOM' ? (Number(customPriceMonthly) || 0) : 0,
              customPriceYearly: plan === 'CUSTOM' ? (Number(customPriceYearly) || 0) : 0,
              maxStudents: plan === 'CUSTOM' ? (Number(customMaxStudentsForInvite) || 100) : (plan === 'PRO' ? 250 : 100),
              isFreeTrial,
              trialDays: isFreeTrial ? (Number(trialDays) || 14) : undefined,
          }, {
              headers: { Authorization: `Bearer ${token}` }
          });

          setInviteLink(res.data.link);
          setPlan('BASIC');
          setDiscountPercent(0);
          setCustomPriceMonthly('');
          setCustomPriceYearly('');
          setCustomMaxStudentsForInvite(100);
          setIsFreeTrial(false);
          setTrialDays(14);
      } catch (error: any) {
          const errMsg = error.response?.data?.error || error.message || 'Failed to generate onboarding link';
          alert(errMsg);
      } finally {
          setIsCreating(false);
      }
  };

  const copyToClipboard = () => {
      navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div>
              <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900">
                  <UserPlus className="w-5 h-5 text-blue-500" />
                  Onboarding Pipeline
              </h2>
              <p className="text-sm text-gray-500 mt-1">Track centers currently setting up via mathlogs.app/onboard</p>
          </div>
          <button onClick={() => setShowOnboardForm(true)} className="bg-black hover:bg-gray-800 text-white font-bold px-6 py-3 rounded-xl shadow-lg transition-all flex items-center gap-2">
              <LinkIcon className="w-4 h-4" />
              Generate Invite Link
          </button>
       </div>

       <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            {leads.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                       <UserPlus className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="text-gray-500 font-medium">No active onboarding leads</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 border-b border-gray-100 text-gray-900 font-semibold uppercase text-xs tracking-wider">
                            <tr>
                                <th className="px-6 py-4">Lead Status</th>
                                <th className="px-6 py-4">Coaching & Owner</th>
                                <th className="px-6 py-4">Contact Details</th>
                                <th className="px-6 py-4">Plan / Cycle</th>
                                <th className="px-6 py-4 text-right">Last Updated</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {leads.map((lead) => (
                                <tr key={lead.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {lead.step === 'CONVERTED' && <span className="px-3 py-1 bg-green-100 text-green-700 font-bold rounded-lg text-xs">✔ Converted</span>}
                                        {lead.step === 'PAYMENT_FAILED' && (
                                            <div className="flex flex-col gap-1">
                                                <span className="px-3 py-1 bg-red-100 text-red-700 font-bold rounded-lg text-xs w-max">✖ Payment Failed</span>
                                                <span className="text-[10px] text-red-500 font-medium max-w-[150px] truncate" title={lead.failureReason}>{lead.failureReason || 'Unknown error'}</span>
                                            </div>
                                        )}
                                        {lead.step === 'DETAILS_FILLED' && <span className="px-3 py-1 bg-gray-100 text-gray-700 font-bold rounded-lg text-xs">Details Filled</span>}
                                        {lead.step === 'PLAN_SELECTED' && <span className="px-3 py-1 bg-blue-100 text-blue-700 font-bold rounded-lg text-xs">Plan Selected</span>}
                                        {lead.step === 'PAYMENT_STARTED' && <span className="px-3 py-1 bg-orange-100 text-orange-700 font-bold rounded-lg text-xs">Payment Started</span>}
                                        {lead.step === 'STEP_1_STARTED' && <span className="px-3 py-1 bg-gray-100 text-gray-700 font-bold rounded-lg text-xs">Pinging Start</span>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900">{lead.tuitionName || 'Unknown'}</div>
                                        <div className="text-xs font-medium text-gray-500 flex items-center gap-1 mt-1">
                                            <User className="w-3.5 h-3.5" />
                                            {lead.ownerName || 'Unknown'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1.5">
                                            <div className="text-xs font-bold text-gray-800 flex items-center gap-2">
                                                <span className="p-1 bg-green-50 text-green-600 rounded"><Phone className="w-3 h-3" /></span>
                                                {lead.phone}
                                            </div>
                                            <div className="text-xs font-medium text-gray-500 flex items-center gap-2">
                                                <span className="p-1 bg-blue-50 text-blue-600 rounded"><Mail className="w-3 h-3" /></span>
                                                {lead.email || 'N/A'}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="font-bold uppercase tracking-wider text-xs">{lead.planId || '-'}</span>
                                        <div className="text-[10px] text-gray-400 font-semibold uppercase mt-0.5">{lead.billingCycle || ''}</div>
                                    </td>
                                    <td className="px-6 py-4 text-right whitespace-nowrap text-xs font-medium text-gray-400">
                                        {lead.updatedAt ? new Date(lead.updatedAt).toLocaleString() : 'N/A'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
       </div>

       {showOnboardForm && (
           <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
               <div className="bg-white p-8 rounded-3xl shadow-2xl border border-gray-100 max-w-md w-full max-h-[90vh] overflow-y-auto relative animate-in zoom-in-95 duration-200">
                   <div className="flex justify-between items-center mb-6">
                       <h2 className="text-xl font-bold flex items-center gap-2 text-black">
                           <LinkIcon className="w-5 h-5" /> Create Link
                       </h2>
                       <button onClick={() => setShowOnboardForm(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                   </div>
                   
                   <form onSubmit={handleGenerateOnboardingLink} className="space-y-5">
                       <div className="space-y-4">
                           <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Select Plan</label>
                           <div className="grid grid-cols-3 gap-2">
                               {(['BASIC', 'PRO', 'CUSTOM'] as const).map((p) => (
                                   <button
                                       key={p} type="button"
                                       onClick={() => {
                                           setPlan(p); setDiscountPercent(0); setCustomPriceMonthly(''); setCustomPriceYearly('');
                                           setCustomMaxStudentsForInvite(p === 'PRO' ? 250 : 100);
                                       }}
                                       className={`py-3 px-3 rounded-xl text-sm font-bold border-2 transition-all ${plan === p ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-200'}`}
                                   >
                                       <div className="text-center">
                                           <div>{p}</div>
                                           {p !== 'CUSTOM' && <div className={`text-[10px] mt-0.5 ${plan === p ? 'text-gray-300' : 'text-gray-400'}`}>{p === 'PRO' ? '250 Students' : '100 Students'}</div>}
                                       </div>
                                   </button>
                               ))}
                           </div>
                       </div>

                       <div className="flex items-center justify-between p-4 bg-amber-50/60 rounded-xl border border-amber-100">
                           <div className="flex items-center gap-3">
                               <Gift className="w-5 h-5 text-amber-600" />
                               <div>
                                   <label className="text-sm font-bold text-gray-800">Free Trial</label>
                                   <p className="text-[10px] text-gray-500">Skip payment. Give access for limited days.</p>
                               </div>
                           </div>
                           <button type="button" onClick={() => setIsFreeTrial(!isFreeTrial)} className={`relative w-12 h-6 rounded-full transition-colors ${isFreeTrial ? 'bg-amber-500' : 'bg-gray-300'}`}>
                               <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${isFreeTrial ? 'left-[26px]' : 'left-0.5'}`} />
                           </button>
                       </div>

                       {isFreeTrial && (
                           <div className="space-y-2 border border-amber-100 p-4 rounded-xl bg-amber-50/30">
                               <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Trial Duration (Days)</label>
                               <div className="grid grid-cols-4 gap-2">
                                   {[7, 14, 30, 60].map((d) => (
                                       <button key={d} type="button" onClick={() => setTrialDays(d)} className={`py-2.5 rounded-lg text-sm font-bold border-2 ${trialDays === d ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200'}`}>{d}d</button>
                                   ))}
                               </div>
                               <input type="number" value={trialDays} onChange={(e) => setTrialDays(e.target.value === '' ? '' : Math.min(365, Math.max(1, Number(e.target.value))))} className="w-full bg-white text-gray-900 border border-gray-200 rounded-xl px-4 py-3 mt-2 focus:ring-2 focus:ring-amber-400 outline-none" placeholder="Custom days" />
                           </div>
                       )}

                       {plan !== 'CUSTOM' ? (
                           <div className="space-y-3 border border-gray-100 p-4 rounded-xl bg-gray-50/50">
                               <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Discount %</label>
                               <input type="number" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value))))} className="w-full bg-white text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black outline-none font-bold text-lg" placeholder="0" />
                           </div>
                       ) : (
                           <div className="space-y-3 border border-gray-100 p-4 rounded-xl bg-gray-50/50">
                               <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Custom Pricing (₹)</label>
                               <div className="grid grid-cols-2 gap-3">
                                   <input type="number" value={customPriceMonthly} onChange={(e) => setCustomPriceMonthly(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Monthly (e.g. 2499)" className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-bold" />
                                   <input type="number" value={customPriceYearly} onChange={(e) => setCustomPriceYearly(e.target.value === '' ? '' : Number(e.target.value))} placeholder="Yearly (e.g. 24999)" className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 font-bold" />
                               </div>
                           </div>
                       )}

                       <button type="submit" disabled={isCreating} className="w-full bg-black hover:bg-gray-800 text-white font-bold py-3.5 rounded-xl transition-all disabled:opacity-70 flex items-center justify-center gap-2">
                           {isCreating ? 'Generating Link...' : 'Generate Onboarding Link'} <ArrowRight className="w-4 h-4" />
                       </button>
                   </form>

                   {inviteLink && (
                       <div className="mt-6 p-4 bg-green-50 border border-green-100 rounded-2xl animate-in fade-in slide-in-from-top-2">
                           <div className="flex items-center justify-between mb-2">
                               <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Link Ready</span>
                               {copied ? <CheckCircle className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5 text-green-600 cursor-pointer" onClick={copyToClipboard} />}
                           </div>
                           <code className="block w-full bg-white border border-green-200 p-3 rounded-xl text-xs text-green-800 break-all font-mono select-all">
                               {inviteLink}
                           </code>
                       </div>
                   )}
               </div>
           </div>
       )}
    </div>
  );
}
