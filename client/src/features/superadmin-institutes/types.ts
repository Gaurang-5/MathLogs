export type InstituteDirectoryItem = {
  id: string;
  name: string;
  teacherName: string | null;
  phoneNumber: string | null;
  email: string | null;
  status: string;
  plan: string;
  planExpiryDate: string | null;
  accessKind: 'FULL' | 'PAGE_ONLY' | 'QUIZ_ONLY';
  isQuizOnly: boolean;
  ownershipStatus: string;
  isPubliclyListed: boolean;
  students: number;
  batches: number;
  openSupportCount: number;
  attention: string[];
  updatedAt: string;
};

export type InstituteDirectoryResponse = { items: InstituteDirectoryItem[]; page: number; pageSize: number; total: number };

export type InstituteWorkspaceData = {
  overview: {
    id: string; name: string; teacherName: string | null; phoneNumber: string | null; email: string | null;
    city: string | null; area: string | null; address: string | null; status: string; suspensionReason: string | null;
    accessKind: string; createdAt: string; updatedAt: string;
  };
  account: { admins: Array<{ id: string; username: string; role: string }> };
  usage: { students: number; batches: number; tests: number; maxStudents: number; quizCredits: number; isQuizOnly: boolean; allowedClasses: string[]; subjects: string[]; requiresGrades: boolean };
  billing: { plan: string; planStartDate: string | null; planExpiryDate: string | null; operations: BillingOperation[] };
  marketplace: { ownershipStatus: string; isPubliclyListed: boolean; isVerified: boolean; openClaims: number; pendingReviews: number };
  leads: Record<string, number>;
  support: {
    tickets: Array<{ id: string; reference: string; category: string; subject: string; priority: string; status: string; updatedAt: string }>;
    cases: Array<{ id: string; title: string; category: string; priority: string; status: string; followUpAt: string | null; updatedAt: string }>;
    sessions: Array<{ id: string; reason: string; ticketId?: string | null; caseId?: string | null; expiresAt: string; endedAt: string | null; createdAt: string }>;
  };
  activity: Array<{ id: string; action: string; source: string; createdAt: string; actorAdmin?: { username: string } | null }>;
};

export type BillingOperation = {
  id: string; type: string; reason: string; status: string; effectiveAt: string | null; appliedAt: string | null;
  error: string | null; attempts: number; retryable?: boolean; createdAt: string;
};

export type OnboardingInput = {
  owner: { name: string; phone: string; email?: string };
  institute: { name: string; city?: string; area?: string; address?: string };
  access: { kind: 'FULL' | 'PAGE_ONLY' | 'QUIZ_ONLY' };
  billing: { plan: 'FREE' | 'BASIC' | 'PRO' | 'ENTERPRISE'; trialDays: number; discountPercent: number };
  limits: { maxStudents: number; quizCredits: number };
  marketplace: { isPubliclyListed: boolean; isVerified: boolean };
};

export type InstituteWorkspaceTab = 'overview' | 'account' | 'usage' | 'billing' | 'marketplace' | 'leads' | 'support' | 'activity';
