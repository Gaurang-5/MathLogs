import { describe, expect, it } from 'vitest';
import { buildHomeMetrics, buildSystemMetrics, visibleHomeAttention } from '../../features/superadmin-shell/supportVisibility';

describe('Superadmin Support indicators', () => {
  const home = {
    metrics: { totalInstitutes: 2, activeInstitutes: 1, openClaims: 3, pendingReviews: 0, failedLeadDeliveries: 4, openSupportTickets: 5 },
    attention: [{ id: 'support:1', kind: 'SUPPORT', severity: 'TODAY', title: 'Ticket', detail: 'Details', entityId: '1', createdAt: new Date().toISOString(), action: { label: 'Open', href: '/super-admin/support/tickets/1' } }],
    recentActivity: [],
    system: { failedWhatsappJobs: 0, failedEmailJobs: 0, status: 'HEALTHY' }
  } as const;

  it('omits Support metrics and attention while disabled', () => {
    expect(buildHomeMetrics(home, false).map(item => item.label)).not.toContain('Open support');
    expect(visibleHomeAttention(home.attention, false)).toEqual([]);
  });

  it('retains Support indicators when explicitly enabled', () => {
    expect(buildHomeMetrics(home, true).map(item => item.label)).toContain('Open support');
    expect(visibleHomeAttention(home.attention, true)).toHaveLength(1);
  });

  it('omits active support sessions from System while disabled', () => {
    const overview = { database: { latencyMs: 12 }, jobs: { failedTotal: 0 }, security: { authFailures24h: 1, activeSupportSessions: 2 } } as never;
    expect(buildSystemMetrics(overview, false).map(item => item.label)).not.toContain('Active support sessions');
    expect(buildSystemMetrics(overview, true).map(item => item.label)).toContain('Active support sessions');
  });
});
