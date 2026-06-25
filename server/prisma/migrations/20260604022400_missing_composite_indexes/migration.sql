-- CreateIndex
CREATE INDEX "SystemLog_instituteId_action_createdAt_idx" ON "SystemLog"("instituteId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "OnlineQuiz_batchId_isFinalized_idx" ON "OnlineQuiz"("batchId", "isFinalized");

-- CreateIndex
CREATE INDEX "QuizSubmission_quizId_submittedAt_idx" ON "QuizSubmission"("quizId", "submittedAt");
