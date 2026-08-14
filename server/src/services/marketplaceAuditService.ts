import type { Prisma } from '@prisma/client';

export type MarketplaceAuditEvent = {
  action: string;
  entityType: string;
  entityId: string;
  actorAdminId?: string;
  instituteId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
};

export async function writeMarketplaceAudit(
  tx: Prisma.TransactionClient,
  event: MarketplaceAuditEvent
): Promise<void> {
  await tx.marketplaceAuditLog.create({ data: event });
}
