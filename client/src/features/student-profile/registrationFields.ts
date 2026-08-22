export type RegistrationFieldDefinition = {
  id: string;
  label: string;
  type: string;
  required?: boolean;
  system?: boolean;
  sendAlerts?: boolean;
};

export type ConfiguredStudent = {
  name?: string | null;
  parentName?: string | null;
  parentWhatsapp?: string | null;
  parentEmail?: string | null;
  schoolName?: string | null;
  additionalData?: Record<string, unknown> | null;
};

const systemFieldKeys: Record<string, keyof ConfiguredStudent> = {
  studentName: 'name',
  name: 'name',
  parentName: 'parentName',
  parentWhatsapp: 'parentWhatsapp',
  parentEmail: 'parentEmail',
  schoolName: 'schoolName',
};

export function studentFieldValue(student: ConfiguredStudent, field: RegistrationFieldDefinition): string {
  const systemKey = systemFieldKeys[field.id];
  const value = systemKey ? student[systemKey] : student.additionalData?.[field.id];
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
