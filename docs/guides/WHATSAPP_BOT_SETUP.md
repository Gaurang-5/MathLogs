# 🤖 WhatsApp Automation Setup Guide

To create an "Automated Menu" (where users see options like "1. Pricing", "2. Features"), you need to use the **WhatsApp Business App** or an API service.

Since you are using a personal number (`8439245302`), the easiest way is to switch to **WhatsApp Business App** (Free).

## ✅ Step 1: Switch to WhatsApp Business
1.  Download **WhatsApp Business** from Play Store / App Store.
2.  Register with your number (`8439245302`).
3.  It will migrate your chats from personal WhatsApp (make a backup first!).

## 🤖 Step 2: Set Up Auto-Reply (The "Menu")
You can create a "Greeting Message" that acts as a menu.

1.  Open **Settings** > **Business Tools** > **Greeting Message**.
2.  Enable **Send greeting message**.
3.  Edit the message to look like a menu:

    ```text
    Hi! Welcome to MathLogs via Gaurang. 
    How can we help you today?

    Reply with a number:
    1️⃣ Pricing Info
    2️⃣ Features Demo
    3️⃣ Talk to Support
    ```
4.  Save.

## ⚡ Step 3: Set Up Quick Replies (The "Automation")
Now, set up the answers for "1", "2", and "3".

1.  Go to **Settings** > **Business Tools** > **Quick Replies**.
2.  Add a new reply:
    -   **Shortcut:** `/1`
    -   **Message:** "MathLogs offers Marketplace (₹99 one-time, free for now), Quiz (₹249/month or ₹2,499/year), and Enterprise (₹499/month or ₹4,999/year). Every plan supports unlimited students. See https://mathlogs.app"
3.  Add another:
    -   **Shortcut:** `/2`
    -   **Message:** "MathLogs helps you track fees, attendence, and marks. Watch our demo here: [YouTube Link]"

**How it works:**
-   User sends "Hi" (via your website button).
-   Auto-Reply sends the "Menu".
-   User replies "1".
-   You (or an automation tool) reply with the saved shortcut `/1`.

> **Note:** For *fully* automated replies (where the bot replies to "1" without you touching it), you need a third-party tool like **Wati**, **Interakt**, or **WABox**. The WhatsApp Business App requires you to tap the Quick Reply manually.

## Marketplace operations templates

The server-side Meta WhatsApp queue requires these approved template names:

```env
WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_APPROVED=
WHATSAPP_TEMPLATE_MARKETPLACE_CLAIM_REJECTED=
WHATSAPP_TEMPLATE_MARKETPLACE_LEAD=
```

Template parameters are positional and must remain in this order:

1. Claim approved: `claimant_name`, `institute_name`, `login_url`.
2. Claim rejected: `claimant_name`, `institute_name`, `rejection_reason`, `support_url`.
3. Marketplace lead: `owner_name`, `institute_name`, `student_name`, `class_subject_summary`, `settings_url`.

If a template has a dynamic URL button, use the final URL parameter for that button: `login_url`, `support_url`, or `settings_url`. The worker passes Meta the URL suffix expected by a dynamic button.

Marketplace messages are queued and tracked by job ID. `QUEUED` means the database job was accepted; only the worker changes the related claim to `SENT` or the lead to `DELIVERED`. Exhausted worker retries set the related record to `FAILED` and retain a bounded error. Superadmin retry actions create a new tracked job and increment the marketplace retry counter.

Claim approval and rejection are committed before notification queueing. Missing template configuration or queue failure therefore leaves the saved decision intact and exposes a retryable `FAILED` communication state.

## Plan lifecycle templates

Create and obtain Meta approval for these operational templates:

```env
WHATSAPP_TEMPLATE_PLAN_TRIAL_STARTED=
WHATSAPP_TEMPLATE_PLAN_ACTIVATED=
WHATSAPP_TEMPLATE_PLAN_EXPIRY_APPROACHING=
WHATSAPP_TEMPLATE_PLAN_PAYMENT_DUE=
WHATSAPP_TEMPLATE_PLAN_PAYMENT_FAILED=
WHATSAPP_TEMPLATE_PLAN_PAYMENT_SUCCEEDED=
WHATSAPP_TEMPLATE_PLAN_MARKETPLACE_FALLBACK=
WHATSAPP_TEMPLATE_AUTOPAY_AUTHORIZED=
WHATSAPP_TEMPLATE_AUTOPAY_ACTIVATED=
WHATSAPP_TEMPLATE_AUTOPAY_CHARGE_UPCOMING=
WHATSAPP_TEMPLATE_AUTOPAY_GRACE_ENDING=
WHATSAPP_TEMPLATE_AUTOPAY_RECOVERED=
WHATSAPP_TEMPLATE_AUTOPAY_CANCELLED=
WHATSAPP_TEMPLATE_AUTOPAY_COMPLETED=
```

Every template uses the same ordered body variables: `owner_name`, `institute_name`, `plan_label`, `billing_cycle`, `formatted_amount`, `due_or_expiry_date`, `payment_link`, and `support_contact`. Keep that order unchanged in Meta. Email uses the configured no-reply SMTP account and the same persisted billing values.

To test safely, enable operational email/WhatsApp consent on a test institute, schedule a lifecycle event, run the notification dispatcher, then inspect the linked `PlanNotification`, `EmailJob`, or `WhatsappJob`. Missing consent, destination, SMTP configuration, or an approved Meta template produces a bounded `FAILED` state; it never changes plan access or payment state. Failed notifications can be returned to `PENDING` through the authorized Superadmin retry flow.
