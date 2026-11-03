-- Immutable training evidence. Deletion remains possible through explicit local reset.
CREATE TRIGGER "archive_immutable" BEFORE UPDATE ON "ArchiveSnapshot"
BEGIN SELECT RAISE(ABORT, 'Archive snapshots are immutable'); END;
CREATE TRIGGER "quiz_attempt_immutable" BEFORE UPDATE ON "QuizAttempt"
BEGIN SELECT RAISE(ABORT, 'Quiz attempts are immutable'); END;
CREATE TRIGGER "practice_attempt_immutable" BEFORE UPDATE ON "PracticeAttempt"
BEGIN SELECT RAISE(ABORT, 'Practice attempts are immutable'); END;
CREATE TRIGGER "retest_questions_immutable" BEFORE UPDATE ON "RetestSession"
WHEN OLD.questions <> NEW.questions
BEGIN SELECT RAISE(ABORT, 'Retest questions are immutable'); END;
CREATE TRIGGER "retest_completed_immutable" BEFORE UPDATE ON "RetestSession"
WHEN OLD.status = 'completed' AND (OLD.answers <> NEW.answers OR OLD.status <> NEW.status OR OLD.completedAt <> NEW.completedAt)
BEGIN SELECT RAISE(ABORT, 'Completed retest answers are immutable'); END;
