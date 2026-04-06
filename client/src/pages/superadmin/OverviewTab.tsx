import { Building2, Users, GraduationCap, IndianRupee, AlertTriangle, Activity } from 'lucide-react';
import type { AnalyticsSummary, Institute, Lead } from './types';

interface OverviewTabProps {
  analytics: AnalyticsSummary | null;
  institutes: Institute[];
  leads: Lead[];
}

export default function OverviewTab({ analytics, institutes, leads }: OverviewTabProps) {
  // Compute Needs Attention alerts
  const suspendedCount = institutes.filter(i => i.status === 'SUSPENDED').length;
  const failedLeads = leads.filter(l => l.step === 'PAYMENT_FAILED').length;

  const alerts = [];
  if (suspendedCount > 0) alerts.push({ message: `${suspendedCount} Institute(s) are currently suspended.`, type: 'warning' });
  if (failedLeads > 0) alerts.push({ message: `${failedLeads} Onboarding Lead(s) stuck at Payment Failed.`, type: 'error' });

  return (
    <div className="space-y-8">
      {/* Needs Attention Feed */}
      {(alerts.length > 0) && (
        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
          <h3 className="text-lg font-bold flex items-center gap-2 mb-4 text-gray-900">
             <Activity className="w-5 h-5 text-red-500" />
             Needs Attention
          </h3>
          <div className="grid gap-3">
             {alerts.map((alert, idx) => (
                <div key={idx} className={`p-4 rounded-xl flex items-center gap-3 border ${alert.type === 'error' ? 'bg-red-50 border-red-100 text-red-800' : 'bg-orange-50 border-orange-100 text-orange-800'}`}>
                   <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                   <span className="font-semibold text-sm">{alert.message}</span>
                </div>
             ))}
          </div>
        </div>
      )}

      {/* Metrics Grid */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard icon={Building2} title="Total Institutes" value={analytics.totalInstitutes || 0} color="blue" />
          <StatCard icon={Users} title="Active Students" value={analytics.totalStudents || 0} color="green" />
          <StatCard icon={GraduationCap} title="Total Batches" value={analytics.totalBatches || 0} color="purple" />
          <StatCard 
            icon={IndianRupee} 
            title="Platform Revenue" 
            value={`₹${(analytics.totalRevenue || 0).toLocaleString()}`} 
            color="orange" 
            subtitle="Lifetime"
          />
        </div>
      )}

      {/* Quick Status Empty State to fill space nicely */}
      {alerts.length === 0 && (
         <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mb-4">
               <Activity className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">All Systems Normal</h3>
            <p className="text-gray-500 text-sm">No critical issues or stuck leads require your immediate attention.</p>
         </div>
      )}
    </div>
  );
}

// Ensure icon accepts any
function StatCard({ icon: Icon, title, value, color, subtitle }: any) {
  const colorMap: any = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-all group">
        <div className="flex items-center gap-4 mb-2">
            <div className={`p-3 rounded-2xl ${colorMap[color]}`}>
                <Icon className="w-6 h-6 group-hover:scale-110 transition-transform" />
            </div>
            <div>
                <div className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mb-1">{title}</div>
                <div className="text-3xl font-black text-gray-900 flex items-end gap-2">
                  {value}
                  {subtitle && <span className="text-xs font-medium text-gray-400 mb-1">{subtitle}</span>}
                </div>
            </div>
        </div>
    </div>
  );
}
