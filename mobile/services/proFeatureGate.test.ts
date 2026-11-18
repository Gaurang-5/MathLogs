import assert from "node:assert/strict";
import test from "node:test";
import {
  notifyProFeatureRequired,
  isProPlanRequiredError,
  subscribeToProFeatureRequired,
  type ProFeaturePrompt,
} from "./proFeatureGate";

test("Pro feature prompts reach active subscribers only", () => {
  const received: ProFeaturePrompt[] = [];
  const unsubscribe = subscribeToProFeatureRequired((prompt) =>
    received.push(prompt),
  );

  notifyProFeatureRequired({
    feature: "AI quizzes",
    description: "Upgrade to Pro.",
  });
  unsubscribe();
  notifyProFeatureRequired({ feature: "Online quizzes" });

  assert.deepEqual(received, [
    { feature: "AI quizzes", description: "Upgrade to Pro." },
  ]);
});
test("Pro plan errors are recognized without treating other access errors as upgrades", () => {
  assert.equal(
    isProPlanRequiredError({
      response: { data: { error: "PRO_PLAN_REQUIRED" } },
    }),
    true,
  );
  assert.equal(
    isProPlanRequiredError({ response: { data: { error: "Unauthorized" } } }),
    false,
  );
  assert.equal(isProPlanRequiredError(new Error("offline")), false);
});
