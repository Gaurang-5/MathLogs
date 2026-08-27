import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { defaultEnrollmentFeeChoice, FeeApplicabilityStep } from './FeeApplicabilityStep';
import { listIdentityReviews, resolveIdentityReview } from './api';
import type { EnrollmentBatch, EnrollmentFeeChoice } from './types';

export function IdentityReviewQueue() {
  const queryClient = useQueryClient();
  const reviews = useQuery({ queryKey: ['identity-reviews'], queryFn: listIdentityReviews });
  if (!reviews.data?.length) return null;
  return <section className="mb-8 space-y-4"><div><h2 className="text-xl font-bold text-white">Possible duplicate profiles</h2><p className="text-sm text-slate-400">Review submitted details before choosing an identity.</p></div>
    {reviews.data.map(review => <IdentityReviewCard key={review.id} review={review} onResolved={() => queryClient.invalidateQueries({ queryKey: ['identity-reviews'] })} />)}
  </section>;
}

function IdentityReviewCard({ review, onResolved }: { review: any; onResolved: () => void }) {
  const batch: EnrollmentBatch = { ...review.batch, coachingFeeMode: review.institute.coachingFeeMode };
  const [choice, setChoice] = useState<{ action: 'USE_EXISTING' | 'CREATE_NEW'; studentId?: string } | null>(null);
  const [fee, setFee] = useState<EnrollmentFeeChoice>(() => defaultEnrollmentFeeChoice(batch));
  const submitted = review.submittedData as Record<string, string>;
  return <article className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5 text-white">
    <div className="grid gap-4 md:grid-cols-2"><div><p className="text-xs font-bold uppercase text-slate-500">Submitted</p><strong>{submitted.name}</strong><p className="text-sm text-slate-300">{submitted.parentName} · {submitted.parentWhatsapp}</p><p className="text-xs text-slate-500">For {batch.name}</p></div>
      <div className="space-y-2"><p className="text-xs font-bold uppercase text-slate-500">Possible existing profiles</p>{review.candidates.map((candidate: any) => <button key={candidate.id} onClick={() => setChoice({ action: 'USE_EXISTING', studentId: candidate.id })} className="block w-full rounded-xl border border-slate-700 p-3 text-left hover:border-blue-500"><strong>{candidate.name}</strong><p className="text-xs text-slate-400">{candidate.humanId || 'No ID'} · {candidate.parentWhatsapp}</p></button>)}
        <button onClick={() => setChoice({ action: 'CREATE_NEW' })} className="w-full rounded-xl border border-slate-700 p-3 font-semibold">Create separate student</button></div></div>
    {choice ? <div className="mt-5 rounded-2xl bg-white p-4 text-black"><FeeApplicabilityStep batch={batch} value={fee} onChange={setFee} /><button className="mt-4 w-full rounded-xl bg-black px-4 py-3 font-semibold text-white" onClick={async () => {
      try { await resolveIdentityReview(review.id, choice.action, choice.studentId, fee); toast.success('Identity review resolved'); onResolved(); } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not resolve review'); }
    }}>{choice.action === 'USE_EXISTING' ? 'Use this profile' : 'Create separate student'}</button></div> : null}
  </article>;
}
