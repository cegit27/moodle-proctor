-- ============================================================================
-- Moodle-Proctor Database Schema
-- Proctoring Rooms Table - Migration 004
-- ============================================================================
-- This migration adds room-based proctoring support, allowing teachers to
-- create monitoring rooms for exams (10-15 students per room).
-- Rooms have a state machine: created → activated → closed
-- ============================================================================

-- ============================================================================
-- PROCTORING ROOMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS proctoring_rooms (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Room identification
    room_code VARCHAR(8) UNIQUE NOT NULL,  -- 8-char base62 code (e.g., xY7kPq2M)
    status VARCHAR(20) NOT NULL DEFAULT 'created',  -- State machine: created, activated, closed

    -- Room settings
    capacity INTEGER DEFAULT 15,  -- Max students per room (cognitive load limit)

    -- Timestamps for state transitions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    activated_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT valid_room_status CHECK (status IN ('created', 'activated', 'closed')),

    -- One active room per exam per teacher (prevent duplicates)
    UNIQUE(exam_id, teacher_id, status)
);

-- ============================================================================
-- INDEXES (Issue #10: BLOCKER for performance)
-- ============================================================================

-- For student joins (hot path) - look up room by code
CREATE INDEX idx_rooms_code ON proctoring_rooms(room_code);

-- For teacher dashboard - list active rooms
CREATE INDEX idx_rooms_teacher_status ON proctoring_rooms(teacher_id, status);

-- For violation routing - lookup room by exam and status
CREATE INDEX idx_rooms_exam_status ON proctoring_rooms(exam_id, status);

-- For cleanup jobs - find stale rooms in 'created' state
CREATE INDEX idx_rooms_status_created ON proctoring_rooms(status, created_at);

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE proctoring_rooms IS 'Proctoring rooms for exam monitoring (10-15 students per room)';
COMMENT ON COLUMN proctoring_rooms.room_code IS '8-character base62 invite code (e.g., xY7kPq2M)';
COMMENT ON COLUMN proctoring_rooms.status IS 'State machine: created → activated → closed';
COMMENT ON COLUMN proctoring_rooms.capacity IS 'Maximum students (default 15 for cognitive load)';
COMMENT ON COLUMN proctoring_rooms.activated_at IS 'Set when teacher navigates to room dashboard';
COMMENT ON COLUMN proctoring_rooms.closed_at IS 'Set when exam ends or teacher closes room';
