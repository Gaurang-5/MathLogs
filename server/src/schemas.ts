import { z } from 'zod';

// Phone number regex: 10-15 digits, optional + prefix
const phoneRegex = /^(\+)?[0-9]{10,15}$/;

export const loginSchema = z.object({
    body: z.object({
        username: z.string().min(1, "Username is required").max(100),
        password: z.string().min(4, "Password must be at least 4 characters").max(200)
    })
});

export const setupSchema = z.object({
    body: z.object({
        username: z.string().min(3, "Username must be at least 3 characters").max(100),
        password: z.string().min(6, "Password must be at least 6 characters").max(200)
    })
});

export const coachingFeeModeSchema = z.enum(['CURRENT_DUE_BASED', 'MONTH_COVERAGE']);
export const canonicalMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Invalid canonical month');
export const monthCoverageDurationSchema = z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY']);
export const monthCoveragePaymentMethodSchema = z.enum(['CASH', 'UPI', 'BANK', 'CARD', 'OTHER']);

const stringListSchema = z.union([z.array(z.string()), z.string()]);

export const setupAccountSchema = z.object({
    body: z.object({
        token: z.string().min(1, 'Invite token is required'),
        username: z.string().min(3).max(100).optional(),
        password: z.string().min(6).max(200).optional(),
        city: z.string().optional(),
        area: z.string().optional(),
        subjects: stringListSchema.optional(),
        subjectsOffered: stringListSchema.optional(),
        allowedClasses: stringListSchema.optional(),
        requiresGrades: z.boolean().optional(),
        googleMapsUrl: z.string().optional(),
        isPubliclyListed: z.boolean().optional(),
        tagline: z.string().optional(),
        description: z.string().optional(),
        coachingFeeMode: coachingFeeModeSchema,
    }).passthrough(),
});

export const confirmMonthCoverageProfileSchema = z.object({
    body: z.object({
        feeStartMonth: canonicalMonthSchema,
    }),
});

const monthCoveragePaymentInputSchema = z.object({
    studentId: z.string().uuid('Invalid Student ID'),
    duration: monthCoverageDurationSchema,
    requestedStartMonth: canonicalMonthSchema.nullable().optional(),
    allowGap: z.boolean().optional(),
});

export const previewMonthCoveragePaymentSchema = z.object({
    body: monthCoveragePaymentInputSchema,
});

export const createMonthCoveragePaymentSchema = z.object({
    body: monthCoveragePaymentInputSchema.extend({
        amount: z.number().positive('Amount must be positive'),
        paymentDate: z.string().min(1, 'Payment date is required'),
        paymentMethod: monthCoveragePaymentMethodSchema,
        note: z.string().max(1000).optional(),
    }),
});

export const updateMonthCoveragePaymentSchema = z.object({
    body: monthCoveragePaymentInputSchema.extend({
        amount: z.number().positive('Amount must be positive'),
        paymentDate: z.string().min(1, 'Payment date is required'),
        paymentMethod: monthCoveragePaymentMethodSchema,
        note: z.string().max(1000).optional(),
        reason: z.string().max(1000).optional(),
    }),
});

export const voidMonthCoveragePaymentSchema = z.object({
    body: z.object({
        reason: z.string().max(1000).optional(),
    }),
});

export const sendMonthCoverageReminderSchema = z.object({
    body: z.object({
        batchId: z.string().uuid('Invalid Batch ID').optional(),
        studentIds: z.array(z.string().uuid('Invalid Student ID')).min(1).optional(),
    }),
});

export const changePasswordSchema = z.object({
    body: z.object({
        currentPassword: z.string().min(1, "Current password is required"),
        newPassword: z.string().min(6, "New password must be at least 6 characters").max(200)
    })
});

export const registerStudentSchema = z.object({
    body: z.object({
        batchId: z.string().uuid("Invalid Batch ID"),
        name: z.string().min(1, "Name is required").max(200),
        parentName: z.string().min(1, "Parent Name is required").max(200),
        parentWhatsapp: z.string().regex(phoneRegex, "Invalid phone number (10-15 digits)"),
        parentEmail: z.string().nullish().transform(val => {
            if (!val || val.trim() === '') return undefined;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(val.trim()) ? val.trim() : undefined;
        }),
        schoolName: z.string().max(300).nullish(),
        additionalData: z.record(z.string(), z.any()).optional(),
        token: z.string().nullish()
    })
});

export const createBatchSchema = z.object({
    body: z.object({
        batchNumber: z.union([z.string(), z.number()]).optional(),
        customName: z.string().max(200).optional(),
        name: z.string().max(200).optional(),
        subject: z.string().min(1, "Subject is required").max(100),
        className: z.string().min(1, "Class is required").max(100).optional(), // Optional for non-grade institutes
        feeAmount: z.number().min(0).optional(),
        timeSlot: z.string().max(100).optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional()
    })
});

export const updateBatchSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(200).optional(),
        subject: z.string().min(1).max(100).optional(),
        className: z.string().max(100).optional(),
        timeSlot: z.string().max(100).optional(),
        feeAmount: z.number().min(0).optional(),
        whatsappGroupLink: z.string().url("Invalid URL").optional().or(z.literal('')),
        autoSendWelcome: z.boolean().optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional()
    })
});

export const updateStudentSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(200).optional(),
        parentName: z.string().min(1).max(200).optional(),
        parentWhatsapp: z.string().optional().transform(val => val ? val.replace(/[^0-9+]/g, '') : val),
        parentEmail: z.string().nullish().transform(val => {
            if (!val || val.trim() === '') return undefined;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(val.trim()) ? val.trim() : undefined;
        }),
        schoolName: z.string().max(300).nullish().transform(val => (val && val.trim() !== '') ? val.trim() : undefined),
        humanId: z.string().max(50).nullish().transform(val => (val && val.trim() !== '') ? val.trim() : undefined)
    })
});

export const assignFeeSchema = z.object({
    body: z.object({
        studentId: z.string().uuid("Invalid Student ID"),
        installmentId: z.string().uuid("Invalid Installment ID")
    })
});


export const paymentSchema = z.object({
    body: z.object({
        studentId: z.string().uuid(),
        amount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/)]),
        idempotencyKey: z.string().min(8).max(150),
        allocations: z.array(z.object({ installmentId: z.string().uuid(), amount: z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,2})?$/)]) })).min(1).max(100)
    })
});

export const payInstallmentSchema = z.object({
    body: z.object({
        studentId: z.string().uuid("Invalid Student ID"),
        installmentId: z.string().uuid("Invalid Installment ID"),
        amount: z.number().positive("Amount must be positive"),
        date: z.string().optional() // Accept any date string format (datetime or YYYY-MM-DD)
    })
});

export const submitMarkSchema = z.object({
    body: z.object({
        testId: z.string().uuid("Invalid Test ID"),
        studentId: z.string().uuid("Invalid Student ID"),
        score: z.number().min(0, "Score cannot be negative")
            .or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number))
    })
});

export const createTestSchema = z.object({
    body: z.object({
        name: z.string().min(1, "Test name is required").max(200),
        subject: z.string().min(1, "Subject is required").max(100),
        date: z.string().datetime().or(z.string()), // ISO date or any string
        maxMarks: z.number().positive("Max marks must be positive")
            .or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number)),
        className: z.string().max(100).optional(),
        batchIds: z.array(z.string().uuid("Invalid Batch ID")).optional()
    })
});

export const updateTestSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(200).optional(),
        date: z.string().optional(),
        maxMarks: z.number().positive().or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number)).optional()
    })
});



export const createInstallmentSchema = z.object({
    body: z.object({
        name: z.string().min(1, "Installment name required").max(200),
        amount: z.number().positive("Amount must be positive")
    })
});

export const createCustomInvoiceSchema = z.object({
    body: z.object({
        studentId: z.string().uuid("Invalid Student ID"),
        installmentId: z.string().uuid("Invalid Installment ID").optional(),
        name: z.string().min(1, "Invoice name required").max(200).optional(),
        amount: z.number().positive("Amount must be positive")
            .or(z.string().regex(/^\d+(\.\d+)?$/).transform(Number))
            .optional(),
        markAsPaid: z.boolean().optional()
    }).refine(
        data => !!data.installmentId || (!!data.name && data.amount !== undefined),
        { message: "Either installmentId or name and amount are required" }
    )
});

const enrollmentFeeChoiceSchema = z.discriminatedUnion('mode', [
    z.object({
        mode: z.literal('MONTH_COVERAGE'),
        feeStartMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Fee start month must be YYYY-MM')
    }),
    z.object({
        mode: z.literal('CURRENT_DUE_BASED'),
        installmentIds: z.array(z.string().uuid('Invalid installment ID')).default([]),
        decision: z.enum(['SELECTED', 'NO_FEE', 'LATER']).optional(),
        applyFutureInstallments: z.boolean().default(false),
        amounts: z.record(z.string().uuid(), z.number().finite().positive()).optional()
    })
]);

export const inviteStudentEnrollmentSchema = z.object({
    body: z.object({
        whatsappNumber: z.string().regex(phoneRegex, 'Invalid phone number'),
        fee: enrollmentFeeChoiceSchema
    })
});

export const resolveIdentityReviewSchema = z.object({
    body: z.object({
        action: z.enum(['USE_EXISTING', 'CREATE_NEW']),
        studentId: z.string().uuid('Invalid Student ID').optional(),
        startedAt: z.string().datetime(),
        fee: enrollmentFeeChoiceSchema,
        idempotencyKey: z.string().trim().min(8).max(200)
    }).refine(value => value.action !== 'USE_EXISTING' || Boolean(value.studentId), {
        message: 'Student ID is required when using an existing profile',
        path: ['studentId']
    })
});

export const previewEnrollmentSchema = z.object({
    body: z.object({
        studentId: z.string().uuid('Invalid Student ID'),
        startedAt: z.string().datetime(),
        fee: enrollmentFeeChoiceSchema
    })
});

export const createEnrollmentSchema = z.object({
    body: z.object({
        studentId: z.string().uuid('Invalid Student ID'),
        startedAt: z.string().datetime(),
        fee: enrollmentFeeChoiceSchema,
        idempotencyKey: z.string().trim().min(8).max(200)
    })
});

export const endEnrollmentSchema = z.object({
    body: z.object({
        endedAt: z.string().datetime().optional(),
        reason: z.string().trim().min(3).max(500),
        idempotencyKey: z.string().trim().min(8).max(200)
    })
});

export const deleteEmptyStudentSchema = z.object({
    body: z.object({
        reason: z.string().trim().min(3).max(500),
        confirmation: z.string().trim().min(1).max(200)
    })
});

export const retryEnrollmentNotificationSchema = z.object({
    body: z.object({
        eventKey: z.string().regex(/^enrollment:[^:]+:(ADDED|READDED|REMOVED|RESEND:[^:]+)$/)
    })
});

export const resendEnrollmentNotificationSchema = z.object({
    body: z.object({
        idempotencyKey: z.string().trim().min(8).max(200)
    })
});
