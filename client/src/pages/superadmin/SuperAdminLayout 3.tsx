import type { ReactNode } from 'react';
import { ShieldCheck, LogOut, LayoutDashboard, Building2, UserPlus, Megaphone } from 'lucide-react';

interface LayoutProps {
  children: ReactNode;
  activeTab: 'overview' | 'institutes' | 'onboarding' | 'broadcasts';
  setActiveTab: (tab: 'overview' | 'institutes' | 'onboarding' | 'broadcasts') => void;
  handleLogout: () => void;
}

export default function SuperAdminLayout({ children, activeTab, setActiveTab, handleLogout }: LayoutProps) {
  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'institutes', label: 'Institutes', icon: Building2 },
    { id: 'onboarding', label: 'Onboarding Pipeline', icon: UserPlus },
    { id: 'broadcasts', label: 'Global Broadcasts', icon: Megaphone },
  ] as const;

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-gray-900 flex">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed inset-y-0 z-20">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-black text-white p-2 rounded-xl shadow-md">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Admin Pro</h1>
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mt-0.5">Control Center</p>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1.5 mt-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-semibold text-sm ${isActive ? 'bg-black text-white shadow-md' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 text-green-700 rounded-xl border border-green-100 mb-4">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-xs font-bold">System Operational</span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors font-semibold text-sm"
          >
            <LogOut className="w-5 h-5" />
            Logout Securely
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 min-h-screen">
        {/* Top Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-10 px-8 py-5 flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-900">
              {tabs.find(t => t.id === activeTab)?.label}
            </h2>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center border border-gray-200">
                 <ShieldCheck className="w-4 h-4 text-gray-500" />
              </div>
            </div>
        </header>

        {/* Content Area */}
        <div className="p-8 max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
