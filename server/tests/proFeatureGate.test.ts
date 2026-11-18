import assert from "node:assert/strict";
import test from "node:test";
import { proFeatureForRequest } from "../src/middleware/auth";

function request(originalUrl: string, method = "POST", body: unknown = {}) {
  return { originalUrl, method, body } as Parameters<
    typeof proFeatureForRequest
  >[0];
}

test("server-only teacher services require their matching Pro capability", () => {
  assert.equal(
    proFeatureForRequest(request("/api/scan-ocr"))?.capability,
    "scanMarks",
  );
  assert.equal(
    proFeatureForRequest(request("/api/batches/batch-1/invite"))?.capability,
    "whatsappInvites",
  );
  assert.equal(
    proFeatureForRequest(request("/api/batches/batch-1/whatsapp-invite"))
      ?.capability,
    "whatsappInvites",
  );
  assert.equal(
    proFeatureForRequest(request("/api/students/student-1/whatsapp-invite"))
      ?.capability,
    "whatsappInvites",
  );
  assert.equal(
    proFeatureForRequest(request("/api/fees/remind"))?.capability,
    "whatsappReminders",
  );
  assert.equal(
    proFeatureForRequest(request("/api/month-coverage/reminders"))?.capability,
    "whatsappReminders",
  );
  assert.equal(
    proFeatureForRequest(request("/api/tests/generate"))?.capability,
    "aiQuizGeneration",
  );
  assert.equal(
    proFeatureForRequest(request("/api/tests/online"))?.capability,
    "onlineQuizDelivery",
  );
});
test("manual student addition remains a Basic feature", () => {
  assert.equal(proFeatureForRequest(request("/api/students/manual")), null);
  assert.equal(
    proFeatureForRequest(request("/api/batches/batch-1/enrollments")),
    null,
  );
});

test("batch edits require Pro only when adding a WhatsApp group link", () => {
  assert.equal(
    proFeatureForRequest(
      request("/api/batches/batch-1", "PUT", { name: "Class 10" }),
    ),
    null,
  );
  assert.equal(
    proFeatureForRequest(
      request("/api/batches/batch-1", "PUT", { whatsappGroupLink: "" }),
    ),
    null,
  );
  assert.equal(
    proFeatureForRequest(
      request("/api/batches/batch-1", "PUT", {
        whatsappGroupLink: "https://chat.whatsapp.com/example",
      }),
    )?.capability,
    "whatsappGroupLinks",
  );
});
