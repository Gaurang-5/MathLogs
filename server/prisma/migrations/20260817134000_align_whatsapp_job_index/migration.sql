DO $$
BEGIN
  IF to_regclass('"WhatsappJob_superAdminEntityType_superAdminEntityId_createdAt_i"') IS NOT NULL
     AND to_regclass('"WhatsappJob_superAdminEntityType_superAdminEntityId_created_idx"') IS NULL THEN
    ALTER INDEX "WhatsappJob_superAdminEntityType_superAdminEntityId_createdAt_i"
      RENAME TO "WhatsappJob_superAdminEntityType_superAdminEntityId_created_idx";
  END IF;
END $$;
