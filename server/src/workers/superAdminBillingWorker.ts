import { prisma } from '../prisma';
import { applyBillingOperationById } from '../services/superAdminRevenueService';

export async function processDueSuperAdminBillingOperations(limit = 25): Promise<number> {
  const now = new Date();
  const operations = await prisma.superAdminBillingOperation.findMany({
    where: {
      status: 'PENDING',
      OR: [{ effectiveAt: null }, { effectiveAt: { lte: now } }],
      AND: [{ OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }]
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: limit
  });
  const results = await Promise.allSettled(operations.map(operation => applyBillingOperationById(operation.id)));
  return results.filter(result => result.status === 'fulfilled' && result.value === 'APPLIED').length;
}

export function startSuperAdminBillingWorker() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processDueSuperAdminBillingOperations();
    } finally {
      running = false;
    }
  };
  void tick();
  const interval = setInterval(() => void tick(), 30_000);
  interval.unref();
  return interval;
}
