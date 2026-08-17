import { Activity, AlertTriangle, Building2, CheckCircle2, Database, Headphones, KeyRound, UsersRound } from 'lucide-react';
import { supportFeatureEnabled } from '../../config/featureFlags';
import type { SystemOverview } from '../superadmin-system/api';
import type { AttentionItem, SuperAdminHomeData } from './types';

export function visibleHomeAttention(items: readonly AttentionItem[], supportEnabled = supportFeatureEnabled): AttentionItem[] {
  return items.filter(item => supportEnabled || item.kind !== 'SUPPORT');
}

export function buildHomeMetrics(data: Pick<SuperAdminHomeData, 'metrics'>, supportEnabled = supportFeatureEnabled) {
  return [
    { label: 'Institutes', value: data.metrics.totalInstitutes, href: '/super-admin/institutes', icon: Building2 },
    { label: 'Active', value: data.metrics.activeInstitutes, href: '/super-admin/institutes?status=ACTIVE', icon: CheckCircle2 },
    { label: 'Open claims', value: data.metrics.openClaims, href: '/super-admin/marketplace?section=claims', icon: UsersRound },
    { label: 'Failed leads', value: data.metrics.failedLeadDeliveries, href: '/super-admin/marketplace?section=leads', icon: AlertTriangle },
    ...(supportEnabled ? [{ label: 'Open support', value: data.metrics.openSupportTickets, href: '/super-admin/support', icon: Headphones }] : [])
  ];
}

export function buildSystemMetrics(overview: SystemOverview, supportEnabled = supportFeatureEnabled) {
  return [
    { label: 'Database latency', value: `${overview.database.latencyMs} ms`, icon: Database },
    { label: 'Failed jobs', value: overview.jobs.failedTotal, icon: AlertTriangle },
    { label: 'Auth failures · 24h', value: overview.security.authFailures24h, icon: KeyRound },
    ...(supportEnabled ? [{ label: 'Active support sessions', value: overview.security.activeSupportSessions, icon: Activity }] : [])
  ];
}
