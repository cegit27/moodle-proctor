-- ============================================================================
-- Moodle-Proctor Database Schema
-- Add room_id Foreign Key to Violations - Migration 005
-- ============================================================================
-- This migration adds room_id to violations table for room-based alert routing
-- Includes temporal filter for backfill integrity (Issue #6)
-- ============================================================================

-- ============================================================================
-- STEP 1: Add nullable room_id column
-- ============================================================================

ALTER TABLE violations ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES proctoring_rooms(id) ON DELETE SET NULL;

-- ============================================================================
-- STEP 2: Backfill existing violations with temporal filter (Issue #6)
-- ============================================================================
-- Only assign violations to rooms where the violation occurred during the
-- room's active lifecycle (between created_at and closed_at, or still active)
-- This prevents assigning violations to wrong room when multiple rooms
-- exist for the same exam
-- ============================================================================

UPDATE violations v
SET room_id = subq.room_id
FROM (
  SELECT
    pr.id AS room_id,
    ea.id AS attempt_id
  FROM proctoring_rooms pr
  JOIN exam_attempts ea ON pr.exam_id = ea.exam_id
  -- Temporal filter: violation must have occurred after room was created
  -- AND (before room was closed OR room is still active)
  WHERE pr.status IN ('activated', 'closed')
  AND (
    -- Room is still active (no closed_at) OR violation occurred before closing
    pr.closed_at IS NULL
    OR v.occurred_at <= pr.closed_at
  )
  -- Violation must have occurred after room was created
  AND v.occurred_at >= pr.created_at
  AND pr.status = 'activated' -- Only assign to rooms that were activated
) subq
WHERE v.attempt_id = subq.attempt_id;

-- ============================================================================
-- STEP 3: Data quality check - ensure no NULL room_id after backfill
-- ============================================================================
-- This check identifies violations that couldn't be assigned to any room
-- (e.g., room was deleted, exam had no room, temporal mismatch)
-- ============================================================================

DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM violations
  WHERE room_id IS NULL;

  IF null_count > 0 THEN
    RAISE NOTICE 'WARNING: % violations have NULL room_id after backfill', null_count;
    RAISE NOTICE 'These violations occurred before room system was implemented or for exams without rooms';
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Set NOT NULL constraint for new violations
-- ============================================================================

-- Note: We keep it nullable for existing data, but new violations must have room_id
-- Application layer enforces this. If we want strict DB enforcement:
-- ALTER TABLE violations ALTER COLUMN room_id SET NOT NULL;
-- For now, we keep it nullable to allow legacy data without room association

-- ============================================================================
-- STEP 5: Add index for room-based violation queries
-- ============================================================================

-- For fetching violations by room (teacher dashboard)
CREATE INDEX idx_violations_room_id ON violations(room_id);

-- For room-scoped violation timeline
CREATE INDEX idx_violations_room_occurred ON violations(room_id, occurred_at DESC);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN violations.room_id IS 'Room where violation was detected (NULL for legacy violations before room system)';
COMMENT ON INDEX idx_violations_room_id IS 'Fast lookup of violations by room (hot path for teacher dashboard)';
COMMENT ON INDEX idx_violations_room_occurred IS 'Timeline view of violations for a specific room';
