# Mini-Website & Lead Gen - Implementation Plan

Since we are moving fast, I've designed the most robust and professional MVP path based on standard SaaS best practices. 

## 🏗 System Architecture Assumptions
1. **Public URL Strategy**: We will generate a unique identifier (slug) for each institute (e.g., `yourdomain.com/i/sharma-classes`).
2. **Clean Separation of Data**: We will create a fresh `StudentLead` database table. Inquiries will **NOT** pollute the teacher's active `Student` roster until they formally "Approve & Convert" the lead.
3. **Privacy Control**: We will embed a toggle in the Institute Config to let teachers "Hide Fees" from the public page if they fear local competitors.

---

## 📋 The 4-Phase Implementation Breakdown

### Phase 1: Database Expansion (Prisma)
- **Update `Institute` Model**: Add a unique `slug` field and `aboutUs` description field.
- **Create `StudentLead` Model**:
  - `id`, `studentName`, `parentName`, `parentPhone`
  - `batchInterestId` (optional, if they selected a specific batch)
  - `status` (`NEW`, `CONTACTED`, `CONVERTED`, `LOST`)
  - `instituteId`
- *Action*: `npx prisma db push --accept-data-loss`

### Phase 2: Public API & Lead Capture (Backend)
- **`GET /api/public/i/:slug`**: A highly secured, read-only public endpoint that only returns non-sensitive data (Institute Name, Bio, Active Batches with available seats/pricing).
- **`POST /api/public/i/:slug/lead`**: The intake endpoint. Rate-limited to prevent form spam. Triggers an instant WhatsApp notification to the Teacher: *"New Lead: Parent Rahul inquired for 10th Math batch!"*.

### Phase 3: The Public Landing Page (Frontend)
- **Route**: Create `client/src/pages/PublicInstituteProfile.tsx` (`/i/:slug`).
- **Design**: A gorgeous, mobile-responsive clean aesthetic. 
  - Glass-morphism header with Institute Name.
  - Grid of available batches.
  - Sticky "Enroll Now" CTA that opens a modal form.

### Phase 4: Teacher Leads Dashboard (Frontend)
- **Route Update**: Add a "Leads Pipeline" tab to the Teacher's main Layout.
- **UI Design**: A Kanban board (or elegant multi-status list) where teachers can view incoming leads, mark them as 'Contacted', and hit a magic `Convert` button that automatically transfers the data into an active `Student`.
