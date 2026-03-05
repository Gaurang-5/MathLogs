# Customer Onboarding Flow with Razorpay

## 🎯 Overview
Implementing a multi-step customer onboarding flow that collects essential client information (name, phone, email, billing address) prior to plan selection and Razorpay payment. 

**Project Type:** WEB (React Frontend + Node.js Backend)

## 📋 Success Criteria
- [ ] Users can navigate through a multi-step wizard.
- [ ] Users input basic details (Name, Phone, Email, Address) in Step 1.
- [ ] Users select a subscription plan in Step 2.
- [ ] Razorpay checkout is successfully initiated in Step 3.
- [ ] User state is saved after successful payment and account is provisioned.
- [ ] Webhook integration or synchronous success handler captures payment status.

## � Pricing Tiers
| Feature | 🌱 Basic Plan | 🚀 Pro Plan | 🏢 Custom (Enterprise) |
| :--- | :--- | :--- | :--- |
| **Student Limit** | Up to 80 Students | Up to 250 Students | Unlimited |
| **Monthly Price** | ₹999 / month | ₹1,999 / month | *Contact Sales* |
| **Yearly Price** | ₹10,989 / year *(1 month free)* | ₹21,989 / year *(1 month free)* | *Contact Sales* |
| **Other Limits** | Standard Exports, 1 Admin | Advanced Exports, 3 Admins | Custom Limits |

## �🛠️ Tech Stack & Requirements
- **Frontend:** React (State Management for Multi-step Form)
- **Backend:** Node.js / Express
- **Database:** Prisma/PostgreSQL (Assuming existing stack based on context)
- **Payment Gateway:** Razorpay SDK (Client) + `razorpay` npm package (Server)
- **Validation:** Zod (or equivalent for form validation)

## 📁 Suggested File Structure Updates
```text
client/src/
  ├── components/
  │   └── onboarding/
  │       ├── OnboardingWizard.tsx     # Main container holding state
  │       ├── StepClientInfo.tsx       # Name, Phone, Email, Billing
  │       ├── StepPlanSelection.tsx    # Plan options
  │       └── StepPayment.tsx          # Razorpay integration
  └── pages/
      └── Onboarding.tsx               # Route component

server/src/
  ├── controllers/
  │   └── paymentController.ts         # Handles order creation & verification
  └── routes/
      └── paymentRoutes.ts             # API endpoints for Razorpay
```

## 📝 Task Breakdown

### 1. Backend Payment Infrastructure (Backend Specialist)
**Agent:** `backend-specialist` | **Skill:** `api-patterns`
*   **Description:** Setup Razorpay account integration, API keys, and essential backend routes.
*   **Dependencies:** None
*   **INPUT:** Razorpay API keys (from `.env`).
*   **OUTPUT:** `/api/payment/create-order` and `/api/payment/verify` endpoints.
*   **VERIFY:** Postman/Curl to `/api/payment/create-order` returns a valid Razorpay order ID.

### 2. Frontend Multi-step Form Skeleton (Frontend Specialist)
**Agent:** `frontend-specialist` | **Skill:** `frontend-design`
*   **Description:** Create the `OnboardingWizard`, `StepClientInfo`, and `StepPlanSelection` components with state management (e.g., `useState` or Context API).
*   **Dependencies:** None
*   **INPUT:** Figma/UI requirements (or standard Tailwind UI).
*   **OUTPUT:** A fully navigable UI wizard (Next/Back buttons) without API connections.
*   **VERIFY:** User can click "Next" from Step 1 to Step 2 and data is retained in parent state.

### 3. Frontend Validation & Integration (Frontend Specialist)
**Agent:** `frontend-specialist` | **Skill:** `react-best-practices`
*   **Description:** Add form validation for name, phone, email, and billing address. Connect Plan Selection step to a predefined list of plans.
*   **Dependencies:** Task 2
*   **INPUT:** Step 1 & 2 UI components.
*   **OUTPUT:** Validated inputs that prevent "Next" if empty/invalid.
*   **VERIFY:** Empty fields throw UI errors; valid fields allow progression.

### 4. Razorpay Client Integration (Frontend Specialist)
**Agent:** `frontend-specialist` | **Skill:** `frontend-design`
*   **Description:** Integrate Razorpay Checkout (`window.Razorpay`) in Step 3. Connect to the backend `/create-order` endpoint.
*   **Dependencies:** Task 1, Task 2
*   **INPUT:** Multi-step wizard state containing selected plan and client info.
*   **OUTPUT:** "Pay Now" button triggers Razorpay modal.
*   **VERIFY:** Razorpay test modal opens and accepts test card details.

### 5. Post-Payment Provisioning Hook (Backend Specialist)
**Agent:** `backend-specialist` | **Skill:** `database-design`
*   **Description:** Handle the successful payment response (verification limit). Create the User/Tenant record in the DB and mark them as active.
*   **Dependencies:** Task 1, Task 4
*   **INPUT:** Payment verification payload.
*   **OUTPUT:** Database record creation logic.
*   **VERIFY:** DB shows new active user after successful test payment.

## 🏁 Phase X: Final Verification
- [ ] Complete `npm run lint` and TypeScript checks.
- [ ] Verify form validation prevents empty submissions.
- [ ] Confirm Razorpay test transactions succeed end-to-end.
- [ ] Ensure database creates user properly post-payment.
- [ ] No purple/violet hex codes used in standard styling.
- [ ] `checklist.py` passes.
