import { Building2, Headphones, LayoutDashboard, Megaphone, MessagesSquare, Settings2, WalletCards } from 'lucide-react';
import { supportFeatureEnabled } from '../../config/featureFlags';

const baseSuperAdminNavigation = [
  { id: 'home', label: 'Home', href: '/super-admin', icon: LayoutDashboard, group: 'Operate' },
  { id: 'institutes', label: 'Institutes', href: '/super-admin/institutes', icon: Building2, group: 'Operate' },
  { id: 'revenue', label: 'Revenue', href: '/super-admin/revenue', icon: WalletCards, group: 'Operate' },
  { id: 'marketplace', label: 'Marketplace', href: '/super-admin/marketplace', icon: Megaphone, group: 'Grow' },
  { id: 'support', label: 'Support', href: '/super-admin/support', icon: Headphones, group: 'Serve' },
  { id: 'communications', label: 'Communications', href: '/super-admin/communications', icon: MessagesSquare, group: 'Serve' },
  { id: 'system', label: 'System', href: '/super-admin/system', icon: Settings2, group: 'Platform' }
] as const;

export type SuperAdminNavigationItem = (typeof baseSuperAdminNavigation)[number];

export function getSuperAdminNavigation(supportEnabled = supportFeatureEnabled): SuperAdminNavigationItem[] {
  return baseSuperAdminNavigation.filter(item => supportEnabled || item.id !== 'support');
}
