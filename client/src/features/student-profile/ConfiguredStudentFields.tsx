import { studentFieldValue, type ConfiguredStudent, type RegistrationFieldDefinition } from './registrationFields';

export function ConfiguredStudentFields({ student, fields }: { student: ConfiguredStudent; fields: RegistrationFieldDefinition[] }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {fields.map(field => {
      const value = studentFieldValue(student, field);
      return <div key={field.id} className="rounded-xl border border-black/[0.06] bg-white p-3">
        <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{field.label}</p>
        <p className="mt-1 break-words text-sm font-bold text-black">{value || 'Not provided'}</p>
      </div>;
    })}
  </div>;
}
