

import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Users, FileText, Scan, Receipt, LogOut, Menu, X, PanelLeftClose, PanelLeftOpen, Zap, Settings } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../utils/cn';
import ToastProvider from './ToastProvider';
import QuickFeeModal from './QuickFeeModal';
import PWAInstallPrompt from './PWAInstallPrompt';

interface LayoutProps {
    children: React.ReactNode;
    title?: string;
}

export default function Layout({ children, title }: LayoutProps) {
    const location = useLocation();
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    // Default to collapsed on screens smaller than 1280px (xl) to prevent squashed content on tablets/laptops
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.innerWidth < 1280;
        }
        return false;
    });
    const [showQuickFeeModal, setShowQuickFeeModal] = useState(false);

    const showMobileNav = ['/dashboard', '/batches', '/tests', '/fees', '/scan', '/settings'].includes(location.pathname);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login');
    };

    const navItems = [
        { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
        { name: 'Batches', path: '/batches', icon: Users },
        { name: 'Tests', path: '/tests', icon: FileText },
        { name: 'Scan Marks', path: '/scan', icon: Scan },
        { name: 'Fees', path: '/fees', icon: Receipt },
        { name: 'Settings', path: '/settings', icon: Settings },
    ];

    return (
        <div className="flex min-h-screen bg-app-bg text-app-text transition-colors duration-500 font-sans selection:bg-accent-subtle selection:text-accent">
            <ToastProvider />
            <QuickFeeModal isOpen={showQuickFeeModal} onClose={() => setShowQuickFeeModal(false)} />

            {/* Sidebar (Desktop) - Premium Glass Style */}
            <aside
                className={cn(
                    "glass fixed inset-y-4 left-4 rounded-[24px] hidden xl:flex flex-col z-20 shadow-xl overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
                    isSidebarCollapsed ? "w-24" : "w-72"
                )}
            >
                <div className={cn("flex items-center", isSidebarCollapsed ? "justify-center p-6" : "justify-between p-8")}>
                    {!isSidebarCollapsed && (
                        <Link to="/dashboard" className="text-2xl font-semibold tracking-tight text-app-text whitespace-nowrap overflow-hidden hover:opacity-80 transition-opacity cursor-pointer">
                            Math<span className="text-accent">Logs</span>
                        </Link>
                    )}
                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className={cn(
                            "text-app-text-tertiary hover:text-app-text transition-colors p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5",
                            !isSidebarCollapsed && "bg-transparent"
                        )}
                        title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                    >
                        {isSidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
                    </button>
                </div>

                <nav className="flex-1 px-4 space-y-2 overflow-y-auto py-2 scroll-smooth">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={cn(
                                    "flex items-center rounded-2xl text-[15px] font-medium transition-all group relative",
                                    isSidebarCollapsed ? "justify-center px-0 py-3" : "px-4 py-3",
                                    isActive
                                        ? "text-accent font-semibold"
                                        : "text-app-text-secondary hover:text-app-text hover:bg-black/5"
                                )}
                                title={isSidebarCollapsed ? item.name : undefined}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="sidebar-active"
                                        className={cn("absolute inset-0 bg-accent-subtle dark:bg-accent/10 rounded-2xl", isSidebarCollapsed ? "mx-2" : "")}
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    />
                                )}
                                <item.icon
                                    className={cn(
                                        "w-5 h-5 z-10 relative transition-transform duration-300 group-hover:scale-110",
                                        !isSidebarCollapsed && "mr-3",
                                        isActive ? "text-accent" : "text-app-text-tertiary group-hover:text-app-text"
                                    )}
                                    strokeWidth={2}
                                />
                                {!isSidebarCollapsed && <span className="z-10 relative whitespace-nowrap overflow-hidden">{item.name}</span>}
                            </Link>
                        );
                    })}
                </nav>

                {/* Quick Actions (Desktop) */}
                <div className={cn("px-4 pb-2", isSidebarCollapsed ? "flex justify-center" : "")}>
                    <button
                        onClick={() => setShowQuickFeeModal(true)}
                        className={cn(
                            "flex items-center justify-center bg-gray-900 text-white hover:bg-black transition-all shadow-lg shadow-gray-200 active:scale-95 group relative overflow-hidden",
                            isSidebarCollapsed ? "w-10 h-10 rounded-xl" : "w-full py-3 rounded-2xl"
                        )}
                        title="Log Fee"
                    >
                        <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                        <Zap className={cn("w-5 h-5", !isSidebarCollapsed && "mr-2")} fill="currentColor" />
                        {!isSidebarCollapsed && <span className="font-bold text-sm">Log Fee</span>}
                    </button>
                </div>

                <div className={cn("space-y-2", isSidebarCollapsed ? "p-2 items-center flex flex-col" : "p-4")}>
                    <button
                        onClick={handleLogout}
                        className={cn(
                            "flex items-center text-[15px] font-medium text-danger hover:bg-danger/5 hover:text-danger rounded-2xl transition-all active:scale-[0.98]",
                            isSidebarCollapsed ? "justify-center p-3 w-full" : "w-full px-4 py-3"
                        )}
                        title={isSidebarCollapsed ? "Sign Out" : undefined}
                    >
                        <LogOut className={cn("w-5 h-5", !isSidebarCollapsed && "mr-3")} strokeWidth={2} />
                        {!isSidebarCollapsed && "Sign Out"}
                    </button>
                </div>
            </aside>

            {/* Mobile Header - Glassy with Safe Area */}
            <header className="fixed top-0 left-0 right-0 glass border-b-0 flex items-center justify-between px-6 xl:hidden z-50 transition-colors" style={{
                height: 'calc(4rem + env(safe-area-inset-top))',
                paddingTop: 'max(0.5rem, env(safe-area-inset-top))'
            }}>
                <Link to="/dashboard" className="font-semibold text-xl text-app-text tracking-tight">ML</Link>
                <div className="flex items-center gap-3">
                    <Link
                        to="/scan"
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-app-surface-opaque text-app-text-secondary active:scale-95 transition-transform"
                    >
                        <Scan className="w-5 h-5" />
                    </Link>
                    <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-app-text-secondary w-10 h-10 flex items-center justify-center rounded-full bg-app-surface-opaque">
                        {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
            </header>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 bg-app-bg pt-24 px-6 xl:hidden backdrop-blur-3xl"
                    >
                        <nav className="space-y-2">
                            {/* Navigation items are moved to Bottom Bar. Keeping menu for system actions only. */}
                            <div className="pt-2">
                                <Link
                                    to="/settings"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className="flex items-center w-full px-4 py-4 text-base font-medium text-app-text-secondary hover:bg-black/5 hover:text-app-text rounded-2xl"
                                >
                                    <Settings className="w-6 h-6 mr-4" />
                                    Settings
                                </Link>
                                <button
                                    onClick={handleLogout}
                                    className="flex items-center w-full px-4 py-4 text-base font-medium text-danger hover:bg-danger/5 rounded-2xl mt-4"
                                >
                                    <LogOut className="w-6 h-6 mr-4" />
                                    Sign Out
                                </button>
                            </div>
                        </nav>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content Area */}
            <main
                className={cn(
                    "flex-1 flex flex-col min-h-screen bg-app-bg relative transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] min-w-0 xl:pb-0",
                    showMobileNav ? "pb-32" : "pb-6",
                    isSidebarCollapsed ? "xl:pl-[8rem]" : "xl:pl-[20rem]"
                )}
            >
                <div className="xl:hidden" style={{ height: 'calc(4rem + env(safe-area-inset-top))' }}></div> {/* Spacer for mobile header with safe area */}


                <div className="flex-1 p-4 lg:p-8 w-full max-w-full mx-auto animate-fadeIn relative z-0 overflow-x-hidden">
                    {title && (
                        <div className="mb-8 flex items-center justify-between">
                            <motion.h2
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                                className="text-2xl md:text-3xl font-semibold text-app-text tracking-tight"
                            >
                                {title}
                            </motion.h2>
                        </div>
                    )}
                    {children}
                </div>
            </main>


            {/* Mobile Bottom Navigation (Floating Island) */}
            {showMobileNav && (
                <nav className="fixed bottom-6 left-4 right-4 z-50 bg-app-surface/90 backdrop-blur-2xl border border-app-border shadow-[0_8px_32px_rgba(0,0,0,0.12)] rounded-[32px] h-[72px] xl:hidden">

                    <div className="grid grid-cols-5 items-center h-full w-full relative z-10">
                        <Link to="/dashboard" className={`flex flex-col items-center justify-center gap-1 ${location.pathname === '/dashboard' ? 'text-app-text' : 'text-app-text-tertiary'}`}>
                            <LayoutDashboard className="w-6 h-6" strokeWidth={1.5} />
                            <span className="text-[10px] font-bold">Home</span>
                        </Link>

                        <Link to="/batches" className={`flex flex-col items-center justify-center gap-1 ${location.pathname.startsWith('/batches') ? 'text-app-text' : 'text-app-text-tertiary'}`}>
                            <Users className="w-6 h-6" strokeWidth={1.5} />
                            <span className="text-[10px] font-bold">Batches</span>
                        </Link>

                        {/* Spacer for Scan Button */}
                        <div></div>

                        <Link to="/tests" className={`flex flex-col items-center justify-center gap-1 ${location.pathname.startsWith('/tests') ? 'text-app-text' : 'text-app-text-tertiary'}`}>
                            <FileText className="w-6 h-6" strokeWidth={1.5} />
                            <span className="text-[10px] font-bold">Tests</span>
                        </Link>

                        <Link to="/fees" className={`flex flex-col items-center justify-center gap-1 ${location.pathname.startsWith('/fees') ? 'text-app-text' : 'text-app-text-tertiary'}`}>
                            <Receipt className="w-6 h-6" strokeWidth={1.5} />
                            <span className="text-[10px] font-bold">Fees</span>
                        </Link>
                    </div>

                    {/* Floating Log Fee Button */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80px] h-[80px] z-20">
                        <button
                            onClick={() => setShowQuickFeeModal(true)}
                            className="flex w-full h-full bg-app-text rounded-full items-center justify-center text-app-bg shadow-xl border-[6px] border-app-bg overflow-hidden active:scale-95 transition-all group"
                        >
                            <Zap className="w-8 h-8" fill="currentColor" />
                            <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    </div>
                </nav>
            )}

            {/* PWA Install Prompt */}
            <PWAInstallPrompt />
        </div >
    );
}
