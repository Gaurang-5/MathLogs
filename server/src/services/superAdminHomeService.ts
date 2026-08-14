import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

const DAY_MS = 86_400_000;
const LEGACY_CLAIM_MARKER = '[CLAIM REQUEST]';

type AttentionSeverity = 'CRITICAL' | 'TODAY' | 'UPCOMING';
type AttentionKind = 'CLAIM' | 'REVIEW' | 'LEAD_DELIVERY' | 'PLAN_EXPIRY' | 'JOB';

interface AttentionItem {
  id: string;
  kind: AttentionKind;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  instituteId?: string;
  entityId: string;
  createdAt: Date;
  action: { label: string; href: string };
}

const instituteSummarySelect = {
  id: true,
  name: true,
  teacherName: true,
  phoneNumber: true,
  email: true,
  status: true,
  plan: true,
  city: true,
  ownershipStatus: true,
  isPubliclyListed: true,
  updatedAt: true
} satisfies Prisma.InstituteSelect;

function severityRank(severity: AttentionSeverity): number {
  return severity === 'CRITICAL' ? 0 : severity === 'TODAY' ? 1 : 2;
}

export async function getSuperAdminHome() {
  const now = new Date();
  const inSevenDays = new Date(now.getTime() + 7 * DAY_MS);
  const inThirtyDays = new Date(now.getTime() + 30 * DAY_MS);

  const [
    totalInstitutes,
    activeInstitutes,
    openClaimsCount,
    pendingReviewsCount,
    failedLeadDeliveriesCount,
    claims,
    reviews,
    failedLeads,
    nearPlanExpiries,
    failedWhatsappJobs,
    failedEmailJobs,
    superAdminActivity,
    marketplaceActivity
  ] = await Promise.all([
    prisma.institute.count(),
    prisma.institute.count({ where: { status: 'ACTIVE' } }),
    prisma.marketplaceClaim.count({ where: { status: { in: ['NEW', 'CONTACTED'] } } }),
    prisma.review.count({ where: { status: 'PENDING', source: 'MATHLOGS' } }),
    prisma.leadInquiry.count({
      where: { deliveryStatus: 'FAILED', NOT: { studentName: { startsWith: LEGACY_CLAIM_MARKER } } }
    }),
    prisma.marketplaceClaim.findMany({
      where: { status: { in: ['NEW', 'CONTACTED'] } },
      select: { id: true, instituteId: true, claimantName: true, status: true, createdAt: true, institute: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 20
    }),
    prisma.review.findMany({
      where: { status: 'PENDING', source: 'MATHLOGS' },
      select: { id: true, instituteId: true, reviewerName: true, rating: true, createdAt: true, institute: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 20
    }),
    prisma.leadInquiry.findMany({
      where: { deliveryStatus: 'FAILED', NOT: { studentName: { startsWith: LEGACY_CLAIM_MARKER } } },
      select: { id: true, instituteId: true, studentName: true, createdAt: true, institute: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 20
    }),
    prisma.institute.findMany({
      where: { planExpiryDate: { gte: now, lte: inThirtyDays }, status: 'ACTIVE' },
      select: { id: true, name: true, plan: true, planExpiryDate: true },
      orderBy: { planExpiryDate: 'asc' },
      take: 30
    }),
    prisma.whatsappJob.findMany({
      where: { status: 'FAILED' }, select: { id: true, instituteId: true, templateId: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 10
    }),
    prisma.emailJob.findMany({
      where: { status: 'FAILED' }, select: { id: true, instituteId: true, subject: true, createdAt: true },
      orderBy: { createdAt: 'desc' }, take: 10
    }),
    prisma.superAdminAuditLog.findMany({
      select: { id: true, action: true, entityType: true, entityId: true, instituteId: true, createdAt: true, actorAdmin: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' }, take: 15
    }),
    prisma.marketplaceAuditLog.findMany({
      select: { id: true, action: true, entityType: true, entityId: true, instituteId: true, createdAt: true, actorAdmin: { select: { id: true, username: true } } },
      orderBy: { createdAt: 'desc' }, take: 15
    })
  ]);

  const attention: AttentionItem[] = [
    ...claims.map((claim) => ({
      id: `claim:${claim.id}`,
      kind: 'CLAIM' as const,
      severity: 'TODAY' as const,
      title: `Ownership claim for ${claim.institute.name}`,
      detail: `${claim.claimantName} is awaiting manual verification`,
      instituteId: claim.instituteId,
      entityId: claim.id,
      createdAt: claim.createdAt,
      action: { label: 'Review claim', href: `/super-admin/marketplace/claims/${claim.id}` }
    })),
    ...reviews.map((review) => ({
      id: `review:${review.id}`,
      kind: 'REVIEW' as const,
      severity: 'TODAY' as const,
      title: `Review awaiting moderation`,
      detail: `${review.reviewerName} rated ${review.institute.name} ${review.rating}/5`,
      instituteId: review.instituteId,
      entityId: review.id,
      createdAt: review.createdAt,
      action: { label: 'Moderate review', href: `/super-admin/marketplace/reviews?review=${review.id}` }
    })),
    ...failedLeads.map((lead) => ({
      id: `lead:${lead.id}`,
      kind: 'LEAD_DELIVERY' as const,
      severity: 'CRITICAL' as const,
      title: `Student lead delivery failed`,
      detail: `${lead.studentName}'s enquiry did not reach ${lead.institute.name}`,
      instituteId: lead.instituteId,
      entityId: lead.id,
      createdAt: lead.createdAt,
      action: { label: 'Retry delivery', href: `/super-admin/marketplace/leads?lead=${lead.id}` }
    })),
    ...nearPlanExpiries.map((institute) => ({
      id: `plan:${institute.id}`,
      kind: 'PLAN_EXPIRY' as const,
      severity: (institute.planExpiryDate! <= inSevenDays ? 'TODAY' : 'UPCOMING') as AttentionSeverity,
      title: `${institute.name} plan expires soon`,
      detail: `${institute.plan} expires ${institute.planExpiryDate!.toISOString().slice(0, 10)}`,
      instituteId: institute.id,
      entityId: institute.id,
      createdAt: institute.planExpiryDate!,
      action: { label: 'Review billing', href: `/super-admin/institutes/${institute.id}/billing` }
    })),
    ...failedWhatsappJobs.map((job) => ({
      id: `whatsapp:${job.id}`,
      kind: 'JOB' as const,
      severity: 'CRITICAL' as const,
      title: 'WhatsApp delivery exhausted',
      detail: `Template ${job.templateId} needs attention`,
      ...(job.instituteId ? { instituteId: job.instituteId } : {}),
      entityId: job.id,
      createdAt: job.createdAt,
      action: { label: 'Inspect job', href: `/super-admin/system/jobs?job=${job.id}` }
    })),
    ...failedEmailJobs.map((job) => ({
      id: `email:${job.id}`,
      kind: 'JOB' as const,
      severity: 'CRITICAL' as const,
      title: 'Email delivery exhausted',
      detail: `A transactional email needs attention`,
      ...(job.instituteId ? { instituteId: job.instituteId } : {}),
      entityId: job.id,
      createdAt: job.createdAt,
      action: { label: 'Inspect job', href: `/super-admin/system/jobs?job=${job.id}` }
    }))
  ].sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 50);

  const recentActivity = [
    ...superAdminActivity.map((item) => ({ ...item, source: 'SUPER_ADMIN' as const, actor: item.actorAdmin })),
    ...marketplaceActivity.map((item) => ({ ...item, source: 'MARKETPLACE' as const, actor: item.actorAdmin }))
  ]
    .map(({ actorAdmin: _actorAdmin, ...item }) => item)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20);

  return {
    metrics: { totalInstitutes, activeInstitutes, openClaims: openClaimsCount, pendingReviews: pendingReviewsCount, failedLeadDeliveries: failedLeadDeliveriesCount },
    attention,
    recentActivity,
    system: {
      failedWhatsappJobs: failedWhatsappJobs.length,
      failedEmailJobs: failedEmailJobs.length,
      status: failedWhatsappJobs.length + failedEmailJobs.length > 0 ? 'DEGRADED' : 'HEALTHY'
    }
  };
}

export async function searchSuperAdminInstitutes(query: string) {
  const q = query.trim();
  if (q.length < 2) throw new Error('SEARCH_QUERY_TOO_SHORT');
  const records = await prisma.institute.findMany({
    where: {
      OR: [
        { id: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
        { teacherName: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q } },
        { email: { contains: q, mode: 'insensitive' } }
      ]
    },
    select: instituteSummarySelect,
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    take: 12
  });
  return records.map(({ id, ...record }) => ({ instituteId: id, ...record, href: `/super-admin/institutes/${id}` }));
}
