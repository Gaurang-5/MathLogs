export interface InstituteConfig {
    maxStudents?: number;
    [key: string]: unknown;
}

export interface Lead {
    id?: string;
    phone?: string;
    step?: string;
    createdAt?: string;
    updatedAt?: string;
    tuitionName?: string;
    ownerName?: string;
    email?: string;
    planId?: string;
    billingCycle?: string;
    failureReason?: string;
    [key: string]: unknown;
}

export interface AnalyticsSummary {
    totalInstitutes?: number;
    totalStudents?: number;
    totalBatches?: number;
    totalRevenue?: number;
    [key: string]: unknown;
}

export interface Institute {
    id: string;
    name: string;
    teacherName?: string;
    phoneNumber?: string;
    email?: string;
    createdAt: string;
    status: string; // ACTIVE or SUSPENDED
    suspensionReason?: string;
    config?: InstituteConfig;
    _count: {
        batches: number;
        students: number;
    };
    admins: { username: string }[];
}

export interface InstituteProfile extends Institute {
    stats?: {
      dbUsageMB?: number;
      recordCounts?: { students: number; batches: number };
    };
    [key: string]: unknown;
}
