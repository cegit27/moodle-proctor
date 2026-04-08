-- ============================================================================
-- DATABASE SETUP SCRIPT for MOODLE-PROCTOR
-- Combined all migrations for quick setup
-- ============================================================================

-- ============================================================================
-- MIGRATION 001: INITIAL SCHEMA
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    moodle_user_id INTEGER UNIQUE NOT NULL,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    role VARCHAR(50) NOT NULL,
    profile_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT valid_role CHECK (role IN ('student', 'teacher'))
);

CREATE TABLE IF NOT EXISTS exams (
    id SERIAL PRIMARY KEY,
    moodle_course_id INTEGER NOT NULL,
    moodle_course_module_id INTEGER NOT NULL,
    exam_name VARCHAR(255) NOT NULL,
    course_name VARCHAR(255),
    duration_minutes INTEGER NOT NULL,
    max_warnings INTEGER DEFAULT 15,
    question_paper_path TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(moodle_course_id, moodle_course_module_id)
);

CREATE TABLE IF NOT EXISTS exam_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    moodle_attempt_id INTEGER,
    status VARCHAR(50) NOT NULL DEFAULT 'not_started',
    started_at TIMESTAMP WITH TIME ZONE,
    submitted_at TIMESTAMP WITH TIME ZONE,
    submission_reason VARCHAR(100),
    violation_count INTEGER DEFAULT 0,
    ip_address INET,
    user_agent TEXT,
    device_info JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_status CHECK (status IN ('not_started', 'in_progress', 'submitted', 'terminated'))
);

CREATE TABLE IF NOT EXISTS violations (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    violation_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'warning',
    detail TEXT,
    occurred_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    frame_snapshot_path TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT valid_severity CHECK (severity IN ('info', 'warning'))
);

CREATE TABLE IF NOT EXISTS proctoring_sessions (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    session_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    session_end TIMESTAMP WITH TIME ZONE,
    frames_processed INTEGER DEFAULT 0,
    ai_service_connected BOOLEAN DEFAULT false,
    connection_errors INTEGER DEFAULT 0,
    client_info JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id INTEGER,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- MIGRATION 002: PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_moodle_id ON users(moodle_user_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE INDEX IF NOT EXISTS idx_exams_course_id ON exams(moodle_course_id);
CREATE INDEX IF NOT EXISTS idx_exams_module_id ON exams(moodle_course_module_id);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_user_id ON exam_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_id ON exam_attempts(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_status ON exam_attempts(status);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_created_at ON exam_attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_user_exam ON exam_attempts(user_id, exam_id);

CREATE INDEX IF NOT EXISTS idx_violations_attempt_id ON violations(attempt_id);
CREATE INDEX IF NOT EXISTS idx_violations_occurred_at ON violations(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_violations_type ON violations(violation_type);
CREATE INDEX IF NOT EXISTS idx_violations_severity ON violations(severity);
CREATE INDEX IF NOT EXISTS idx_violations_attempt_type ON violations(attempt_id, violation_type);

CREATE INDEX IF NOT EXISTS idx_proctoring_sessions_attempt_id ON proctoring_sessions(attempt_id);
CREATE INDEX IF NOT EXISTS idx_proctoring_sessions_start ON proctoring_sessions(session_start DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_user_status ON exam_attempts(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_violations_attempt_time ON violations(attempt_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_action ON audit_logs(user_id, action, created_at DESC);

-- ============================================================================
-- MIGRATION 003: SECURITY FIELDS
-- ============================================================================

ALTER TABLE violations ADD COLUMN IF NOT EXISTS integrity_hash TEXT;
ALTER TABLE violations ADD COLUMN IF NOT EXISTS ai_signature TEXT;
ALTER TABLE violations ADD COLUMN IF NOT EXISTS client_ip INET;
ALTER TABLE violations ADD COLUMN IF NOT EXISTS session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_violations_integrity_hash ON violations(integrity_hash);
CREATE INDEX IF NOT EXISTS idx_violations_session_id ON violations(session_id);
CREATE INDEX IF NOT EXISTS idx_violations_ai_signature ON violations(ai_signature);

CREATE UNIQUE INDEX IF NOT EXISTS idx_violations_unique_event
ON violations (attempt_id, violation_type, occurred_at)
WHERE integrity_hash IS NOT NULL;

-- ============================================================================
-- MIGRATION 004: PROCTORING ROOMS
-- ============================================================================

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
    CONSTRAINT valid_room_status CHECK (status IN ('created', 'activated', 'closed')),
    UNIQUE(exam_id, teacher_id, status)
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON proctoring_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_teacher_status ON proctoring_rooms(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_rooms_exam_status ON proctoring_rooms(exam_id, status);
CREATE INDEX IF NOT EXISTS idx_rooms_status_created ON proctoring_rooms(status, created_at);

-- ============================================================================
-- MIGRATION 005: ADD ROOM_ID TO VIOLATIONS
-- ============================================================================

ALTER TABLE violations ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES proctoring_rooms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_violations_room_id ON violations(room_id);
CREATE INDEX IF NOT EXISTS idx_violations_room_occurred ON violations(room_id, occurred_at DESC);

-- ============================================================================
-- MIGRATION 006: ROOM ENROLLMENT
-- ============================================================================

CREATE TABLE IF NOT EXISTS proctoring_room_students (
    id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES proctoring_rooms(id) ON DELETE CASCADE,
    attempt_id INTEGER REFERENCES exam_attempts(id) ON DELETE SET NULL,
    student_name VARCHAR(255) NOT NULL,
    student_email VARCHAR(255) NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(room_id, student_email)
);

CREATE INDEX IF NOT EXISTS idx_room_students_room_id ON proctoring_room_students(room_id);
CREATE INDEX IF NOT EXISTS idx_room_students_room_email ON proctoring_room_students(room_id, student_email);

-- ============================================================================
-- MIGRATION 011: ANSWER SHEET UPLOADS
-- ============================================================================

ALTER TABLE exams
    ADD COLUMN IF NOT EXISTS answer_sheet_upload_window_minutes INTEGER NOT NULL DEFAULT 30;

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

CREATE INDEX IF NOT EXISTS idx_answer_sheet_uploads_attempt_id ON answer_sheet_uploads(attempt_id);
CREATE INDEX IF NOT EXISTS idx_answer_sheet_uploads_exam_id ON answer_sheet_uploads(exam_id);
CREATE INDEX IF NOT EXISTS idx_answer_sheet_uploads_user_id ON answer_sheet_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_answer_sheet_uploads_status ON answer_sheet_uploads(status, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_answer_sheet_uploads_student_identifier ON answer_sheet_uploads(student_identifier);

-- ============================================================================
-- SCHEMA MIGRATION TABLE (for tracking applied migrations)
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    migration_id INTEGER UNIQUE NOT NULL,
    name TEXT NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Record all migrations as applied
INSERT INTO schema_migrations (migration_id, name) VALUES
    (1, '001_initial_schema.sql'),
    (2, '002_add_indexes.sql'),
    (3, '003_security_fields.sql'),
    (4, '004_add_proctoring_rooms.sql'),
    (5, '005_add_room_id_to_violations.sql'),
    (6, '006_add_room_enrollment.sql'),
    (11, '011_add_answer_sheet_uploads.sql')
ON CONFLICT (migration_id) DO NOTHING;

-- ============================================================================
-- SETUP COMPLETE
-- ============================================================================
