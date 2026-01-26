-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Batch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "className" TEXT,
    "timeSlot" TEXT,
    "feeAmount" REAL NOT NULL DEFAULT 0,
    "isRegistrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Batch" ("className", "createdAt", "feeAmount", "id", "name", "subject", "timeSlot", "updatedAt") SELECT "className", "createdAt", "feeAmount", "id", "name", "subject", "timeSlot", "updatedAt" FROM "Batch";
DROP TABLE "Batch";
ALTER TABLE "new_Batch" RENAME TO "Batch";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
