# WhatsApp Integration Plan (Option A)

## 1. Requirements & Prerequisites
To use the Official WhatsApp Business API, you need:
- **Meta Business Account:** A verified Business Manager account.
- **Phone Number:** A clean phone number (not currently active on personal WhatsApp app).
- **API Provider:** We will design an **Adapter Pattern** so you can switch providers (Twilio, Meta Cloud API, or WATI) easily.
  - *Recommendation:* **Meta Cloud API** (Cheapest, direct) or **Twilio** (Easiest developer experience).
- **Templates:** You cannot send free-form messages to users who haven't messaged you first. You must register templates like:
  - `fee_reminder_v1`: "Hello {{1}}, recall your fees of ₹{{2}} is due."
  - `exam_result_v1`: "Hello {{1}}, you scored {{2}} in {{3}}."

## 2. Database Schema (Prisma)
We need a job queue to handle bulk sending without blocking the server.

### New Model: `WhatsappJob`
```prisma
model WhatsappJob {
  id          String    @id @default(uuid())
  recipient   String    // Phone number (E.164 format: +91...)
  templateId  String    // e.g., "fee_reminder"
  data        Json      // Variables: ["Rahul", "5000"]
  status      JobStatus @default(PENDING) // PENDING, PROCESSING, COMPLETED, FAILED
  attempts    Int       @default(0)
  maxAttempts Int       @default(3)
  error       String?
  messageId   String?   // External ID from provider
  
  instituteId String?   // For usage tracking/billing per institute
  
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([status])
  @@index([createdAt])
}
```

## 3. Architecture

### A. The Service Layer (`src/services/whatsappService.ts`)
- `sendWhatsapp(to, template, variables)`: Adds a job to the database.
- **Adapter Interface:** abstract logic so we can swap Twilio/Meta later.

### B. The Worker (`src/utils/whatsappWorker.ts`)
- Runs in background (similar to `emailWorker`).
- Polls `WhatsappJob` table for `PENDING` jobs.
- Calls the actual Provider API.
- Updates status to `COMPLETED` or `FAILED`.
- Handles rate limiting (Meta has limits like 80 messages/sec).

### C. Webhooks (Optional Phase 2)
- Endpoint to receive `DELIVERED` and `READ` receipts.

## 4. Implementation Steps

1.  **Schema Update:** Add `WhatsappJob` to `schema.prisma` and run migration.
2.  **Env Variables:** Add `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.
3.  **Worker Implementation:** Create `whatsappWorker.ts`.
4.  **Service Integration:** Add helper functions to queue messages.
5.  **Trigger Points:**
    - Call `whatsappService.queueResult(...)` when marks are updated.
    - Call `whatsappService.queueReminder(...)` when fee reminders are sent.

## 5. Cost Estimation (India)
- **Marketing/Utility:** ~₹0.80 per conversation (24hr window).
- **Service (User initiates):** ~₹0.30 per conversation.
- **Free Tier:** First 1,000 service conversations/month are free.

---

### Action Plan
1. [ ] Modify `schema.prisma`
2. [ ] Create `whatsappWorker.ts`
3. [ ] Integrate into `submitMark` and `sendFeeReminder` controllers.
