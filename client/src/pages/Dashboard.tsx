
import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import Layout from '../components/Layout';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Wallet } from 'lucide-react';



export default function Dashboard() {
    const [stats, setStats] = useState({ batches: 0, students: 0 });
    const [growthData, setGrowthData] = useState([]);
    const [finances, setFinances] = useState({ collected: 0, pending: 0 });
    const [defaulters, setDefaulters] = useState<any[]>([]);

    useEffect(() => {
        api.get('/batches').then((data: any) => {
            const batchCount = data.length;
            const studentCount = data.reduce((sum: number, b: any) => sum + (b._count?.students || 0), 0);
            setStats({ batches: batchCount, students: studentCount });
        }).catch(() => { });

        api.get('/stats/growth').then(data => setGrowthData(data)).catch(() => { });

        api.get('/fees/summary').then((data: any[]) => {
            const collected = data.reduce((sum, s) => sum + s.totalPaid, 0);
            const pending = data.reduce((sum, s) => sum + Math.max(0, s.balance), 0);
            setFinances({ collected, pending });

            // Batch-wise Pending Dues
            const batchMap = new Map<string, number>();
            data.forEach(s => {
                if (s.balance > 0) {
                    const current = batchMap.get(s.batchName) || 0;
                    batchMap.set(s.batchName, current + s.balance);
                }
            });

            const batchDues = Array.from(batchMap.entries())
                .map(([name, amount]) => ({ name, amount }))
                .sort((a, b) => b.amount - a.amount);

            setDefaulters(batchDues);
        }).catch(() => { });
    }, []);

    return (
        <Layout title="Dashboard">
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                {/* Total Students */}
                <div className="bg-app-surface-opaque px-6 py-6 rounded-[24px] border border-app-border shadow-sm flex items-center gap-5 transition-all hover:shadow-md">
                    <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-800 text-app-text rounded-2xl flex items-center justify-center">
                        <Users className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                    <div>
                        <p className="text-xs text-app-text-tertiary font-bold uppercase tracking-wider mb-1">Total Students</p>
                        <p className="text-3xl font-bold text-app-text tracking-tight">{stats.students}</p>
                    </div>
                </div>

                {/* Collection Rate */}
                <div className="bg-app-surface-opaque px-6 py-6 rounded-[24px] border border-app-border shadow-sm flex items-center gap-5 transition-all hover:shadow-md">
                    <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-800 text-app-text rounded-2xl flex items-center justify-center">
                        <Wallet className="w-6 h-6" strokeWidth={1.5} />
                    </div>
                    <div>
                        <p className="text-xs text-app-text-tertiary font-bold uppercase tracking-wider mb-1">Fee Collection Rate</p>
                        <p className="text-3xl font-bold text-app-text tracking-tight">
                            {finances.collected + finances.pending > 0
                                ? Math.min(100, Math.round((finances.collected / (finances.collected + finances.pending)) * 100))
                                : 0}%
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Student Growth Chart - 2 Columns */}
                <div className="xl:col-span-2 bg-white dark:bg-neutral-900 p-6 rounded-[24px] border border-app-border shadow-sm">
                    <h3 className="text-lg font-bold text-app-text mb-6">Student Growth</h3>
                    <div className="h-[300px] w-full min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={growthData}>
                                <defs>
                                    <linearGradient id="colorStudents" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    itemStyle={{ color: '#1e293b' }}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="students"
                                    stroke="#6366f1"
                                    strokeWidth={3}
                                    fillOpacity={1}
                                    fill="url(#colorStudents)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Batch Pending Dues List - 1 Column */}
                <div className="bg-white dark:bg-neutral-900 p-6 rounded-[24px] border border-app-border shadow-sm flex flex-col">
                    <h3 className="text-lg font-bold text-app-text mb-4">Batch Pending Dues</h3>
                    <div className="flex-1 overflow-auto space-y-4">
                        {defaulters.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-app-text-tertiary text-sm">No pending dues</div>
                        ) : (
                            defaulters.map((batch: any, index) => (
                                <div key={index} className="flex justify-between items-center p-3 rounded-2xl bg-app-surface-opaque border border-app-border/50">
                                    <div>
                                        <p className="font-semibold text-app-text text-sm">{batch.name}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-red-500 text-sm">₹{batch.amount.toLocaleString()}</p>
                                        <p className="text-[10px] text-app-text-tertiary uppercase font-bold tracking-wide">Total Due</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
}
