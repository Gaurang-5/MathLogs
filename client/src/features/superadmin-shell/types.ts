export type SuperAdminActionClass =
  | 'SUPPORT_SESSION'
  | 'PLAN_REVOKE'
  | 'BILLING_ADJUSTMENT'
  | 'ADMIN_ACCESS_CHANGE'
  | 'SENSITIVE_CONFIGURATION'
  | 'TARGETED_COMMUNICATION'
  | 'INSTITUTE_DELETE'
  | 'SYSTEM_SESSION_REVOKE';

export type AttentionItem = {
  id: string;
  kind: 'CLAIM' | 'REVIEW' | 'LEAD_DELIVERY' | 'PLAN_EXPIRY' | 'SUPPORT' | 'JOB';
  severity: 'CRITICAL' | 'TODAY' | 'UPCOMING';
  title: string;
  detail: string;
  instituteId?: string;
  entityId: string;
  createdAt: string;
  action: { label: string; href: string };
};

export type SuperAdminHomeData = {
  metrics: {
    totalInstitutes: number;
    activeInstitutes: number;
    openClaims: number;
    pendingReviews: number;
    failedLeadDeliveries: number;
    openSupportTickets: number;
  };
  attention: AttentionItem[];
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    instituteId?: string | null;
    source: 'SUPER_ADMIN' | 'MARKETPLACE';
    createdAt: string;
    actor?: { id: string; username: string } | null;
  }>;
  system: { failedWhatsappJobs: number; failedEmailJobs: number; status: 'HEALTHY' | 'DEGRADED' };
};

export type InstituteSearchResult = {
  instituteId: string;
  name: string;
  teacherName: string | null;
  phoneNumber: string | null;
  email: string | null;
  status: string;
  plan: string;
  city: string | null;
  ownershipStatus: string;
  isPubliclyListed: boolean;
  updatedAt: string;
  href: string;
};
