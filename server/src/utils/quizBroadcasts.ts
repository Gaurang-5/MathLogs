import { prisma } from '../prisma';
import { sendTestMarksWhatsApp, sendQuizScheduleWhatsApp } from './whatsapp';

function normalizePhone(phone?: string | null) {
    if (!phone) return null;
    const numeric = phone.replace(/\D/g, '');
    if (numeric.length === 10) return `91${numeric}`;
    return numeric.length >= 10 ? numeric : null;
}

function formatDateTime(value?: Date | null) {
    if (!value) return 'Not scheduled';
    return new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata'
    }).format(value);
}

export async function sendQuizScheduleBroadcast(quizId: string) {
    const quiz = await prisma.onlineQuiz.findUnique({
        where: { id: quizId },
        include: {
            institute: { select: { id: true, name: true } },
            batch: {
                select: {
                    id: true,
                    students: {
                        where: { status: 'APPROVED' },
                        select: { id: true, name: true, parentWhatsapp: true }
                    }
                }
            },
            batches: {
                select: {
                    id: true,
                    students: {
                        where: { status: 'APPROVED' },
                        select: { id: true, name: true, parentWhatsapp: true }
                    }
                }
            }
        }
    });

    if (!quiz) return { sent: 0, failed: 0 };

    // Union all students from the single batch and multiple batches
    const studentMap = new Map<string, { id: string; name: string; parentWhatsapp: string }>();
    if (quiz.batch?.students) {
        for (const s of quiz.batch.students) {
            if (s.parentWhatsapp) {
                studentMap.set(s.id, s as any);
            }
        }
    }
    if (quiz.batches) {
        for (const b of quiz.batches) {
            for (const s of b.students) {
                if (s.parentWhatsapp) {
                    studentMap.set(s.id, s as any);
                }
            }
        }
    }
    const uniqueStudents = Array.from(studentMap.values());

    let sent = 0;
    let failed = 0;
    const jobs = uniqueStudents.map(async (student) => {
        const phone = normalizePhone(student.parentWhatsapp);
        if (!phone) return;

        const result = await sendQuizScheduleWhatsApp(phone, {
            studentName: student.name,
            instituteName: quiz.institute.name,
            quizTitle: quiz.title,
            topic: quiz.topic || quiz.difficulty || 'Online quiz',
            availableFrom: formatDateTime(quiz.availableFrom),
            availableUntil: formatDateTime(quiz.availableUntil),
            durationMins: String(quiz.timeLimitMins),
            instituteId: quiz.institute.id
        });

        if (result === false) failed++;
        else sent++;
    });

    await Promise.allSettled(jobs);
    return { sent, failed };
}

export async function sendQuizMarksBroadcast(quizId: string) {
    const quiz = await prisma.onlineQuiz.findUnique({
        where: { id: quizId },
        include: {
            institute: { select: { id: true, name: true } },
            submissions: {
                where: { submittedAt: { not: null } },
                include: {
                    student: { select: { name: true, parentWhatsapp: true } }
                }
            }
        }
    });

    if (!quiz) return { sent: 0, failed: 0 };

    let sent = 0;
    let failed = 0;
    const jobs = quiz.submissions.map(async (submission) => {
        const phone = normalizePhone(submission.student.parentWhatsapp);
        if (!phone) return;

        const score = Number(submission.score || 0);
        const result = await sendTestMarksWhatsApp(phone, {
            studentName: submission.student.name,
            instituteName: quiz.institute.name,
            testName: quiz.title,
            marksObtained: String(score),
            totalMarks: String(quiz.totalMarks),
            instituteId: quiz.institute.id
        });

        if (result === false) failed++;
        else sent++;
    });

    await Promise.allSettled(jobs);
    return { sent, failed };
}
