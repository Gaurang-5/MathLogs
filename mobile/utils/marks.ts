export type MarkValidation =
  | { ok: true; score: number }
  | { ok: false; message: string };

export function validateMark(value: string, maxMarks: number | undefined): MarkValidation {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return { ok: false, message: 'Enter a non-negative number.' };
  }
  const score = Number(normalized);
  if (!Number.isFinite(score) || score < 0) {
    return { ok: false, message: 'Enter a valid non-negative mark.' };
  }
  if (maxMarks !== undefined && Number.isFinite(maxMarks) && score > maxMarks) {
    return { ok: false, message: `Marks cannot exceed ${maxMarks}.` };
  }
  return { ok: true, score };
}
