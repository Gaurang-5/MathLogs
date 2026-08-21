import type { Prisma } from '@prisma/client';

type MonthCoverageDeletionClient = Pick<
  Prisma.TransactionClient,
  'monthCoverageAuditEvent' | 'monthCoverageAllocation' | 'monthCoveragePayment' | 'studentMonthCoverageProfile'
>;

export async function deleteMonthCoverageData(client: MonthCoverageDeletionClient, instituteId: string): Promise<void> {
  await client.monthCoverageAuditEvent.deleteMany({ where: { instituteId } });
  await client.monthCoverageAllocation.deleteMany({ where: { instituteId } });
  await client.monthCoveragePayment.deleteMany({ where: { instituteId } });
  await client.studentMonthCoverageProfile.deleteMany({ where: { instituteId } });
}
