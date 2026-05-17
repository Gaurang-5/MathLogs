# 📋 Implementation Plan: MathLogs Intelligent Attendance System

> **Objective**: Implement a high-speed, cost-effective QR-based attendance kiosk for coaching centers with 100+ students.
> **Constraint focus**: No student phones, cost-effective (use existing hardware), and secure (Silent Audit).

---

## 🏗️ Project Type: MOBILE + BACKEND
**Primary Agents**: 
- `mobile-developer` (Kiosk UI & Scanner)
- `backend-specialist` (Attendance Logic & Sync)

---

## 🎯 Success Criteria
- [ ] **Throughput**: Scan 100 students in < 2 minutes on a single mid-range Android phone.
- [ ] **Security**: Capture a "Silent Audit" photo for every scan without slowing down the UI.
- [ ] **Offline-First**: Buffer scans locally if Wi-Fi is down and auto-sync later.
- [ ] **Engagement**: Display a personalized "Insightful Greet" for every student.

---

## 🛠️ Tech Stack
- **Mobile**: Expo (React Native) + `expo-camera` (for QR) + `expo-speech` (for Audio Greets).
- **Backend**: Node.js/Express + Prisma (Postgres) + WhatsApp API for instant parent notifications.

---

## 📝 Task Breakdown

### Phase 1: Backend Infrastructure
| Task ID | Name | Agent | Priority | Description |
| :--- | :--- | :--- | :--- | :--- |
| T1.1 | **Attendance Schema** | `backend` | P0 | Create `AttendanceLog` model in Prisma with `studentId`, `timestamp`, and `auditPhotoUrl`. |
| T1.2 | **QR Generator API** | `backend` | P1 | Enhance `/batches/:id/qr-pdf` to generate high-contrast printable ID sheets for 100 students. |
| T1.3 | **Bulk Sync Endpoint** | `backend` | P0 | Create a `/attendance/bulk-sync` endpoint to handle buffered logs from the kiosk. |

### Phase 2: Mobile Kiosk Mode
| Task ID | Name | Agent | Priority | Description |
| :--- | :--- | :--- | :--- | :--- |
| T2.1 | **Continuous Scanner** | `mobile` | P0 | Implement a "Zero-Lag" QR scanner that resets immediately after a successful detect. |
| T2.2 | **Silent Audit Capture** | `mobile` | P1 | Trigger a background photo capture on successful QR scan (no shutter sound). |
| T2.3 | **Insightful Greet UI** | `mobile` | P2 | Build the "Welcome Screen" that shows student name, photo, and a "Data Insight" (e.g., "5-day streak!"). |
| T2.4 | **Kiosk Lock Mode** | `mobile` | P2 | Add a PIN-protected view that hides navigation tabs and system bars. |

### Phase 3: Web Admin & Reporting
| Task ID | Name | Agent | Priority | Description |
| :--- | :--- | :--- | :--- | :--- |
| T3.1 | **Attendance Dashboard** | `frontend` | P1 | Add an "Attendance" tab in `BatchDetails.tsx` showing the day's logs and audit photos. |
| T3.2 | **Instant WhatsApp** | `backend` | P1 | Trigger a "Safe Arrival" WhatsApp message to parents via a background worker. |

---

## 🏁 Phase X: Final Verification
- [ ] Run `python .agent/scripts/verify_all.py .`
- [ ] Test Kiosk mode sync with 100 simulated pings.
- [ ] Confirm WhatsApp templates pass "Human-like" quality check.
