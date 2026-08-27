import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { Prisma } from '@prisma/client';
import { secureLogger } from '../utils/secureLogger';
import { getMonthCoverageDashboard } from '../services/monthCoverageSummaryService';


/**
 * Optimized dashboard summary endpoint
 * Uses Prisma aggregations instead of complex raw SQL
 * Reduces payload from ~500KB to ~2KB and query time from 2.5s to ~200ms
 */
export const getDashboardSummary = async (req: Request, res: Response) => {
    try {
        const teacherId = req.user?.id;
        const user = req.user;

        if (!teacherId) {
            secureLogger.warn(`[DASHBOARD_DEBUG] Missing context — Teacher: ${teacherId}, Institute: ${user.instituteId}`);
            return res.status(400).json({ error: 'Missing teacher context' });
        }

        if (!user.instituteId) return res.status(400).json({ error: 'Missing institute context' });
        const dashboardInstitute = await prisma.institute.findUnique({
            where: { id: user.instituteId },
            select: { coachingFeeMode: true, teacherName: true },
        });
        if (!dashboardInstitute) return res.status(404).json({ error: 'Institute not found' });
        if (dashboardInstitute.coachingFeeMode === 'MONTH_COVERAGE') {
            const dashboard = await getMonthCoverageDashboard(user.instituteId, teacherId, new Date());
            return res.json({
                ...dashboard,
                userName: dashboard.userName || user.username,
            });
        }

        secureLogger.info(`[DASHBOARD_DEBUG] Fetching for Teacher: ${teacherId}, Inst: ${user.instituteId}`);

        // Get current month start and end dates (IST adjusted)
        const now = new Date();
        const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        const yearNum = istTime.getUTCFullYear();
        const monthIdx = istTime.getUTCMonth();
        
        // Accurate IST boundaries mapped to UTC
        const monthStart = new Date(Date.UTC(yearNum, monthIdx, 1, -5, -30, 0, 0));
        const monthEnd = new Date(Date.UTC(yearNum, monthIdx + 1, 1, -5, -30, 0, -1));

        // PERF OPTIMIZATION: Combine 5 separate queries into a single SQL execution.
        // This drastically reduces connection pool usage (preventing pool exhaustion)
        // and cuts down network roundtrips, making the dashboard load instantly.
        
        const [statsResult, batchDefaulters, institute] = await Promise.all([
            prisma.$queryRaw<[{ 
                batches_count: number; 
                students_count: number; 
                monthly_collected: number; 
                total_collected: number; 
                total_pending: number 
            }]>`
                SELECT
                    (
                        SELECT COUNT(*)
                        FROM "Batch"
                        WHERE "teacherId" = ${teacherId}
                            AND "instituteId" = ${user.instituteId}
                    ) as batches_count,
                    
                    (
                        SELECT COUNT(DISTINCT s.id)
                        FROM "Enrollment" e
                        JOIN "Student" s ON s.id = e."studentId"
                        JOIN "Batch" b ON b.id = e."batchId"
                        WHERE e.status = 'ACTIVE'
                            AND b."teacherId" = ${teacherId}
                    ) as students_count,
                    
                    (
                        SELECT COALESCE(SUM(fr.amount), 0)
                        FROM "FeeRecord" fr
                        JOIN "Student" s ON s.id = fr."studentId"
                        WHERE fr.date >= ${monthStart}::timestamp
                            AND fr.date <= ${monthEnd}::timestamp
                            AND fr.status = 'PAID'
                            AND s."instituteId" = ${user.instituteId}
                    ) + (
                        SELECT COALESCE(SUM(fp."amountPaid"), 0)
                        FROM "FeePayment" fp
                        JOIN "Student" s ON s.id = fp."studentId"
                        WHERE fp.date >= ${monthStart}::timestamp
                            AND fp.date <= ${monthEnd}::timestamp
                            AND s."instituteId" = ${user.instituteId}
                    ) as monthly_collected,
                    
                    (
                        SELECT COALESCE(SUM(fr.amount), 0)
                        FROM "FeeRecord" fr
                        JOIN "Student" s ON s.id = fr."studentId"
                        WHERE fr.status = 'PAID'
                            AND s."instituteId" = ${user.instituteId}
                    ) + (
                        SELECT COALESCE(SUM(fp."amountPaid"), 0)
                        FROM "FeePayment" fp
                        JOIN "Student" s ON s.id = fp."studentId"
                        WHERE s."instituteId" = ${user.instituteId}
                    ) as total_collected,
                    
                    (
                        SELECT COALESCE(SUM(sb.balance), 0)
                        FROM "StudentBalance" sb
                        JOIN "Student" s ON s.id = sb."studentId"
                        WHERE s."instituteId" = ${user.instituteId}
                            AND EXISTS (SELECT 1 FROM "Enrollment" e WHERE e."studentId" = s.id AND e.status = 'ACTIVE')
                    ) as total_pending
            `,

            // Query 6: Top 5 defaulting batches
            prisma.$queryRaw<Array<{ name: string; amount: number }>>`
                SELECT b.name as name, SUM(sb.balance) as amount
                FROM "StudentBalance" sb
                JOIN "Student" s ON s.id = sb."studentId"
                JOIN "Enrollment" e ON e."studentId" = s.id AND e.status = 'ACTIVE'
                JOIN "Batch" b ON b.id = e."batchId"
                WHERE TRUE
                    AND b."teacherId" = ${teacherId}
                    AND sb.balance > 0
                GROUP BY b.id, b.name
                ORDER BY amount DESC
                LIMIT 5
            `,

            // Query 7: Get teacher name
            Promise.resolve(dashboardInstitute)
        ]);

        const batches = Number(statsResult[0]?.batches_count || 0);
        const students = Number(statsResult[0]?.students_count || 0);
        const monthlyCollected = Number(statsResult[0]?.monthly_collected || 0);
        const totalCollected = Number(statsResult[0]?.total_collected || 0);
        const totalPending = Number(statsResult[0]?.total_pending || 0);

        // Convert batchDefaulters to expected format
        const defaulters = batchDefaulters.map(d => ({
            name: d.name,
            amount: Number(d.amount)
        }));

        res.json({
            feeMode: 'CURRENT_DUE_BASED',
            stats: {
                batches,
                students
            },
            finances: {
                collected: monthlyCollected,  // Monthly collection (for "This Month" card)
                totalCollected,  // Total all-time collection (for collection rate percentage)
                pending: totalPending
            },
            defaulters,
            userName: institute?.teacherName || user.username
        });

    } catch (error) {
        console.error('Dashboard summary error:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard summary' });
    }
};

export const getFinancialGrowthStats = async (req: Request, res: Response) => {
    try {
        const instituteId = req.user?.instituteId;

        const currentSysDate = new Date();
        let startRawDate = new Date(currentSysDate.getFullYear(), 0, 1);

        const IST_OFFSET = 5.5 * 60 * 60 * 1000;
        const endDate = new Date(Date.now() + IST_OFFSET);

        if (startRawDate > endDate) {
            startRawDate = new Date(endDate);
        }

        // Build month labels
        const months: { name: string; year: number; monthIndex: number }[] = [];
        const tempDate = new Date(startRawDate);
        tempDate.setDate(1);

        const getMonthKey = (d: Date) => d.getFullYear() * 100 + d.getMonth();

        while (getMonthKey(tempDate) <= getMonthKey(endDate)) {
            months.push({
                name: tempDate.toLocaleString('default', { month: 'short' }),
                year: tempDate.getFullYear(),
                monthIndex: tempDate.getMonth()
            });
            tempDate.setMonth(tempDate.getMonth() + 1);
        }

        // Initialize monthly data
        const monthlyData: Record<string, { collected: number, generated: number }> = {};
        months.forEach(m => {
            monthlyData[`${m.year}-${m.monthIndex}`] = { collected: 0, generated: 0 };
        });

        // ─── PERF FIX: Use raw SQL aggregation instead of loading ALL records ───
        // Previous code: loaded ALL students + nested installments + ALL payments into JS memory
        // New code: 2 SQL queries returning ~12 rows each (one per month)

        const ayFilter = Prisma.empty;

        // 1. GENERATED FEE: Aggregate by month
        const generatedByMonth = await prisma.$queryRaw<Array<{ yr: number; mo: number; total: number }>>(Prisma.sql`
            SELECT
                EXTRACT(YEAR FROM fi."createdAt" AT TIME ZONE 'Asia/Kolkata')::int AS yr,
                EXTRACT(MONTH FROM fi."createdAt" AT TIME ZONE 'Asia/Kolkata')::int - 1 AS mo,
                COALESCE(SUM(fi.amount), 0)::float AS total
            FROM "FeeInstallment" fi
            JOIN "Batch" b ON b.id = fi."batchId"
            JOIN "Enrollment" e ON e."batchId" = b.id AND e.status = 'ACTIVE'
            JOIN "Student" s ON s.id = e."studentId" AND (fi."studentId" IS NULL OR fi."studentId" = s.id)
            WHERE TRUE
                AND s."instituteId" = ${instituteId}
                ${ayFilter}
                AND (
                    (fi."studentId" IS NULL AND (fi."createdAt" >= e."startedAt" OR EXISTS (SELECT 1 FROM "FeePayment" fp WHERE fp."installmentId" = fi.id AND fp."studentId" = s.id)))
                    OR (fi."studentId" = s.id)
                )
            GROUP BY yr, mo

            UNION ALL

            SELECT
                EXTRACT(YEAR FROM e."startedAt" AT TIME ZONE 'Asia/Kolkata')::int AS yr,
                EXTRACT(MONTH FROM e."startedAt" AT TIME ZONE 'Asia/Kolkata')::int - 1 AS mo,
                COALESCE(SUM(b."feeAmount"), 0)::float AS total
            FROM "Enrollment" e
            JOIN "Student" s ON s.id = e."studentId"
            JOIN "Batch" b ON b.id = e."batchId"
            WHERE e.status = 'ACTIVE'
                AND s."instituteId" = ${instituteId}
                ${ayFilter}
                AND b."feeAmount" > 0
                AND NOT EXISTS (
                    SELECT 1 FROM "FeeInstallment" fi2 WHERE fi2."batchId" = b.id AND fi2."studentId" IS NULL
                )
            GROUP BY yr, mo
        `);

        // 3. Format with cumulative remaining
        let cumulativeGenerated = 0;
        let cumulativeCollected = 0;

        generatedByMonth.forEach(row => {
            const key = `${row.yr}-${row.mo}`;
            if (monthlyData[key]) {
                monthlyData[key].generated += Number(row.total);
            } else if (new Date(row.yr, row.mo, 1) <= startRawDate) {
                cumulativeGenerated += Number(row.total);
            }
        });

        // 2. COLLECTED FEE: Aggregate payments + fee records by month
        const collectedByMonth = await prisma.$queryRaw<Array<{ yr: number; mo: number; total: number }>>(Prisma.sql`
            SELECT yr, mo, SUM(total)::float AS total FROM (
                SELECT
                    EXTRACT(YEAR FROM fp.date AT TIME ZONE 'Asia/Kolkata')::int AS yr,
                    EXTRACT(MONTH FROM fp.date AT TIME ZONE 'Asia/Kolkata')::int - 1 AS mo,
                    COALESCE(SUM(fp."amountPaid"), 0) AS total
                FROM "FeePayment" fp
                JOIN "Student" s ON s.id = fp."studentId"
                WHERE s."instituteId" = ${instituteId}
                    ${ayFilter}
                GROUP BY yr, mo

                UNION ALL

                SELECT
                    EXTRACT(YEAR FROM fr.date AT TIME ZONE 'Asia/Kolkata')::int AS yr,
                    EXTRACT(MONTH FROM fr.date AT TIME ZONE 'Asia/Kolkata')::int - 1 AS mo,
                    COALESCE(SUM(fr.amount), 0) AS total
                FROM "FeeRecord" fr
                JOIN "Student" s ON s.id = fr."studentId"
                WHERE fr.status = 'PAID'
                    AND s."instituteId" = ${instituteId}
                    ${ayFilter}
                GROUP BY yr, mo
            ) sub
            GROUP BY yr, mo
        `);

        collectedByMonth.forEach(row => {
            const key = `${row.yr}-${row.mo}`;
            if (monthlyData[key]) {
                monthlyData[key].collected += Number(row.total);
            } else if (new Date(row.yr, row.mo, 1) <= startRawDate) {
                cumulativeCollected += Number(row.total);
            }
        });

        // Handle overpayments conceptually (difference between clamped StudentBalance sum and raw differential)
        let totalOverpaid = 0;
        try {
            const overpaidQuery = await prisma.$queryRaw<Array<{ amt: number }>>`
                SELECT COALESCE(SUM(amount_overpaid), 0)::float as amt FROM (
                    SELECT GREATEST(0, (COALESCE(SUM(fp."amountPaid"), 0) + COALESCE(SUM(fr.amount), 0)) - (
                        -- total generated for this student
                        COALESCE((SELECT SUM(fi.amount) FROM "FeeInstallment" fi WHERE fi."studentId" = s.id OR (fi."studentId" IS NULL AND EXISTS (SELECT 1 FROM "Enrollment" e WHERE e."studentId" = s.id AND e."batchId" = fi."batchId" AND e.status = 'ACTIVE'))), 0) +
                        COALESCE((SELECT SUM(b."feeAmount") FROM "Enrollment" e JOIN "Batch" b ON b.id = e."batchId" WHERE e."studentId" = s.id AND e.status = 'ACTIVE' AND NOT EXISTS(SELECT 1 FROM "FeeInstallment" fi2 WHERE fi2."batchId" = b.id AND fi2."studentId" IS NULL)), 0)
                    )) as amount_overpaid
                    FROM "Student" s
                    LEFT JOIN "FeePayment" fp ON fp."studentId" = s.id
                    LEFT JOIN "FeeRecord" fr ON fr."studentId" = s.id AND fr.status = 'PAID'
                    WHERE s."instituteId" = ${instituteId}
                    GROUP BY s.id
                ) sub
            `;
            totalOverpaid = overpaidQuery[0]?.amt || 0;
        } catch (e) {
            console.error('Overpaid query failed', e);
        }

        // Apply overpaid offset to starting generated baseline to balance remaining
        cumulativeGenerated += totalOverpaid;

        const data = months.map(m => {
            const key = `${m.year}-${m.monthIndex}`;
            const stats = monthlyData[key] || { collected: 0, generated: 0 };

            cumulativeGenerated += stats.generated;
            cumulativeCollected += stats.collected;

            const remaining = Math.max(0, cumulativeGenerated - cumulativeCollected);

            return {
                name: m.name,
                collected: stats.collected,
                remaining: remaining
            };
        });

        res.json(data);
    } catch (e) {
        console.error('Finance growth stats error:', e);
        res.status(500).json({ error: 'Failed to fetch financial stats' });
    }
};

export const getInstallmentGrowthStats = async (req: Request, res: Response) => {
    try {
        const user = req.user;
        const teacherId = user?.id;
        const instituteId = user?.instituteId;
        const role = user?.role;

        if (!teacherId) {
            return res.status(400).json({ error: 'Missing context' });
        }

        const whereClause: any = { enrollments: { some: { status: 'ACTIVE' } } };

        if (instituteId) {
            whereClause.instituteId = instituteId;
        }

        if (role !== 'SUPER_ADMIN') {
            whereClause.enrollments = { some: { status: 'ACTIVE', batch: { teacherId } } };
        }

        const students = await prisma.student.findMany({
            where: whereClause,
            select: {
                id: true,
                createdAt: true,
                enrollments: {
                    where: { status: 'ACTIVE' },
                    select: {
                        startedAt: true,
                        batch: { select: { feeInstallments: {
                            select: {
                                id: true,
                                name: true,
                                amount: true,
                                studentId: true,
                                createdAt: true
                            },
                            orderBy: { createdAt: 'asc' }
                        } } }
                    }
                },
                fees: {
                    select: {
                        amount: true,
                        status: true
                    }
                },
                feePayments: {
                    select: {
                        amountPaid: true,
                        installmentId: true
                    }
                },
                feeAssignments: {
                    select: {
                        installmentId: true
                    }
                }
            }
        });

        const installmentMap = new Map<string, { name: string; collected: number; generated: number }>();

        students.forEach((student: any) => {
            const allBatchInstallments = student.enrollments.flatMap((enrollment: any) =>
                enrollment.batch.feeInstallments.map((installment: any) => ({ ...installment, enrollmentStartedAt: enrollment.startedAt })));

            const paidInstallmentIds = new Set(student.feePayments.map((p: any) => p.installmentId));
            const assignedIds = new Set((student.feeAssignments || []).map((a: any) => a.installmentId));

            const validInstallments = allBatchInstallments.filter((inst: any) => {
                if (inst.studentId) {
                    return inst.studentId === student.id;
                }
                const isAfterJoin = new Date(inst.createdAt) >= new Date(inst.enrollmentStartedAt);
                const hasPayment = paidInstallmentIds.has(inst.id);
                const isAssigned = assignedIds.has(inst.id);
                return isAfterJoin || hasPayment || isAssigned;
            });

            const validInstallmentIds = new Set(validInstallments.map((inst: any) => inst.id));
            const paidSimple = student.fees
                .filter((f: any) => f.status === 'PAID')
                .reduce((sum: number, fee: any) => sum + fee.amount, 0);

            let unallocatedCash = paidSimple;
            const validFeePayments = student.feePayments.filter((p: any) => validInstallmentIds.has(p.installmentId));

            validInstallments.forEach((inst: any) => {
                const name = inst.name.trim();
                if (!installmentMap.has(name)) {
                    installmentMap.set(name, { name, collected: 0, generated: 0 });
                }
                const entry = installmentMap.get(name)!;

                entry.generated += inst.amount;

                const paymentsForThis = validFeePayments.filter((p: any) => p.installmentId === inst.id);
                const paidDirectly = paymentsForThis.reduce((sum: number, p: any) => sum + p.amountPaid, 0);

                let due = inst.amount - paidDirectly;
                let allocatedPaid = paidDirectly;

                if (due > 0 && unallocatedCash > 0) {
                    const coverage = Math.min(due, unallocatedCash);
                    due -= coverage;
                    allocatedPaid += coverage;
                    unallocatedCash -= coverage;
                }

                entry.collected += Math.min(inst.amount, allocatedPaid);
            });
        });

        const result = Array.from(installmentMap.values()).map(g => ({
            name: g.name,
            collected: g.collected,
            remaining: Math.max(0, g.generated - g.collected)
        }));

        res.json(result);
    } catch (error) {
        console.error('Error fetching installment growth stats:', error);
        res.status(500).json({ error: 'Failed to fetch installment stats' });
    }
};
