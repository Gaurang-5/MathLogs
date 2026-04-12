import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import { prisma } from '../prisma';
import {
    buildAttendancePhotoPath,
    toAbsoluteAttendancePhotoLink,
    ATTENDANCE_LINK_TTL_MS,
    parseAttendancePhotoLinkExpiry,
    verifyAttendancePhotoToken
} from '../utils/attendanceLinks';
import { readAttendancePhoto, storeAttendancePhoto } from '../utils/attendanceStorage';
import {
    formatIndiaTimestamp,
    getIndiaDayKey,
    getIndiaDayStart,
    getScheduledAttendanceSweepTime,
} from '../utils/attendanceTime';
import { sendAttendanceAbsentWhatsApp, sendAttendanceCheckInWhatsApp } from '../utils/whatsapp';

const ABSENT_NOTE = 'STATUS:ABSENT';

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

function isAbsentRecord(note?: string | null): boolean {
    return typeof note === 'string' && note.startsWith(ABSENT_NOTE);
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

        if (existing && !isAbsentRecord(existing.note)) {
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
                    photoUrlExpiresAt: parseAttendancePhotoLinkExpiry(existing.photoUrl),
                    source: existing.source,
                }
            });
        }

        const photoStorageKey = await storeAttendancePhoto({
            instituteId: student.instituteId,
            studentId: student.id,
            buffer: image.buffer,
            contentType: image.mimetype || 'image/jpeg',
        });
        const photoUrlExpiresAt = new Date(Date.now() + ATTENDANCE_LINK_TTL_MS);
        const checkedInAt = new Date();

        let recordId = existing?.id;
        if (!recordId) {
            const created = await prisma.attendanceRecord.create({
                data: {
                    studentId: student.id,
                    batchId: student.batchId,
                    instituteId: student.instituteId,
                    academicYearId: student.academicYearId,
                    attendanceDate,
                    checkedInAt,
                    photoMimeType: image.mimetype || 'image/jpeg',
                    source: 'KIOSK',
                    note: null,
                }
            });
            recordId = created.id;
        }
        if (!recordId) {
            throw new Error('Failed to resolve attendance record id');
        }

        const photoPath = buildAttendancePhotoPath({
            recordId,
            storageKey: photoStorageKey,
            mimeType: image.mimetype || 'image/jpeg',
            expiresAt: photoUrlExpiresAt,
        });

        await prisma.attendanceRecord.update({
            where: { id: recordId },
            data: {
                checkedInAt,
                photoUrl: photoPath,
                photoMimeType: image.mimetype || 'image/jpeg',
                source: 'KIOSK',
                note: null,
                manualMarkedById: null,
            }
        });

        notifyCheckIn({
            parentWhatsapp: student.parentWhatsapp,
            studentName: student.name,
            batchName: student.batch?.name || 'Batch',
            instituteName: student.batch?.institute?.name || 'MathLogs',
            instituteId: student.instituteId,
            checkedInAt,
            photoUrl: toAbsoluteAttendancePhotoLink(req, photoPath),
        }).catch((error) => {
            console.error('[Attendance] Failed to enqueue present alert:', error);
        });

        res.status(201).json({
            success: true,
            duplicate: false,
            record: {
                id: recordId,
                studentId: student.id,
                studentName: student.name,
                batchName: student.batch?.name || 'Batch',
                checkedInAt,
                photoUrl: photoPath,
                photoUrlExpiresAt,
                source: 'KIOSK',
            }
        });
    } catch (error: any) {
        if (error?.code === 'P2002') {
            return res.status(409).json({ error: 'Attendance was already captured for this student today' });
        }
        if (error?.code === 'P2021') {
            return res.status(503).json({ error: 'Attendance setup is pending. Please run the latest database migration.' });
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
            select: {
                id: true,
                checkedInAt: true,
                photoUrl: true,
                source: true,
                note: true,
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
                photoUrlExpiresAt: parseAttendancePhotoLinkExpiry(record.photoUrl),
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
    } catch (error: any) {
        if (error?.code === 'P2021' || error?.code === 'P2022') {
            return res.json({
                date: getIndiaDayKey(parseAttendanceDate(typeof req.query.date === 'string' ? req.query.date : undefined)),
                records: [],
            });
        }
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
        const { studentId, note, attendanceDate: attendanceDateInput, status } = req.body || {};
        const normalizedStatus = String(status || 'PRESENT').toUpperCase();

        if (!studentId || typeof studentId !== 'string') {
            return res.status(400).json({ error: 'studentId is required' });
        }
        if (normalizedStatus !== 'PRESENT' && normalizedStatus !== 'ABSENT') {
            return res.status(400).json({ error: 'status must be PRESENT or ABSENT' });
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

        if (normalizedStatus === 'ABSENT') {
            if (existing && !isAbsentRecord(existing.note)) {
                return res.status(409).json({ error: 'Student is already marked present today' });
            }

            const record = existing
                ? await prisma.attendanceRecord.update({
                    where: { id: existing.id },
                    data: {
                        source: 'MANUAL',
                        note: typeof note === 'string' && note.trim()
                            ? `${ABSENT_NOTE} ${note.trim()}`
                            : ABSENT_NOTE,
                        manualMarkedById: user.id,
                        photoUrl: null,
                        photoMimeType: null,
                    }
                })
                : await prisma.attendanceRecord.create({
                    data: {
                        studentId: student.id,
                        batchId: student.batchId,
                        instituteId: student.instituteId,
                        academicYearId: student.academicYearId,
                        attendanceDate,
                        source: 'MANUAL',
                        note: typeof note === 'string' && note.trim()
                            ? `${ABSENT_NOTE} ${note.trim()}`
                            : ABSENT_NOTE,
                        manualMarkedById: user.id,
                    }
                });

            return res.status(existing ? 200 : 201).json({
                success: true,
                duplicate: false,
                record: {
                    ...record,
                    studentName: student.name,
                    batchName: student.batch?.name || 'Batch',
                }
            });
        }

        if (existing && !isAbsentRecord(existing.note)) {
            return res.json({
                success: true,
                duplicate: true,
                record: existing,
            });
        }

        const record = existing
            ? await prisma.attendanceRecord.update({
                where: { id: existing.id },
                data: {
                    source: 'MANUAL',
                    note: typeof note === 'string' && note.trim() ? note.trim() : 'Marked present manually',
                    manualMarkedById: user.id,
                    checkedInAt: new Date(),
                }
            })
            : await prisma.attendanceRecord.create({
                data: {
                    studentId: student.id,
                    batchId: student.batchId,
                    instituteId: student.instituteId,
                    academicYearId: student.academicYearId,
                    attendanceDate,
                    source: 'MANUAL',
                    note: typeof note === 'string' && note.trim() ? note.trim() : 'Marked present manually',
                    manualMarkedById: user.id,
                }
            });

        res.status(existing ? 200 : 201).json({
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

export const getPublicAttendancePhoto = async (req: Request, res: Response) => {
    try {
        const recordId = String(req.params.id || '');
        const token = typeof req.query.token === 'string' ? req.query.token : '';

        if (!recordId || !token) {
            return res.status(400).send('Missing photo token');
        }

        const payload = verifyAttendancePhotoToken(token, recordId);
        const buffer = await readAttendancePhoto(payload.storageKey);
        res.setHeader('Content-Type', payload.mimeType || 'image/jpeg');
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.send(buffer);
    } catch (error: any) {
        if (error?.name === 'TokenExpiredError') {
            return res.status(410).send('This photo link has expired');
        }

        if (error?.name === 'JsonWebTokenError' || error?.message === 'Invalid attendance photo token') {
            return res.status(403).send('Invalid photo link');
        }
        if (error?.name === 'NoSuchKey' || error?.code === 'ENOENT') {
            return res.status(404).send('Attendance photo not found');
        }

        console.error('[Attendance] Public photo fetch failed:', error);
        res.status(500).send('Failed to fetch attendance photo');
    }
};

export const getPublicBatchAttendance = async (req: Request, res: Response) => {
    try {
        const batchId = String(req.params.id || '');
        if (!batchId) return res.status(400).json({ error: 'batchId is required' });

        const attendanceDate = parseAttendanceDate(typeof req.query.date === 'string' ? req.query.date : undefined);
        const batch = await prisma.batch.findUnique({
            where: { id: batchId },
            select: {
                id: true,
                name: true,
                institute: { select: { name: true } },
            }
        });

        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const records = await prisma.attendanceRecord.findMany({
            where: { batchId, attendanceDate },
            orderBy: { checkedInAt: 'asc' },
            select: {
                id: true,
                checkedInAt: true,
                note: true,
                student: { select: { name: true, humanId: true } },
            }
        });

        const presentRecords = records.filter((record) => !isAbsentRecord(record.note));

        res.json({
            date: getIndiaDayKey(attendanceDate),
            batch: {
                id: batch.id,
                name: batch.name,
                instituteName: batch.institute?.name || 'MathLogs',
            },
            presentCount: presentRecords.length,
            students: presentRecords.map((record) => ({
                id: record.id,
                name: record.student.name,
                humanId: record.student.humanId,
                checkedInAt: record.checkedInAt,
            })),
        });
    } catch (error: any) {
        if (error?.code === 'P2021' || error?.code === 'P2022') {
            return res.json({
                date: getIndiaDayKey(parseAttendanceDate(typeof req.query.date === 'string' ? req.query.date : undefined)),
                batch: null,
                presentCount: 0,
                students: [],
            });
        }
        console.error('[Attendance] Public attendance fetch failed:', error);
        res.status(500).json({ error: 'Failed to fetch attendance list' });
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
                note: true,
            }
        });

        const presentIds = new Set(records.filter((record) => !isAbsentRecord(record.note)).map((record) => record.studentId));
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
