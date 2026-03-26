-- ============================================================================
-- Moodle-Proctor Database Schema
-- Student Room Enrollment Table - Migration 006
-- ============================================================================
-- This migration adds student enrollment tracking for room-based proctoring.
-- Records which students joined which room with which exam attempt.
-- Enables capacity enforcement, real-time student counts, and violation history.
-- ============================================================================

-- ============================================================================
-- PROCTORING ROOM STUDENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS proctoring_room_students (
    id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES proctoring_rooms(id) ON DELETE CASCADE,
    attempt_id INTEGER REFERENCES exam_attempts(id) ON DELETE SET NULL,

    -- Student identity (captured at join time)
    student_name VARCHAR(255) NOT NULL,
    student_email VARCHAR(255) NOT NULL,

    -- Audit trail
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    UNIQUE(room_id, student_email)
);

-- ============================================================================
-- INDEXES (Issue #10: BLOCKER for performance)
-- ============================================================================

-- For capacity checks (hot path) - count students per room
CREATE INDEX idx_room_students_room_id ON proctoring_room_students(room_id);

-- For duplicate enrollment prevention (hot path) - check if email already in room
CREATE INDEX idx_room_students_room_email ON proctoring_room_students(room_id, student_email);

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE proctoring_room_students IS 'Student enrollment records for room-based proctoring';
COMMENT ON COLUMN proctoring_room_students.room_id IS 'FK to proctoring_rooms - which room this student joined';
COMMENT ON COLUMN proctoring_room_students.attempt_id IS 'FK to exam_attempts - links enrollment to exam attempt';
COMMENT ON COLUMN proctoring_room_students.student_name IS 'Student name (captured at join time for records)';
COMMENT ON COLUMN proctoring_room_students.student_email IS 'Student email (unique per room - prevents duplicate joins)';
COMMENT ON COLUMN proctoring_room_students.joined_at IS 'When student joined the room';
