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
        parentEmail: z.string().email("Invalid Email").optional().or(z.literal('')),
        schoolName: z.string().max(300).optional()
    })
});

export const createBatchSchema = z.object({
    body: z.object({
        batchNumber: z.union([z.string(), z.number()]),
        subject: z.string().min(1, "Subject is required").max(100),
        className: z.string().min(1, "Class is required").max(100).optional(), // Optional for non-grade institutes
        feeAmount: z.number().min(0).optional(),
        timeSlot: z.string().max(100).optional()
    })
});

export const updateBatchSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(200).optional(),
        subject: z.string().min(1).max(100).optional(),
        className: z.string().max(100).optional(),
        timeSlot: z.string().max(100).optional(),
        feeAmount: z.number().min(0).optional(),
        whatsappGroupLink: z.string().url("Invalid URL").optional().or(z.literal(''))
    })
});

export const updateStudentSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(200).optional(),
        parentName: z.string().min(1).max(200).optional(),
        parentWhatsapp: z.string().regex(phoneRegex, "Invalid phone number").optional(),
        parentEmail: z.string().email("Invalid Email").optional().or(z.literal('')),
        schoolName: z.string().max(300).optional(),
        humanId: z.string().max(50).optional()
    })
});

export const paymentSchema = z.object({
    body: z.object({
        studentId: z.string().uuid("Invalid Student ID"),
        amount: z.number().positive("Amount must be positive").or(z.string().regex(/^\d+(\.\d+)?$/))
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
        maxMarks: z.number().positive("Max marks must be positive"),
        className: z.string().max(100).optional()
    })
});

export const updateTestSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(200).optional(),
        date: z.string().optional(),
        maxMarks: z.number().positive().optional()
    })
});

export const createAcademicYearSchema = z.object({
    body: z.object({
        name: z.string().min(1, "Year name is required").max(50),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional()
    })
});

export const createInstallmentSchema = z.object({
    body: z.object({
        name: z.string().min(1, "Installment name required").max(200),
        amount: z.number().positive("Amount must be positive")
    })
});
