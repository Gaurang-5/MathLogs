import 'dotenv/config';
import type { PrismaClient } from '@prisma/client';
import { MARKETPLACE_CITY } from '../domain/marketplace/location';
import { prisma } from '../prisma';
import { writeMarketplaceAudit } from '../services/marketplaceAuditService';

export const ADL_MARKETPLACE_ID = 'a47ee396-1e04-4fbe-8dd4-1217604f519c';
export const ADL_MARKETPLACE_NAME = 'ADL Accountancy Classes';

export async function backfillAdlMarketplaceCity(client: PrismaClient = prisma) {
  return client.$transaction(async tx => {
    const before = await tx.institute.findUnique({ where: { id: ADL_MARKETPLACE_ID } });
    if (!before || before.name !== ADL_MARKETPLACE_NAME) {
      throw new Error('ADL target validation failed');
    }
    if (before.city === MARKETPLACE_CITY) {
      return { changed: false, city: MARKETPLACE_CITY };
    }
    if (before.city !== null) {
      throw new Error(`Unexpected ADL city: ${before.city}`);
    }

    const after = await tx.institute.update({
      where: { id: ADL_MARKETPLACE_ID },
      data: { city: MARKETPLACE_CITY },
    });
    await writeMarketplaceAudit(tx, {
      action: 'LISTING_UPDATED',
      entityType: 'Institute',
      entityId: ADL_MARKETPLACE_ID,
      instituteId: ADL_MARKETPLACE_ID,
      before: { city: before.city },
      after: { city: after.city },
      metadata: {
        changedFields: ['city'],
        source: 'marketplace-location-seo-backfill',
      },
    });
    return { changed: true, city: MARKETPLACE_CITY };
  });
}

if (require.main === module) {
  backfillAdlMarketplaceCity()
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
