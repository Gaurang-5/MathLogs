-- AlterTable: Add CASCADE delete to Mark foreign keys

-- Drop existing foreign key constraints
ALTER TABLE "Mark" DROP CONSTRAINT IF EXISTS "Mark_testId_fkey";
ALTER TABLE "Mark" DROP CONSTRAINT IF EXISTS "Mark_studentId_fkey";

-- Re-add foreign key constraints with CASCADE delete
ALTER TABLE "Mark" ADD CONSTRAINT "Mark_testId_fkey" 
  FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Mark" ADD CONSTRAINT "Mark_studentId_fkey" 
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
