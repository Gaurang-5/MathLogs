# PLAN: Super Admin Portal Redesign (Option C)

## Goal
Transform the current single-page `SuperAdminDashboard.tsx` into a modern, multi-workspace segmented portal with a sidebar navigation, distinct tab views, and a premium minimal UI (Glassmorphism inspired).

## Phase 1: Context & Structuring
Instead of one massive 1200+ line file, we will break the portal down into smaller, focused components. We will keep the main route (`/super-admin`) the same in `App.tsx`, but internally `SuperAdminDashboard.tsx` will act as a layout and router for its own sub-views using state or search params (e.g., `?tab=overview`).

### Directories & Files to Create
```text
client/src/pages/superadmin/
  ├── SuperAdminLayout.tsx      (Sidebar + Container)
  ├── OverviewTab.tsx           (Top-level Analytics & "Needs Attention" Alerts)
  ├── InstitutesTab.tsx         (List, Search, Edit Config)
  └── OnboardingTab.tsx         (Leads Table, Generate Link Modal)
```

## Phase 2: Building the Views

### 1. `SuperAdminLayout`
- A persistent left sidebar with navigation links: Overview, Institutes, Onboarding Pipelines.
- A clean top navbar showing the page title and logout button.

### 2. `OverviewTab` (The Dashboard)
- **Top section:** "Needs Attention" feed. A logic block that scans `institutes` and `leads` to show warnings (e.g. "Suspended Institutes", "Leads stuck in Payment Failed").
- **Metrics Grid:** Total Institutes, Revenue, Active Students.

### 3. `InstitutesTab`
- A reimagined list/table of active institutes.
- Action buttons remain functional: Details, Edit Plan, Config, Suspend, Delete.
- A slide-over panel (drawer) for editing Details/Config instead of a screen-covering center modal, keeping the admin in context.

### 4. `OnboardingTab`
- The Onboarding Leads table with improved status pill UI.
- The "Onboard Institute" (Generate Invite Link) button moved here, opening its dedicated form.

## Phase 3: Assembly & Cleanup
1. Move the existing state (institutes, leads, analytics) into custom hooks or context if necessary, or pass them down as props from the top level `SuperAdminDashboard`. 
2. Replace `client/src/pages/SuperAdminDashboard.tsx` content with the new Layout/Tab logic.
3. Verify all Tailwind CSS formatting feels premium (rounded corners, subtle shadows, gray text for secondary info, vibrant accent colors for status tags).

## Phase 4: Final Testing
- Run typescript checks.
- Verify that `fetchData` successfully pulls all info and passes it to the correct tabs.
- Ensure the Onboarding link generation and Modals still work perfectly.

---

### Approval Gate
Please confirm if this structure looks good, and I will begin the implementation!
