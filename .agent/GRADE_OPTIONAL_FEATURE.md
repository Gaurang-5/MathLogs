# Grade/Class Optional Configuration Feature

## Overview
Implemented a flexible coaching center configuration system that supports both **grade-based** and **non-grade-based** coaching centers during onboarding.

## Problem Statement
Some coaching centers organize students by class/grade levels (Class 9, 10, 11, etc.), while others offer specialized courses where students are categorized only by batches, regardless of their school grade.

## Solution

### 1. **Database Schema Update**
- **File**: `server/prisma/schema.prisma`
- **Change**: Added `requiresGrades` boolean field to Institute config
- **Default**: `{"requiresGrades": true, "allowedClasses": ["9", "10"], "subjects": ["Math", "Science"]}`

### 2. **Onboarding Flow (Multi-Step Setup)**
- **File**: `client/src/pages/SetupAccount.tsx`
- **Features**:
  - **Step 1**: Username & Password creation
  - **Step 2**: Grade configuration
    - Question: "Does your coaching center use class/grade levels?"
    - **If YES**: User can add custom grades (Class 9, Class 10, Grade 8, etc.)
    - **If NO**: Skip grade configuration entirely
  - Progress indicator showing current step
  - Validation: Cannot proceed without selecting Yes/No

### 3. **Backend - Setup Account Controller**
- **File**: `server/src/controllers/inviteController.ts`
- **Changes**:
  - Accepts `requiresGrades` and `allowedClasses` from request body
  - Updates institute config during account setup
  - Stores configuration in database for future use

### 4. **Backend - Batch Creation Controller**
- **File**: `server/src/controllers/batchController.ts`
- **Logic**:
  
  **For Grade-Based Institutes** (`requiresGrades: true`):
  - Validates that `className` is in `allowedClasses`
  - Enforces batch number limits per class
  - Batch naming: `"Class 10 - Batch 1"`
  - Requires both `className` and `batchNumber`
  
  **For Non-Grade Institutes** (`requiresGrades: false`):
  - Skips `className` validation entirely
  - Only validates `batchNumber`
  - Batch naming: `"Mathematics - Batch 1"` (subject-based)
  - Sets `className` to `null` in database
  - Allows unlimited batches (no class-based limits)

### 5. **Frontend - Batch Creation Form**
- **File**: `client/src/pages/BatchList.tsx`
- **Features**:
  - Fetches institute config on component mount
  - Conditionally renders form fields based on `requiresGrades`
  
  **When `requiresGrades: true`**:
  - Shows "Class/Grade" dropdown (populated from `allowedClasses`)
  - Shows "Batch Number" dropdown (1-5)
  - Batch number dropdown disabled until class is selected
  
  **When `requiresGrades: false`**:
  - Hides "Class/Grade" dropdown completely
  - Shows simple number input for "Batch Number"
  - No class-based restrictions

## User Flow

### Grade-Based Coaching Center
1. Super Admin creates invite
2. Admin receives invite link
3. During setup:
   - Creates username/password
   - Selects **"Yes"** for grades
   - Adds grades: "Class 9", "Class 10", "Class 11"
4. When creating batches:
   - Must select a class first
   - Then select batch number
   - Batch created as "Class 10 - Batch 2"

### Non-Grade Coaching Center (Specialized Courses)
1. Super Admin creates invite
2. Admin receives invite link
3. During setup:
   - Creates username/password
   - Selects **"No"** for grades
   - Skips grade configuration
4. When creating batches:
   - No class selection needed
   - Directly enters batch number
   - Batch created as "Advanced Python - Batch 1"

## Database Structure

### Institute Config Examples

**Grade-Based**:
```json
{
  "requiresGrades": true,
  "allowedClasses": ["Class 9", "Class 10", "Class 11"],
  "subjects": ["Math", "Science", "English"]
}
```

**Non-Grade-Based**:
```json
{
  "requiresGrades": false,
  "allowedClasses": [],
  "subjects": ["Web Development", "Data Science", "AI/ML"]
}
```

### Batch Records

**Grade-Based Batch**:
```json
{
  "name": "Class 10 - Batch 2",
  "className": "Class 10",
  "batchNumber": 2,
  "subject": "Mathematics"
}
```

**Non-Grade Batch**:
```json
{
  "name": "Web Development - Batch 1",
  "className": null,
  "batchNumber": 1,
  "subject": "Web Development"
}
```

## Key Benefits

1. **Flexibility**: Supports both traditional grade-based and modern specialized course models
2. **User-Friendly**: Clear onboarding flow with visual feedback
3. **Validation**: Proper backend validation prevents invalid batch creation
4. **Scalability**: Easy to add more configuration options in the future
5. **Backward Compatible**: Existing institutes default to `requiresGrades: true`

## Testing Checklist

- [x] Prisma schema updated
- [x] Backend controller handles both modes
- [x] Frontend form conditionally renders
- [x] Onboarding flow works for both scenarios
- [ ] Test creating batches in grade-based institute
- [ ] Test creating batches in non-grade institute
- [ ] Verify batch listing displays correctly for both types
- [ ] Test duplicate batch validation for both types

## Next Steps

1. **Test the implementation** with a new institute
2. **Update batch listing UI** to handle null className gracefully
3. **Add migration script** for existing institutes to set `requiresGrades: true`
4. **Update batch details page** to handle non-grade batches
5. **Consider adding batch limits** for non-grade institutes (currently unlimited)
