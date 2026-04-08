// ============================================================================
// Room Schema Bootstrap
// Ensures the room-related tables exist for local/dev environments where
// migrations were skipped before the backend starts serving requests.
// The statements below are all idempotent, so we can safely run them on boot.
// ============================================================================

interface QueryableClient {
  query: (text: string, values?: unknown[]) => Promise<unknown>
}

export async function ensureRoomSchema(client: QueryableClient): Promise<void> {

  await client.query('BEGIN');

  try {
    await client.query(`
      ALTER TABLE exams
      ALTER COLUMN moodle_course_id DROP NOT NULL,
      ALTER COLUMN moodle_course_module_id DROP NOT NULL;
    `);

    await client.query(`
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
    `);

    await client.query(`
      UPDATE exams
      SET questions_json = '[]'::jsonb
      WHERE questions_json IS NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_exams_created_by_teacher_id ON exams(created_by_teacher_id);
      CREATE INDEX IF NOT EXISTS idx_exams_scheduled_start_at ON exams(scheduled_start_at);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS proctoring_rooms (
        id SERIAL PRIMARY KEY,
        exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
        teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        room_code VARCHAR(8) UNIQUE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'created',
        capacity INTEGER DEFAULT 15,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        activated_at TIMESTAMP WITH TIME ZONE,
        closed_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT valid_room_status CHECK (status IN ('created', 'activated', 'closed'))
      );
    `);

    await client.query(`
      ALTER TABLE proctoring_rooms
      DROP CONSTRAINT IF EXISTS proctoring_rooms_exam_id_teacher_id_status_key;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rooms_code ON proctoring_rooms(room_code);
      CREATE INDEX IF NOT EXISTS idx_rooms_teacher_status ON proctoring_rooms(teacher_id, status);
      CREATE INDEX IF NOT EXISTS idx_rooms_exam_status ON proctoring_rooms(exam_id, status);
      CREATE INDEX IF NOT EXISTS idx_rooms_status_created ON proctoring_rooms(status, created_at);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_exam_teacher_open
      ON proctoring_rooms(exam_id, teacher_id)
      WHERE status IN ('created', 'activated');
    `);

    await client.query(`
      ALTER TABLE violations
      ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES proctoring_rooms(id) ON DELETE SET NULL;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_violations_room_id ON violations(room_id);
      CREATE INDEX IF NOT EXISTS idx_violations_room_occurred ON violations(room_id, occurred_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS proctoring_room_students (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL REFERENCES proctoring_rooms(id) ON DELETE CASCADE,
        attempt_id INTEGER REFERENCES exam_attempts(id) ON DELETE SET NULL,
        student_name VARCHAR(255) NOT NULL,
        student_email VARCHAR(255) NOT NULL,
        joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(room_id, student_email)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_room_students_room_id ON proctoring_room_students(room_id);
      CREATE INDEX IF NOT EXISTS idx_room_students_room_email ON proctoring_room_students(room_id, student_email);
    `);

    await client.query(`
      ALTER TABLE exam_attempts
      ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS hidden_by_teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_exam_attempts_hidden_at ON exam_attempts(hidden_at);
      CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_hidden ON exam_attempts(exam_id, hidden_at);
    `);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
