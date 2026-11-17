import { validateMark } from './marks';

export interface QueuedMark {
  studentId: string;
  studentName: string;
  humanId: string | null;
  batchName: string;
  score: string;
  existingMark: number | null;
  researchCaptureId: string | null;
  researchReviewDurationMs?: number;
}

export function upsertQueuedMark(queue: QueuedMark[], next: QueuedMark) {
  const replaced = queue.find(item => item.studentId === next.studentId) ?? null;
  return {
    queue: [...queue.filter(item => item.studentId !== next.studentId), next],
    replaced,
  };
}

export function validateQueuedMarks(queue: QueuedMark[], maxMarks: number | undefined) {
  return queue.map(item => ({
    item,
    validation: validateMark(item.score, maxMarks),
  }));
}
