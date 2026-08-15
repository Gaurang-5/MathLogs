export type SupportPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type SupportStatus = 'NEW' | 'IN_PROGRESS' | 'WAITING_ON_INSTITUTE' | 'RESOLVED' | 'CLOSED';

export type SupportTicket = {
  id: string;
  reference: string;
  instituteId: string;
  category: string;
  subject: string;
  description: string;
  priority: SupportPriority;
  status: SupportStatus;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  institute: { id: string; name: string; teacherName: string | null; phoneNumber: string | null; email: string | null };
  attachments: Array<{ id: string; fileName: string; contentType: string; sizeBytes: number; createdAt: string }>;
  messages?: SupportMessage[];
};

export type SupportMessage = {
  id: string;
  visibility: 'PUBLIC' | 'INTERNAL';
  body: string;
  createdAt: string;
  authorAdmin: { id: string; username: string; role: string } | null;
};

export type InternalCase = {
  id: string;
  instituteId: string;
  title: string;
  category: string;
  priority: SupportPriority;
  status: string;
  followUpAt: string | null;
  linkedType: string | null;
  linkedId: string | null;
  createdAt: string;
  updatedAt: string;
  institute: { id: string; name: string };
  notes?: Array<{ id: string; body: string; createdAt: string; authorAdmin: { id: string; username: string } }>;
};
