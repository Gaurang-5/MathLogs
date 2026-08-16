import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, RefreshCw, UsersRound } from 'lucide-react';
import { superAdminInstituteApi } from './api';
import { StructuredConfigForm } from './StructuredConfigForm';
import { DeletionPanel } from './DeletionPanel';
import type { InstituteWorkspaceData, InstituteWorkspaceTab } from './types';

export const installedInstituteTabs: Record<InstituteWorkspaceTab, string> = { overview: 'Overview', account: 'Account', usage: 'Usage', billing: 'Billing', marketplace: 'Marketplace', leads: 'Leads', support: 'Support', activity: 'Activity' };
const date = (value: string | null) => value ? new Date(value).toLocaleDateString() : '—';

export function InstituteWorkspace() {
  const { id = '' } = useParams(); const location = useLocation(); const navigate = useNavigate();
  const requested = (location.pathname.split('/').pop() || 'overview') as InstituteWorkspaceTab;
  const activeTab = installedInstituteTabs[requested] ? requested : 'overview';
  const [data, setData] = useState<InstituteWorkspaceData | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const load = useCallback(async () => { setLoading(true); setError(''); try { setData(await superAdminInstituteApi.get(id)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to load institute'); } finally { setLoading(false); } }, [id]);
  useEffect(() => { void load(); }, [load]);
  if (loading && !data) return <div className="grid min-h-[50vh] place-items-center"><RefreshCw className="h-6 w-6 animate-spin" /></div>;
  if (error && !data) return <p className="rounded-2xl bg-rose-50 p-5 text-rose-700">{error}</p>;
  if (!data) return null;
  const metric = (label: string, value: React.ReactNode) => <div className="rounded-2xl border border-stone-200 bg-white p-5"><p className="text-xs font-black uppercase text-stone-400">{label}</p><div className="mt-2 text-xl font-black">{value}</div></div>;
  let content: React.ReactNode;
  if (activeTab === 'overview') content = <div className="grid gap-4 md:grid-cols-4">{metric('Students', data.usage.students)}{metric('Batches', data.usage.batches)}{metric('Subscribed plan', data.billing.plan)}{metric('Student limit', 'Unlimited')}</div>;
  else if (activeTab === 'account') content = <div className="space-y-4">{data.account.admins.map(admin => <div key={admin.id} className="rounded-2xl border bg-white p-4"><p className="font-black">{admin.username}</p><p className="text-xs text-stone-500">{admin.role}</p></div>)}<DeletionPanel instituteId={id} instituteName={data.overview.name} onDeleted={() => navigate('/super-admin/institutes')} /></div>;
  else if (activeTab === 'usage') content = <StructuredConfigForm instituteId={id} data={data.usage} expectedUpdatedAt={data.overview.updatedAt} onSaved={() => void load()} />;
  else if (activeTab === 'billing') content = <div className="space-y-4"><div className="grid gap-4 md:grid-cols-3">{metric('Subscribed plan', `${data.billing.plan} · ${data.billing.billingCycle || '—'}`)}{metric('Effective plan', data.billing.effectivePlan || data.billing.plan)}{metric('Marketplace access', data.billing.marketplaceAccessGrantedAt ? 'Lifetime active' : 'Not activated')}{metric('Included credits', `${data.usage.includedQuizCredits} · expire ${date(data.usage.includedQuizCreditsExpireAt)}`)}{metric('Lifetime credits', `${data.usage.lifetimeQuizCredits} · never expire`)}{metric('Next refresh', date(data.usage.quizCreditsRenewAt))}</div><Link to={`/super-admin/revenue?instituteId=${id}`} className="inline-flex rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-black text-white">Open billing operations</Link></div>;
  else if (activeTab === 'marketplace') content = <div className="grid gap-4 md:grid-cols-4">{Object.entries(data.marketplace).map(([key, value]) => metric(key.replaceAll(/([A-Z])/g, ' $1'), String(value)))}</div>;
  else if (activeTab === 'leads') content = <div className="grid gap-4 md:grid-cols-4">{Object.entries(data.leads).map(([key, value]) => metric(key, value))}</div>;
  else if (activeTab === 'support') content = <div className="grid gap-4 lg:grid-cols-2">{metric('Open support tickets', data.support.tickets.length)}{metric('Internal cases', data.support.cases.length)}</div>;
  else content = <div className="space-y-3">{data.activity.map(item => <div key={`${item.source}-${item.id}`} className="rounded-2xl bg-white p-4"><p className="font-black">{item.action.replaceAll('_', ' ')}</p><p className="text-xs text-stone-500">{new Date(item.createdAt).toLocaleString()}</p></div>)}</div>;
  return <div className="mx-auto max-w-[1500px] space-y-5"><button onClick={() => navigate('/super-admin/institutes')} className="inline-flex items-center gap-2 text-sm font-bold text-stone-600"><ArrowLeft className="h-4 w-4" />Institutes</button><section className="rounded-[28px] border border-stone-200 bg-[#fffdf9] p-6"><div className="flex items-start justify-between gap-4"><div className="flex gap-4"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-stone-950 text-white"><Building2 /></div><div><p className="text-xs font-black text-amber-700">{data.overview.status} · {data.billing.plan}</p><h2 className="text-3xl font-black">{data.overview.name}</h2><p className="text-sm text-stone-500">{data.overview.teacherName || 'Owner not set'} · {data.overview.phoneNumber || 'No phone'}</p></div></div><span className="inline-flex items-center gap-2 rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold"><UsersRound className="h-4 w-4" />{data.usage.students} students · unlimited</span></div><nav className="mt-6 flex gap-2 overflow-x-auto">{Object.entries(installedInstituteTabs).map(([key, label]) => <Link key={key} to={`/super-admin/institutes/${id}/${key}`} className={`rounded-full px-4 py-2.5 text-sm font-bold ${activeTab === key ? 'bg-stone-950 text-white' : 'bg-stone-100'}`}>{label}</Link>)}</nav></section><section>{content}</section></div>;
}
