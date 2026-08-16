import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Prisma, type Institute, type MarketplaceClaim } from '@prisma/client';
import { prisma } from '../prisma';
import { writeMarketplaceAudit } from './marketplaceAuditService';

const OPEN_CLAIM_STATUSES = ['NEW', 'CONTACTED'];

export type SubmitMarketplaceClaimInput = {
  instituteId: string;
  claimantName: string;
  phone: string;
  email?: string;
  proofNote?: string;
  notes?: string;
};

export type MarkMarketplaceClaimContactedInput = {
  claimId: string;
};

export type ApproveClaimInput = {
  claimId: string;
  actorAdminId: string;
  verificationNote: string;
};

export type RejectClaimInput = ApproveClaimInput & {
  rejectionReason: string;
};

export type ClaimDecisionResult = {
  claim: MarketplaceClaim;
  institute: Institute;
  adminId: string;
  newlyProvisioned: boolean;
};

function claimError(code: string): Error {
  return new Error(code);
}

export function normalizeMarketplacePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const normalized = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;

  if (normalized.length < 10 || normalized.length > 15) {
    throw claimError('INVALID_PHONE');
  }

  return normalized;
}

export async function submitMarketplaceClaim(
  input: SubmitMarketplaceClaimInput
): Promise<MarketplaceClaim> {
  const normalizedPhone = normalizeMarketplacePhone(input.phone);

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT TRUE AS locked
        FROM (
          SELECT pg_advisory_xact_lock(
            hashtext(${input.instituteId}),
            hashtext(${normalizedPhone})
          )
        ) AS claim_lock
      `;

      const existingClaim = await tx.marketplaceClaim.findFirst({
        where: {
          instituteId: input.instituteId,
          normalizedPhone,
          status: { in: OPEN_CLAIM_STATUSES }
        },
        orderBy: { createdAt: 'asc' }
      });

      if (existingClaim) {
        return existingClaim;
      }

      return tx.marketplaceClaim.create({
        data: {
          instituteId: input.instituteId,
          claimantName: input.claimantName,
          phone: input.phone,
          normalizedPhone,
          email: input.email?.trim() || null,
          proofNote: input.proofNote?.trim() || null,
          notes: input.notes
        }
      });
    }, { maxWait: 120_000, timeout: 120_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existingClaim = await prisma.marketplaceClaim.findFirst({
        where: {
          instituteId: input.instituteId,
          normalizedPhone,
          status: { in: OPEN_CLAIM_STATUSES }
        },
        orderBy: { createdAt: 'asc' }
      });
      if (existingClaim) return existingClaim;
    }
    throw error;
  }
}

export async function markMarketplaceClaimContacted(
  input: MarkMarketplaceClaimContactedInput
): Promise<MarketplaceClaim> {
  const contactedAt = new Date();
  const transition = await prisma.marketplaceClaim.updateMany({
    where: { id: input.claimId, status: 'NEW' },
    data: { status: 'CONTACTED', contactedAt }
  });

  if (transition.count === 0) {
    throw claimError('CLAIM_ALREADY_DECIDED');
  }

  return prisma.marketplaceClaim.findUniqueOrThrow({ where: { id: input.claimId } });
}

export async function approveMarketplaceClaim(
  input: ApproveClaimInput
): Promise<ClaimDecisionResult> {
  if (!input.verificationNote.trim()) {
    throw claimError('VERIFICATION_NOTE_REQUIRED');
  }

  return prisma.$transaction(async (tx) => {
    const existingClaim = await tx.marketplaceClaim.findUnique({ where: { id: input.claimId } });
    if (!existingClaim) {
      throw claimError('CLAIM_NOT_FOUND');
    }

    const decidedAt = new Date();
    const transition = await tx.marketplaceClaim.updateMany({
      where: { id: input.claimId, status: { in: OPEN_CLAIM_STATUSES } },
      data: {
        status: 'APPROVED',
        verificationNote: input.verificationNote.trim(),
        decidedAt,
        decidedByAdminId: input.actorAdminId
      }
    });

    if (transition.count === 0) {
      throw claimError('CLAIM_ALREADY_DECIDED');
    }

    const claim = await tx.marketplaceClaim.findUniqueOrThrow({ where: { id: input.claimId } });
    const institute = await tx.institute.findUniqueOrThrow({ where: { id: claim.instituteId } });
    const linkedAdmin = await tx.admin.findFirst({
      where: { instituteId: institute.id },
      orderBy: { id: 'asc' }
    });

    let adminId: string;
    let newlyProvisioned = false;
    let config: Prisma.InputJsonValue | undefined;

    if (linkedAdmin) {
      adminId = linkedAdmin.id;
    } else {
      const existingPhoneUsername = await tx.admin.findUnique({
        where: { username: claim.normalizedPhone },
        select: { id: true }
      });
      const username = existingPhoneUsername
        ? `${claim.normalizedPhone}-${institute.id.slice(0, 8)}`
        : claim.normalizedPhone;
      const password = await bcrypt.hash(randomBytes(16).toString('hex'), 10);
      const provisionedAdmin = await tx.admin.create({
        data: {
          username,
          password,
          instituteId: institute.id,
          role: 'INSTITUTE_ADMIN'
        }
      });

      adminId = provisionedAdmin.id;
      newlyProvisioned = true;
      config = isJsonObject(institute.config) ? institute.config : {};
    }

    const updatedInstitute = await tx.institute.update({
      where: { id: institute.id },
      data: {
        ownershipStatus: 'CLAIMED',
        claimedPhone: claim.normalizedPhone,
        claimedAt: decidedAt,
        isVerified: true,
        isPubliclyListed: true,
        plan: 'MARKETPLACE',
        billingCycle: 'ONE_TIME',
        marketplaceAccessGrantedAt: institute.marketplaceAccessGrantedAt ?? decidedAt,
        status: 'ACTIVE',
        phoneNumber: claim.normalizedPhone,
        publicPhone: institute.publicPhone || claim.normalizedPhone,
        ...(config === undefined ? {} : { config })
      }
    });

    await writeMarketplaceAudit(tx, {
      action: 'CLAIM_APPROVED',
      entityType: 'MarketplaceClaim',
      entityId: claim.id,
      actorAdminId: input.actorAdminId,
      instituteId: institute.id,
      before: { status: existingClaim.status },
      after: { status: claim.status },
      metadata: { verificationNote: input.verificationNote }
    });
    await writeMarketplaceAudit(tx, {
      action: 'LISTING_VERIFIED',
      entityType: 'Institute',
      entityId: institute.id,
      actorAdminId: input.actorAdminId,
      instituteId: institute.id,
      before: {
        ownershipStatus: institute.ownershipStatus,
        isVerified: institute.isVerified,
        isPubliclyListed: institute.isPubliclyListed
      },
      after: {
        ownershipStatus: updatedInstitute.ownershipStatus,
        isVerified: updatedInstitute.isVerified,
        isPubliclyListed: updatedInstitute.isPubliclyListed
      }
    });

    return { claim, institute: updatedInstitute, adminId, newlyProvisioned };
  }, { maxWait: 120_000, timeout: 120_000 });
}

export async function rejectMarketplaceClaim(input: RejectClaimInput): Promise<ClaimDecisionResult> {
  if (!input.verificationNote.trim()) {
    throw claimError('VERIFICATION_NOTE_REQUIRED');
  }
  if (!input.rejectionReason.trim()) {
    throw claimError('REJECTION_REASON_REQUIRED');
  }

  return prisma.$transaction(async (tx) => {
    const existingClaim = await tx.marketplaceClaim.findUnique({ where: { id: input.claimId } });
    if (!existingClaim) {
      throw claimError('CLAIM_NOT_FOUND');
    }

    const decidedAt = new Date();
    const transition = await tx.marketplaceClaim.updateMany({
      where: { id: input.claimId, status: { in: OPEN_CLAIM_STATUSES } },
      data: {
        status: 'REJECTED',
        verificationNote: input.verificationNote.trim(),
        rejectionReason: input.rejectionReason.trim(),
        decidedAt,
        decidedByAdminId: input.actorAdminId
      }
    });

    if (transition.count === 0) {
      throw claimError('CLAIM_ALREADY_DECIDED');
    }

    const claim = await tx.marketplaceClaim.findUniqueOrThrow({ where: { id: input.claimId } });
    const institute = await tx.institute.findUniqueOrThrow({ where: { id: claim.instituteId } });
    const linkedAdmin = await tx.admin.findFirst({
      where: { instituteId: institute.id },
      orderBy: { id: 'asc' }
    });

    await writeMarketplaceAudit(tx, {
      action: 'CLAIM_REJECTED',
      entityType: 'MarketplaceClaim',
      entityId: claim.id,
      actorAdminId: input.actorAdminId,
      instituteId: institute.id,
      before: { status: existingClaim.status },
      after: { status: claim.status },
      metadata: {
        verificationNote: input.verificationNote,
        rejectionReason: input.rejectionReason
      }
    });

    return {
      claim,
      institute,
      adminId: linkedAdmin?.id ?? '',
      newlyProvisioned: false
    };
  }, { maxWait: 120_000, timeout: 120_000 });
}

function isJsonObject(value: Prisma.JsonValue | null): value is Prisma.JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
