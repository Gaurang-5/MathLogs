import { studentFieldValue, type ConfiguredStudent, type RegistrationFieldDefinition } from './registrationFields';

export function ConfiguredStudentFields({ student, fields }: { student: ConfiguredStudent; fields: RegistrationFieldDefinition[] }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    {fields.map(field => {
      const value = studentFieldValue(student, field);
      const callableNumber = field.type === 'tel' ? value.replace(/[^\d+]/g, '') : '';
      return <div key={field.id} className="flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-white p-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400">{field.label}</p>
          <p className="mt-1 break-words text-sm font-bold text-black">{value || 'Not provided'}</p>
        </div>
        {callableNumber && (
          <a
            href={`tel:${callableNumber}`}
            aria-label={`Call ${field.label}`}
            className="shrink-0 rounded-lg bg-neutral-100 px-2.5 py-1.5 text-[11px] font-bold text-neutral-700 hover:bg-neutral-200"
          >
            Call
          </a>
        )}
      </div>;
    })}
  </div>;
}
