import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';

import SuperAdminLayout from './superadmin/SuperAdminLayout';
import OverviewTab from './superadmin/OverviewTab';
import InstitutesTab from './superadmin/InstitutesTab';
import OnboardingTab from './superadmin/OnboardingTab';
import BroadcastsTab from './superadmin/BroadcastsTab';
import type { Institute, Lead, AnalyticsSummary } from './superadmin/types';

const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

export default function SuperAdminDashboard() {
    const navigate = useNavigate();

    // Data State
    const [institutes, setInstitutes] = useState<Institute[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Layout State
    const [activeTab, setActiveTab] = useState<'overview' | 'institutes' | 'onboarding' | 'broadcasts'>('overview');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            const [institutesRes, analyticsRes, leadsRes] = await Promise.all([
                axios.get<Institute[]>(`${API_URL}/institutes`, { headers }),
                axios.get<AnalyticsSummary>(`${API_URL}/institutes/analytics`, { headers }).catch(() => null),
                axios.get<Lead[]>(`${API_URL}/onboarding/leads`, { headers }).catch(() => null)
            ]);

            setInstitutes(institutesRes.data);
            if (analyticsRes) setAnalytics(analyticsRes.data);
            if (leadsRes) setLeads(leadsRes.data);
            setError(null);
        } catch (err) {
            console.error('Failed to fetch dashboard data', err);
            setError('Failed to load SuperAdmin data. Check your connection or permissions.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login');
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center">
                <Loader2 className="w-10 h-10 animate-spin text-gray-400 mb-4" />
                <p className="text-gray-500 font-medium animate-pulse">Loading Control Center...</p>
            </div>
        );
    }

    return (
        <SuperAdminLayout activeTab={activeTab} setActiveTab={setActiveTab} handleLogout={handleLogout}>
            {error && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-8 flex items-center gap-3 border border-red-100">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                    <p className="font-semibold text-sm">{error}</p>
                </div>
            )}
            
            {activeTab === 'overview' && (
                <OverviewTab analytics={analytics} institutes={institutes} leads={leads} />
            )}
            
            {activeTab === 'institutes' && (
                <InstitutesTab institutes={institutes} fetchData={fetchData} />
            )}

            {activeTab === 'onboarding' && (
                <OnboardingTab leads={leads} />
            )}

            {activeTab === 'broadcasts' && (
                <BroadcastsTab />
            )}
        </SuperAdminLayout>
    );
}
