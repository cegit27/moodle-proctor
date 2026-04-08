interface QueryableClient {
  query: (text: string, values?: unknown[]) => Promise<unknown>
}

export async function ensureScanSchema(client: QueryableClient): Promise<void> {
  await client.query('BEGIN')

  try {
    await client.query(`
      ALTER TABLE exams
      ADD COLUMN IF NOT EXISTS answer_sheet_upload_window_minutes INTEGER NOT NULL DEFAULT 30;
    `)

    await client.query(`
      CREATE TABLE IF NOT EXISTS answer_sheet_uploads (
        id SERIAL PRIMARY KEY,
        session_token VARCHAR(128) NOT NULL UNIQUE,
        attempt_id INTEGER REFERENCES exam_attempts(id) ON DELETE CASCADE,
        attempt_reference VARCHAR(255) NOT NULL UNIQUE,
        attempt_status VARCHAR(50) NOT NULL DEFAULT 'submitted',
        attempt_submitted_at TIMESTAMP WITH TIME ZONE,
        attempt_submission_reason VARCHAR(100),
        attempt_violation_count INTEGER NOT NULL DEFAULT 0,
        exam_id INTEGER REFERENCES exams(id) ON DELETE SET NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        room_enrollment_id INTEGER REFERENCES proctoring_room_students(id) ON DELETE SET NULL,
        student_identifier VARCHAR(255) NOT NULL,
        student_name VARCHAR(255) NOT NULL,
        student_email VARCHAR(255) NOT NULL,
        exam_name VARCHAR(255) NOT NULL,
        course_name VARCHAR(255),
        source VARCHAR(100) NOT NULL DEFAULT 'electron_post_exam',
        status VARCHAR(32) NOT NULL DEFAULT 'awaiting_upload',
        accepted_file_types JSONB NOT NULL DEFAULT '["application/pdf"]'::jsonb,
        upload_window_minutes INTEGER NOT NULL DEFAULT 30,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        uploaded_at TIMESTAMP WITH TIME ZONE,
        file_name TEXT,
        file_size_bytes INTEGER,
        mime_type VARCHAR(128),
        stored_path TEXT,
        receipt_id VARCHAR(128),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT valid_answer_sheet_upload_status CHECK (
          status IN ('awaiting_upload', 'upload_in_progress', 'uploaded', 'expired')
        ),
        CONSTRAINT valid_answer_sheet_attempt_status CHECK (
          attempt_status IN ('not_started', 'in_progress', 'submitted', 'terminated')
        )
      );
    `)

    await client.query(`
      ALTER TABLE answer_sheet_uploads
      ADD COLUMN IF NOT EXISTS attempt_status VARCHAR(50) NOT NULL DEFAULT 'submitted',
      ADD COLUMN IF NOT EXISTS attempt_submitted_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS attempt_submission_reason VARCHAR(100),
      ADD COLUMN IF NOT EXISTS attempt_violation_count INTEGER NOT NULL DEFAULT 0;
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_answer_sheet_uploads_attempt_id
      ON answer_sheet_uploads(attempt_id);

      CREATE INDEX IF NOT EXISTS idx_answer_sheet_uploads_exam_id
      ON answer_sheet_uploads(exam_id);

      CREATE INDEX IF NOT EXISTS idx_answer_sheet_uploads_user_id
      ON answer_sheet_uploads(user_id);

      CREATE INDEX IF NOT EXISTS idx_answer_sheet_uploads_status
      ON answer_sheet_uploads(status, expires_at DESC);

      CREATE INDEX IF NOT EXISTS idx_answer_sheet_uploads_student_identifier
      ON answer_sheet_uploads(student_identifier);
    `)

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
