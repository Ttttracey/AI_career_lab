-- Formal source text is immutable. Portfolio membership is independently editable.
CREATE TRIGGER "Submission_immutable_formal"
BEFORE UPDATE OF "content", "version", "taskId", "userId", "isDraft", "requestKey" ON "Submission"
WHEN OLD."isDraft" = 0
BEGIN
  SELECT RAISE(ABORT, 'Formal submission text is immutable');
END;
CREATE TRIGGER "Assessment_immutable_answers"
BEFORE UPDATE OF "answers" ON "Assessment"
WHEN OLD."completedAt" IS NOT NULL AND NEW."answers" != OLD."answers"
BEGIN
  SELECT RAISE(ABORT, 'Completed assessment answers are immutable');
END;
CREATE TRIGGER "InterviewTurn_immutable_answer"
BEFORE UPDATE OF "answer", "answerKey", "question", "skillId" ON "InterviewTurn"
WHEN OLD."answer" IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'Submitted interview answer is immutable');
END;
