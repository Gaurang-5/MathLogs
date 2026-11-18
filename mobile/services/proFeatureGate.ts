export interface ProFeaturePrompt {
  feature: string;
  description?: string;
}
type ProFeatureListener = (prompt: ProFeaturePrompt) => void;

const listeners = new Set<ProFeatureListener>();

export function notifyProFeatureRequired(prompt: ProFeaturePrompt): void {
  listeners.forEach((listener) => {
    try {
      listener(prompt);
    } catch {
      // A presentation subscriber must never change the API request outcome.
    }
  });
}

export function subscribeToProFeatureRequired(
  listener: ProFeatureListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isProPlanRequiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const response = (error as { response?: { data?: { error?: unknown } } })
    .response;
  return response?.data?.error === "PRO_PLAN_REQUIRED";
}
