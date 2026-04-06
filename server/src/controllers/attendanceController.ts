import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import { prisma } from '../prisma';
import { storeAttendancePhoto } from '../utils/attendanceStorage';
import {
    buildIndiaDateAtTime,
    formatIndiaTimestamp,
    getIndiaDayKey,
    getIndiaDayStart,
    getScheduledAttendanceSweepTime,
} from '../utils/attendanceTime';
import { sendAttendanceAbsentWhatsApp, sendAttendanceCheckInWhatsApp } from '../utils/whatsapp';

function parseAttendanceDate(dateInput?: string): Date {
    if (!dateInput) return getIndiaDayStart();

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
        return new Date(`${dateInput}T00:00:00+05:30`);
    }

    const parsed = new Date(dateInput);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error('Invalid attendance date');
    }
    return getIndiaDayStart(parsed);
}

function normalizePhoneNumber(phone?: string | null): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (!digits) return null;
    return digits.length === 10 ? `+91${digits}` : `+${digits}`;
}

async function notifyCheckIn(params: {
    parentWhatsapp: string | null;
    studentName: string;
    batchName: string;
    instituteName: string;
    instituteId: string;
    checkedInAt: Date;
    photoUrl: string;
}) {
    const phone = normalizePhoneNumber(params.parentWhatsapp);
    if (!phone) return;

    await sendAttendanceCheckInWhatsApp(phone, {
        studentName: params.studentName,
        batchName: params.batchName,
        instituteName: params.instituteName,
        checkInTime: formatIndiaTimestamp(params.checkedInAt),
        photoUrl: params.photoUrl,
        instituteId: params.instituteId || undefined
    });
}

async function notifyAbsence(params: {
    parentWhatsapp: string | null;
    studentName: string;
    batchName: string;
    instituteName: string;
    instituteId: string;
    scheduledFor: Date;
}) {
    const phone = normalizePhoneNumber(params.parentWhatsapp);
    if (!phone) return;

    await sendAttendanceAbsentWhatsApp(phone, {
        studentName: params.studentName,
        batchName: params.batchName,
        instituteName: params.instituteName,
        scheduledTime: formatIndiaTimestamp(params.scheduledFor),
        instituteId: params.instituteId || undefined
    });
}

export const checkInStudentAttendance = async (req: Request, res: Response) => {
    try {
        const humanId = String(req.body.humanId || '').trim();
        const image = (req as any).file as Express.Multer.File | undefined;
        const batchIdFilter = typeof req.body.batchId === 'string' ? req.body.batchId.trim() : '';
        const user = (req as any).user;

        if (!humanId) {
            return res.status(400).json({ error: 'Student QR is required' });
        }

        if (!image) {
            return res.status(400).json({ error: 'Proof photo is required' });
        }

        const student = await prisma.student.findFirst({
            where: {
                humanId,
                instituteId: user.instituteId,
                academicYearId: user.currentAcademicYearId,
                status: 'APPROVED',
            },
            select: {
                id: true,
                name: true,
                parentWhatsapp: true,
                batchId: true,
                academicYearId: true,
                instituteId: true,
                batch: {
                    select: {
                        name: true,
                        institute: {
                            select: {
                                name: true,
                            }
                        }
                    }
                }
            }
        });

        if (!student || !student.batchId || !student.instituteId) {
            return res.status(404).json({ error: 'Student not found for this institute' });
        }

        if (batchIdFilter && student.batchId !== batchIdFilter) {
            return res.status(409).json({ error: `${student.name} belongs to a different batch` });
        }

        const attendanceDate = getIndiaDayStart();
        const existing = await prisma.attendanceRecord.findUnique({
            where: {
                studentId_attendanceDate: {
                    studentId: student.id,
                    attendanceDate,
                }
            }
        });

        if (existing) {
            return res.json({
                success: true,
                duplicate: true,
                record: {
                    id: existing.id,
                    studentId: student.id,
                    studentName: student.name,
                    batchName: student.batch?.name || 'Batch',
                    checkedInAt: existing.checkedInAt,
                    photoUrl: existing.photoUrl,
                    source: existing.source,
                }
            });
        }

        const photoUrl = await storeAttendancePhoto({
            req,
            instituteId: student.instituteId,
            studentId: student.id,
            buffer: image.buffer,
            contentType: image.mimetype || 'image/jpeg',
        });

        const created = await prisma.attendanceRecord.create({
            data: {
                studentId: student.id,
                batchId: student.batchId,
                instituteId: student.instituteId,
                academicYearId: student.academicYearId,
                attendanceDate,
                checkedInAt: new Date(),
                photoUrl,
                photoMimeType: image.mimetype || 'image/jpeg',
                source: 'KIOSK',
            }
        });

        notifyCheckIn({
            parentWhatsapp: student.parentWhatsapp,
            studentName: student.name,
            batchName: student.batch?.name || 'Batch',
            instituteName: student.batch?.institute?.name || 'MathLogs',
            instituteId: student.instituteId,
            checkedInAt: created.checkedInAt,
            photoUrl,
        }).catch((error) => {
            console.error('[Attendance] Failed to enqueue present alert:', error);
        });

        res.status(201).json({
            success: true,
            duplicate: false,
            record: {
                id: created.id,
                studentId: student.id,
                studentName: student.name,
                batchName: student.batch?.name || 'Batch',
                checkedInAt: created.checkedInAt,
                photoUrl,
                source: created.source,
            }
        });
    } catch (error: any) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ error: 'Attendance was already captured for this student today' });
        }

        console.error('[Attendance] Check-in failed:', error);
        res.status(500).json({ error: 'Failed to save attendance' });
    }
};

export const getAttendanceFeed = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const attendanceDate = parseAttendanceDate(typeof req.query.date === 'string' ? req.query.date : undefined);
        const batchId = typeof req.query.batchId === 'string' ? req.query.batchId : undefined;
        const limit = Math.min(Number(req.query.limit || 100), 250);

        const records = await prisma.attendanceRecord.findMany({
            where: {
                instituteId: user.instituteId,
                attendanceDate,
                ...(batchId ? { batchId } : {}),
            },
            orderBy: { checkedInAt: 'desc' },
            take: limit,
            include: {
                student: {
                    select: {
                        id: true,
                        name: true,
                        humanId: true,
                        parentWhatsapp: true,
                    }
                },
                batch: {
                    select: {
                        id: true,
                        name: true,
                        timeSlot: true,
                    }
                },
                manualMarkedBy: {
                    select: {
                        username: true,
                    }
                }
            }
        });

        res.json({
            date: getIndiaDayKey(attendanceDate),
            records: records.map((record) => ({
                id: record.id,
                checkedInAt: record.checkedInAt,
                photoUrl: record.photoUrl,
                source: record.source,
                note: record.note,
                student: {
                    id: record.student.id,
                    name: record.student.name,
                    humanId: record.student.humanId,
                    parentWhatsapp: record.student.parentWhatsapp,
                },
                batch: record.batch,
                manualMarkedBy: record.manualMarkedBy?.username || null,
            }))
        });
    } catch (error) {
        console.error('[Attendance] Feed failed:', error);
        res.status(500).json({ error: 'Failed to fetch attendance feed' });
    }
};

export const searchAttendanceStudents = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
        const batchId = typeof req.query.batchId === 'string' ? req.query.batchId : undefined;

        const students = await prisma.student.findMany({
            where: {
                instituteId: user.instituteId,
                academicYearId: user.currentAcademicYearId,
                status: 'APPROVED',
                ...(batchId ? { batchId } : {}),
                ...(q ? {
                    OR: [
                        { name: { contains: q, mode: 'insensitive' } },
                        { humanId: { contains: q, mode: 'insensitive' } },
                    ]
                } : {}),
            },
            orderBy: { name: 'asc' },
            take: 20,
            select: {
                id: true,
                name: true,
                humanId: true,
                batch: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            }
        });

        res.json({ students });
    } catch (error) {
        console.error('[Attendance] Student search failed:', error);
        res.status(500).json({ error: 'Failed to search students' });
    }
};

export const markStudentPresentManually = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const { studentId, note, attendanceDate: attendanceDateInput } = req.body || {};

        if (!studentId || typeof studentId !== 'string') {
            return res.status(400).json({ error: 'studentId is required' });
        }

        const student = await prisma.student.findFirst({
            where: {
                id: studentId,
                instituteId: user.instituteId,
                status: 'APPROVED',
            },
            select: {
                id: true,
                name: true,
                batchId: true,
                academicYearId: true,
                instituteId: true,
                batch: {
                    select: {
                        name: true,
                    }
                }
            }
        });

        if (!student || !student.batchId || !student.instituteId) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const attendanceDate = parseAttendanceDate(typeof attendanceDateInput === 'string' ? attendanceDateInput : undefined);
        const existing = await prisma.attendanceRecord.findUnique({
            where: {
                studentId_attendanceDate: {
                    studentId: student.id,
                    attendanceDate,
                }
            }
        });

        if (existing) {
            return res.json({
                success: true,
                duplicate: true,
                record: existing,
            });
        }

        const record = await prisma.attendanceRecord.create({
            data: {
                studentId: student.id,
                batchId: student.batchId,
                instituteId: student.instituteId,
                academicYearId: student.academicYearId,
                attendanceDate,
                source: 'MANUAL',
                note: typeof note === 'string' ? note.trim() : 'Marked present manually',
                manualMarkedById: user.id,
            }
        });

        res.status(201).json({
            success: true,
            duplicate: false,
            record: {
                ...record,
                studentName: student.name,
                batchName: student.batch?.name || 'Batch',
            }
        });
    } catch (error) {
        console.error('[Attendance] Manual override failed:', error);
        res.status(500).json({ error: 'Failed to mark attendance manually' });
    }
};

export async function processAttendanceAbsenceSweep(now: Date = new Date()) {
    const dayStart = getIndiaDayStart(now);

    const batches = await prisma.batch.findMany({
        where: {
            instituteId: { not: null },
        },
        select: {
            id: true,
            name: true,
            timeSlot: true,
            instituteId: true,
            academicYearId: true,
            institute: {
                select: {
                    name: true,
                }
            },
            students: {
                where: { status: 'APPROVED' },
                select: {
                    id: true,
                    name: true,
                    parentWhatsapp: true,
                }
            }
        }
    });

    let processedBatches = 0;
    let absentAlertsQueued = 0;

    for (const batch of batches) {
        if (!batch.instituteId) continue;

        const scheduledFor = getScheduledAttendanceSweepTime(batch.timeSlot, now);
        if (!scheduledFor || scheduledFor.getTime() > now.getTime()) continue;

        try {
            await prisma.attendanceSweepRun.create({
                data: {
                    batchId: batch.id,
                    instituteId: batch.instituteId,
                    academicYearId: batch.academicYearId,
                    attendanceDate: dayStart,
                    scheduledFor,
                    completedAt: now,
                }
            });
        } catch (error: any) {
            if (error?.code === 'P2002') {
                continue;
            }
            throw error;
        }

        processedBatches += 1;

        if (batch.students.length === 0) continue;

        const records = await prisma.attendanceRecord.findMany({
            where: {
                batchId: batch.id,
                attendanceDate: dayStart,
            },
            select: {
                studentId: true,
            }
        });

        const presentIds = new Set(records.map((record) => record.studentId));
        const missingStudents = batch.students.filter((student) => !presentIds.has(student.id));

        await Promise.allSettled(missingStudents.map(async (student) => {
            await notifyAbsence({
                parentWhatsapp: student.parentWhatsapp,
                studentName: student.name,
                batchName: batch.name,
                instituteName: batch.institute?.name || 'MathLogs',
                instituteId: batch.instituteId!,
                scheduledFor,
            });
            absentAlertsQueued += 1;
        }));
    }

    return {
        processedBatches,
        absentAlertsQueued,
        attendanceDate: getIndiaDayKey(dayStart),
    };
}

export const triggerAttendanceAbsenceSweep = async (_req: Request, res: Response) => {
    try {
        const result = await processAttendanceAbsenceSweep();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[Attendance] Sweep failed:', error);
        res.status(500).json({ error: 'Failed to run absence sweep' });
    }
};

export const downloadBatchIdCards = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const batchId = req.params.id as string;

        const batch = await prisma.batch.findUnique({
            where: { id: batchId },
            select: {
                id: true,
                name: true,
                instituteId: true,
                institute: {
                    select: {
                        name: true,
                    }
                },
                students: {
                    where: {
                        status: 'APPROVED',
                        humanId: { not: null },
                    },
                    orderBy: { name: 'asc' },
                    select: {
                        id: true,
                        name: true,
                        humanId: true,
                    }
                }
            }
        });

        if (!batch) {
            return res.status(404).json({ error: 'Batch not found' });
        }

        if (batch.instituteId !== user.instituteId) {
            return res.status(403).json({ error: 'Unauthorized access to batch' });
        }

        const doc = new PDFDocument({ size: 'A4', margin: 24 });
        const filename = `ID-Cards-${batch.name.replace(/\s+/g, '-')}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        doc.pipe(res);

        const cardWidth = 250;
        const cardHeight = 150;
        const gapX = 20;
        const gapY = 18;
        const startX = 28;
        const startY = 28;
        const cardsPerRow = 2;
        const rowsPerPage = 5;

        for (let index = 0; index < batch.students.length; index += 1) {
            const student = batch.students[index];
            const position = index % (cardsPerRow * rowsPerPage);

            if (index > 0 && position === 0) {
                doc.addPage();
            }

            const row = Math.floor(position / cardsPerRow);
            const col = position % cardsPerRow;
            const x = startX + col * (cardWidth + gapX);
            const y = startY + row * (cardHeight + gapY);

            doc.roundedRect(x, y, cardWidth, cardHeight, 16)
                .fillAndStroke('#F8FAFC', '#CBD5E1');

            doc.roundedRect(x + 14, y + 14, cardWidth - 28, 34, 12)
                .fill('#E2E8F0');

            doc.fillColor('#0F172A')
                .font('Helvetica-Bold')
                .fontSize(12)
                .text(batch.institute?.name || 'MathLogs', x + 26, y + 24, { width: cardWidth - 52 });

            doc.fillColor('#334155')
                .font('Helvetica')
                .fontSize(10)
                .text(batch.name, x + 26, y + 54, { width: cardWidth - 52 });

            const qr = await bwipjs.toBuffer({
                bcid: 'qrcode',
                text: student.humanId || student.id,
                scale: 3,
            });

            doc.image(qr as any, x + 24, y + 74, { width: 62, height: 62 });

            doc.fillColor('#0F172A')
                .font('Helvetica-Bold')
                .fontSize(14)
                .text(student.name, x + 98, y + 82, {
                    width: cardWidth - 120,
                    height: 38,
                    ellipsis: true,
                });

            doc.fillColor('#475569')
                .font('Helvetica-Bold')
                .fontSize(11)
                .text(student.humanId || 'Pending ID', x + 98, y + 118, {
                    width: cardWidth - 120,
                });

            doc.fillColor('#64748B')
                .font('Helvetica')
                .fontSize(8)
                .text('MathLogs Smart ID', x + 98, y + 136, {
                    width: cardWidth - 120,
                });
        }

        doc.end();
    } catch (error) {
        console.error('[Attendance] ID card export failed:', error);
        res.status(500).json({ error: 'Failed to generate ID cards' });
    }
};
