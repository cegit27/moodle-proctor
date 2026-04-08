-- ============================================================================
-- Expand exams table for teacher-managed exam creation
-- ============================================================================

ALTER TABLE exams
  ALTER COLUMN moodle_course_id DROP NOT NULL,
  ALTER COLUMN moodle_course_module_id DROP NOT NULL;

ALTER TABLE exams
  ADD COLUMN IF NOT EXISTS created_by_teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS instructions TEXT,
  ADD COLUMN IF NOT EXISTS room_capacity INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS ai_proctoring_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS manual_proctoring_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS auto_submit_on_warning_limit BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS capture_snapshots BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS allow_student_rejoin BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS questions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scheduled_start_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS scheduled_end_at TIMESTAMP WITH TIME ZONE;

UPDATE exams
SET questions_json = '[]'::jsonb
WHERE questions_json IS NULL;

CREATE INDEX IF NOT EXISTS idx_exams_created_by_teacher_id ON exams(created_by_teacher_id);
CREATE INDEX IF NOT EXISTS idx_exams_scheduled_start_at ON exams(scheduled_start_at);
