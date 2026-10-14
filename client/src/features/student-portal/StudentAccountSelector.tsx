export type StudentPortalAccount = {
  id: string;
  humanId: string | null;
  name: string;
  activeBatchNames: string[];
};

export function StudentAccountSelector({ students, selectingId, onSelect, onBack }: {
  students: StudentPortalAccount[];
  selectingId: string | null;
  onSelect: (student: StudentPortalAccount) => void | Promise<void>;
  onBack: () => void;
}) {
  return <div className="space-y-3">
    {students.map(student => <button
      key={student.id}
      type="button"
      disabled={selectingId !== null}
      onClick={() => void onSelect(student)}
      className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-left transition hover:border-accent hover:bg-white disabled:opacity-60"
    >
      <span className="block font-black text-app-text">{student.name}</span>
      <span className="mt-1 block text-xs font-semibold text-app-text-secondary">{student.humanId || 'Student ID not assigned'}</span>
      <span className="mt-1 block text-xs text-app-text-tertiary">{student.activeBatchNames.join(', ') || 'No active batches'}</span>
      {selectingId === student.id ? <span className="mt-2 block text-xs font-bold text-accent">Opening account…</span> : null}
    </button>)}
    <button type="button" disabled={selectingId !== null} onClick={onBack} className="w-full py-2 text-xs font-bold text-app-text-secondary disabled:opacity-60">
      Use a different mobile number
    </button>
  </div>;
}
