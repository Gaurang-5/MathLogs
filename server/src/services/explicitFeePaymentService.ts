import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export class FeeAllocationError extends Error {
  constructor(message: string, public statusCode = 400) { super(message); }
}
export function amountPaise(value: unknown): number {
  const text = String(value);
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new FeeAllocationError('Enter a positive amount with at most two decimal places.');
  const [whole, fraction = ''] = text.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result <= 0) throw new FeeAllocationError('Invalid payment amount.');
  return result;
}
export type FeeAllocation = { installmentId: string; amount: number | string };
type Actor = { id: string; instituteId: string; role?: string };

export async function loadPaymentOptions(tx: Prisma.TransactionClient, studentId: string, actor: Actor) {
  const student = await tx.student.findUnique({ where: { id: studentId }, include: {
    enrollments: { where: { status: 'ACTIVE' }, include: { batch: { include: { feeInstallments: true } } } },
    feePayments: true, feeAssignments: true, fees: true,
  } });
  if (!student || student.instituteId !== actor.instituteId) throw new FeeAllocationError('Student not found.', 404);
  if (!student.enrollments.some(e => !e.batch.teacherId || e.batch.teacherId === actor.id)) throw new FeeAllocationError('You cannot collect fees for this student.', 403);
  const rows = student.enrollments.filter(e => !e.batch.teacherId || e.batch.teacherId === actor.id).flatMap(e =>
    e.batch.feeInstallments.filter(i => i.studentId === student.id || (!i.studentId && (
      (e.feeDecision === 'LEGACY' && i.createdAt >= e.startedAt) || student.feeAssignments.some(a => a.installmentId === i.id) || student.feePayments.some(p => p.installmentId === i.id)
    ))).map(i => ({ ...i, batchName: e.batch.name })));
  // Legacy unlinked receipts already cover some dues; do not collect those amounts again.
  let generic = student.fees.filter(f => f.status === 'PAID').reduce((n, f) => n + Math.round(f.amount * 100), 0);
  const seen = new Set<string>();
  const installments = rows.sort((a,b) => a.createdAt.getTime() - b.createdAt.getTime()).filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; }).map(i => {
    const total = Math.round(i.amount * 100);
    const direct = student.feePayments.filter(p => p.installmentId === i.id).reduce((n,p) => n + Math.round(p.amountPaid * 100), 0);
    const credit = Math.min(Math.max(0, total - direct), generic); generic -= credit;
    return { id: i.id, name: i.name, batchName: i.batchName, amount: total / 100, paid: (direct + credit) / 100, remaining: Math.max(0, total - direct - credit) / 100 };
  });
  return { student, installments };
}

export function validateFeeAllocations(amount: unknown, allocations: FeeAllocation[], options: Array<{id: string; remaining: number}>) {
  const received = amountPaise(amount);
  if (!Array.isArray(allocations) || !allocations.length || allocations.length > 100) throw new FeeAllocationError('Select the installment this payment belongs to.');
  const seen = new Set<string>();
  const selected = allocations.map(a => {
    if (!a || typeof a.installmentId !== 'string' || seen.has(a.installmentId)) throw new FeeAllocationError('Select each installment only once.');
    seen.add(a.installmentId);
    const option = options.find(i => i.id === a.installmentId);
    if (!option) throw new FeeAllocationError('An installment is not applicable to this student. Refresh and select again.');
    const paise = amountPaise(a.amount);
    if (paise > Math.round(option.remaining * 100)) throw new FeeAllocationError('The allocated amount exceeds the installment balance. Refresh the outstanding fees.', 409);
    return { installmentId: a.installmentId, paise };
  });
  if (selected.reduce((n,a) => n + a.paise, 0) !== received) throw new FeeAllocationError('Allocated amounts must exactly match the amount received.');
  return selected;
}

export async function collectExplicitPayment(input: {studentId: string; amount: unknown; allocations: FeeAllocation[]; idempotencyKey: string; verificationId?: string}, actor: Actor) {
  if (typeof input.idempotencyKey !== 'string' || input.idempotencyKey.length < 8 || input.idempotencyKey.length > 150) throw new FeeAllocationError('Payment reference is required. Refresh the payment form.');
  if (!Array.isArray(input.allocations) || !input.allocations.length || input.allocations.length > 100 || input.allocations.some(a => !a || typeof a.installmentId !== 'string')) throw new FeeAllocationError('Select the installment this payment belongs to.');
  const received = amountPaise(input.amount);
  const fingerprint = JSON.stringify({studentId:input.studentId, amount:received, allocations:(input.allocations || []).map(a=>({id:a.installmentId,paise:amountPaise(a.amount)})).sort((a,b)=>a.id.localeCompare(b.id)), verificationId:input.verificationId || null});
  for (let attempt=0; attempt<3; attempt++) {
    try { return await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Student" WHERE id=${input.studentId} AND "instituteId"=${actor.instituteId} FOR UPDATE`;
      const {student, installments} = await loadPaymentOptions(tx, input.studentId, actor);
      const key = `fee-payment:${actor.id}:${input.idempotencyKey}`;
      const previous = await tx.enrollmentAction.findUnique({where:{instituteId_idempotencyKey:{instituteId:actor.instituteId,idempotencyKey:key}}});
      if (previous) {
        const saved = previous.result as any;
        if (saved.fingerprint !== fingerprint) throw new FeeAllocationError('This payment reference was already used for different details.',409);
        return {...saved.response,replayed:true};
      }
      const selected = validateFeeAllocations(input.amount,input.allocations,installments);
      if (input.verificationId) {
        const verification = await tx.upiPaymentVerification.findUnique({where:{id:input.verificationId}});
        if (!verification || verification.instituteId!==actor.instituteId || verification.studentId!==student.id || amountPaise(verification.amount)!==received) throw new FeeAllocationError('Receipt does not match this payment.',400);
        if (verification.status!=='PENDING') throw new FeeAllocationError('This receipt was already processed.',409);
        const claimed = await tx.upiPaymentVerification.updateMany({where:{id:verification.id,status:'PENDING'},data:{status:'APPROVED'}});
        if (claimed.count!==1) throw new FeeAllocationError('This receipt was already processed.',409);
      }
      const payments=[];
      for (const allocation of selected) payments.push(await tx.feePayment.create({data:{studentId:student.id,installmentId:allocation.installmentId,amountPaid:allocation.paise/100}}));
      const response={success:true,studentId:student.id,amount:received/100,paymentIds:payments.map(p=>p.id),allocations:selected.map(a=>({installmentId:a.installmentId,name:installments.find(i=>i.id===a.installmentId)!.name,amount:a.paise/100})),replayed:false};
      await tx.systemLog.create({data:{instituteId:actor.instituteId,action:'FEE_COLLECTED',entityId:student.id,entityName:student.name,details:{type:'Teacher-selected installments',...response,verificationId:input.verificationId || null}}});
      await tx.enrollmentAction.create({data:{instituteId:actor.instituteId,idempotencyKey:key,action:'EXPLICIT_FEE_PAYMENT',result:{fingerprint,response}}});
      return response;
    },{isolationLevel:'Serializable',timeout:30000}); }
    catch(e:any) { if((e.code!=='P2034' && e.code!=='P2002')||attempt===2) throw e; }
  }
  throw new FeeAllocationError('Payment is busy. Retry using the same payment reference.',409);
}
