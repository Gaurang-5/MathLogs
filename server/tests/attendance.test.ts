import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/prisma';
import { processAttendanceAbsenceSweep } from '../src/controllers/attendanceController';

const restores: Array<() => void> = [];

function replaceMethod<T extends object, K extends keyof T>(target: T, key: K, replacement: T[K]) {
    const original = target[key];
    target[key] = replacement;
    restores.push(() => {
        target[key] = original;
    });
}

afterEach(() => {
    while (restores.length > 0) {
        restores.pop()?.();
    }
});

test('processAttendanceAbsenceSweep queues alerts only for missing students after the 30-minute window', async () => {
    replaceMethod(prisma.batch, 'findMany', (async () => ([
        {
            id: 'batch-1',
            name: 'Class 10 Evening',
            timeSlot: '6:00 PM - 7:00 PM',
            instituteId: 'inst-1',
            academicYearId: 'year-1',
            institute: { name: 'MathLogs Institute' },
            students: [
                { id: 'student-present', name: 'Aarav', parentWhatsapp: '9876543210' },
                { id: 'student-absent', name: 'Siya', parentWhatsapp: '9876500000' },
            ],
        },
    ]) as never) as typeof prisma.batch.findMany);

    replaceMethod(prisma.attendanceSweepRun, 'create', (async () => ({ id: 'sweep-1' }) as never) as typeof prisma.attendanceSweepRun.create);
    replaceMethod(prisma.attendanceRecord, 'findMany', (async () => ([
        { studentId: 'student-present' },
    ]) as never) as typeof prisma.attendanceRecord.findMany);

    let whatsappCreates = 0;
    replaceMethod(prisma.whatsappJob, 'create', (async () => {
        whatsappCreates += 1;
        return { id: `wa-${whatsappCreates}` } as never;
    }) as typeof prisma.whatsappJob.create);

    const result = await processAttendanceAbsenceSweep(new Date('2026-04-07T13:05:00.000Z'));

    assert.deepEqual(result, {
        processedBatches: 1,
        absentAlertsQueued: 1,
        attendanceDate: '2026-04-07',
    });
    assert.equal(whatsappCreates, 1);
});
