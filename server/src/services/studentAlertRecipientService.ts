export type AlertRegistrationField = {
  id: string;
  type?: string;
  sendAlerts?: boolean;
};

export type AlertRecipientInput = {
  parentWhatsapp?: string | null;
  additionalData?: Record<string, unknown> | null;
  registrationFields?: AlertRegistrationField[] | null;
};

function normalizeIndianMobile(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 10) return null;
  const mobile = digits.slice(-10);
  return /^[6-9]\d{9}$/.test(mobile) ? mobile : null;
}

export function resolveStudentAlertRecipients(input: AlertRecipientInput): string[] {
  const recipients: string[] = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    const normalized = normalizeIndianMobile(value);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      recipients.push(normalized);
    }
  };
  add(input.parentWhatsapp);
  for (const field of input.registrationFields ?? []) {
    if (field.type === 'tel' && field.sendAlerts === true) add(input.additionalData?.[field.id]);
  }
  return recipients;
}

export async function sendStudentAlert<T>(
  input: AlertRecipientInput,
  sender: (recipient: string) => Promise<T>,
): Promise<{ attempted: number; delivered: number; failed: number }> {
  const recipients = resolveStudentAlertRecipients(input);
  const results = await Promise.allSettled(recipients.map(recipient => sender(recipient)));
  const delivered = results.filter(result => result.status === 'fulfilled').length;
  return { attempted: recipients.length, delivered, failed: recipients.length - delivered };
}

type StudentAlertLookup = {
  student: {
    findFirst(args: unknown): Promise<{
      parentWhatsapp: string | null;
      additionalData: unknown;
      institute: { config: unknown } | null;
    } | null>;
  };
};

export async function sendStudentAlertForStudent<T>(
  studentId: string,
  sender: (recipient: string) => Promise<T>,
  client?: StudentAlertLookup,
): Promise<{ attempted: number; delivered: number; failed: number }> {
  const lookup = client ?? (await import('../prisma')).prisma as unknown as StudentAlertLookup;
  const student = await lookup.student.findFirst({
    where: { id: studentId },
    select: { parentWhatsapp: true, additionalData: true, institute: { select: { config: true } } },
  });
  if (!student) return { attempted: 0, delivered: 0, failed: 0 };
  const config = student.institute?.config as { registrationForm?: { fields?: AlertRegistrationField[] } } | null;
  return sendStudentAlert({
    parentWhatsapp: student.parentWhatsapp,
    additionalData: student.additionalData as Record<string, unknown> | null,
    registrationFields: config?.registrationForm?.fields ?? [],
  }, sender);
}
