import { CreditCard, FileText, Headphones, LayoutDashboard, ReceiptIndianRupee, Scan, Settings, Sparkles, Store, Users } from 'lucide-react';

type InstituteNavigationItem = { name: string; path: string; icon: typeof LayoutDashboard };

export function getInstituteNavigation({ isPageOnly, isQuizOnly, supportEnabled }: { isPageOnly: boolean; isQuizOnly: boolean; supportEnabled: boolean }): InstituteNavigationItem[] {
  const support = supportEnabled ? [{ name: 'Support', path: '/support', icon: Headphones }] : [];
  if (isPageOnly) return [
    { name: 'Marketplace Listing', path: '/marketplace-settings', icon: Store },
    { name: 'Upgrade ERP Plan', path: '/billing', icon: CreditCard },
    ...support,
    { name: 'Settings', path: '/settings', icon: Settings },
  ];
  if (isQuizOnly) return [
    { name: 'Quizzes', path: '/quizzes', icon: Sparkles },
    { name: 'Marketplace Listing', path: '/marketplace-settings', icon: Store },
    { name: 'Buy Credits', path: '/billing', icon: CreditCard },
    ...support,
    { name: 'Settings', path: '/settings', icon: Settings },
  ];
  return [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Batches', path: '/batches', icon: Users },
    { name: 'Tests', path: '/tests', icon: FileText },
    { name: 'Quizzes', path: '/quizzes', icon: Sparkles },
    { name: 'Scan Marks', path: '/scan', icon: Scan },
    { name: 'Fees', path: '/fees', icon: ReceiptIndianRupee },
    { name: 'Marketplace Listing', path: '/marketplace-settings', icon: Store },
    { name: 'Billing', path: '/billing', icon: CreditCard },
    ...support,
    { name: 'Settings', path: '/settings', icon: Settings },
  ];
}
