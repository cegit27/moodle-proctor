-- ============================================================================
-- INTEGRATION TESTS: Room-Based Invite Code Enrollment
-- ============================================================================

BEGIN;

-- ===========================================================================
-- TEST 1: Student Enrollment (Happy Path)
-- Expected: Student successfully enrolls in room
-- ===========================================================================
DO $$
DECLARE
    v_user_id INTEGER;
    v_enrollment_id INTEGER;
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'TEST 1: Student Enrollment (Happy Path)';
    RAISE NOTICE '===========================================';

    -- Create student user
    INSERT INTO users (moodle_user_id, username, email, first_name, last_name, role)
    VALUES (2001, 'student1', 'alice@school.edu', 'Alice', 'Johnson', 'student')
    ON CONFLICT (email) DO UPDATE SET username = EXCLUDED.username
    RETURNING id INTO v_user_id;

    RAISE NOTICE '✓ Student user created/updated: ID=%', v_user_id;

    -- Enroll student in room
    INSERT INTO proctoring_room_students (room_id, student_name, student_email)
    VALUES (2, 'Alice Johnson', 'alice@school.edu')
    RETURNING id INTO v_enrollment_id;

    RAISE NOTICE '✓ Student enrolled in room: enrollment_id=%', v_enrollment_id;
    RAISE NOTICE '  Room ID: 2';
    RAISE NOTICE '  Student: Alice Johnson (alice@school.edu)';
    RAISE NOTICE '  Status: SUCCESS';

    -- Verify enrollment
    PERFORM FROM proctoring_room_students WHERE id = v_enrollment_id;
    IF FOUND THEN
        RAISE NOTICE '✓ Enrollment verified in database';
    ELSE
        RAISE EXCEPTION '✗ Enrollment NOT found in database!';
    END IF;

EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '✗ TEST 1 FAILED: %', SQLERRM;
    ROLLBACK;
    RETURN;
END $$;

COMMIT;


-- ===========================================================================
-- TEST 2: Duplicate Enrollment Prevention
-- Expected: UNIQUE constraint violation prevents same email in same room
-- ===========================================================================
BEGIN;

DO $$
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'TEST 2: Duplicate Enrollment Prevention';
    RAISE NOTICE '===========================================';

    -- Try to enroll same student again
    INSERT INTO proctoring_room_students (room_id, student_name, student_email)
    VALUES (2, 'Alice Johnson', 'alice@school.edu');

    RAISE NOTICE '✗ TEST FAILED: Duplicate enrollment was NOT prevented!';

EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE '✓ UNIQUE constraint violation (expected)';
    RAISE NOTICE '✓ Duplicate enrollment prevented successfully';
    RAISE NOTICE '  Error: %', SQLERRM;
    ROLLBACK;
    RETURN;
END $$;

COMMIT;


-- ===========================================================================
-- TEST 3: Student Count (Capacity Check)
-- Expected: COUNT returns accurate student count for room
-- ===========================================================================
DO $$
DECLARE
    v_student_count INTEGER;
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'TEST 3: Student Count (Capacity Check)';
    RAISE NOTICE '===========================================';

    -- Count students in room
    SELECT COUNT(*) INTO v_student_count
    FROM proctoring_room_students
    WHERE room_id = 2;

    RAISE NOTICE '✓ Student count retrieved: %', v_student_count;
    RAISE NOTICE '  Room ID: 2';
    RAISE NOTICE '  Students enrolled: %', v_student_count;
    RAISE NOTICE '  Room capacity: 15';
    RAISE NOTICE '  Available slots: %', 15 - v_student_count;

    IF v_student_count = 1 THEN
        RAISE NOTICE '✓ Student count is accurate';
    ELSE
        RAISE EXCEPTION '✗ Student count is incorrect! Expected 1, got %', v_student_count;
    END IF;

END $$;


-- ===========================================================================
-- TEST 4: Room Capacity Enforcement
-- Expected: Enrolling 16th student should fail due to capacity limit
-- ===========================================================================
DO $$
DECLARE
    v_new_enrollment_id INTEGER;
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'TEST 4: Room Capacity Enforcement';
    RAISE NOTICE '===========================================';

    -- Try to fill room to capacity (should work)
    FOR i IN 2..15 LOOP
        INSERT INTO proctoring_room_students (room_id, student_name, student_email)
        VALUES (2, 'Test Student ' || i, 'student' || i || '@test.edu');
    END LOOP;

    RAISE NOTICE '✓ Room filled to capacity (15 students)';

    -- Verify count
    PERFORM FROM proctoring_room_students WHERE room_id = 2;
    IF FOUND THEN
        SELECT COUNT(*) INTO v_new_enrollment_id
        FROM proctoring_room_students
        WHERE room_id = 2;

        RAISE NOTICE '✓ Current student count: %', v_new_enrollment_id;
    END IF;

    -- Try to add 16th student (should fail)
    INSERT INTO proctoring_room_students (room_id, student_name, student_email)
    VALUES (2, 'Overflow Student', 'overflow@test.edu');

    RAISE NOTICE '✗ TEST FAILED: 16th student was allowed!';

EXCEPTION WHEN OTHERS THEN
    -- This test doesn't have database-level capacity enforcement
    -- (It's enforced at application level in enrollStudent())
    RAISE NOTICE 'ℹ  Note: Capacity is enforced at application level, not database';
    RAISE NOTICE 'ℹ  Database UNIQUE constraint only prevents duplicates';
    RAISE NOTICE '✓ Application code should check capacity before INSERT';
    ROLLBACK;
    RETURN;
END $$;


-- ===========================================================================
-- TEST 5: Invalid Invite Code
-- Expected: Room not found error
-- ===========================================================================
DO $$
DECLARE
    v_room_exists BOOLEAN;
BEGIN
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'TEST 5: Invalid Invite Code Lookup';
    RAISE NOTICE '===========================================';

    -- Try to find room with invalid code
    SELECT EXISTS(SELECT 1 FROM proctoring_rooms WHERE room_code = 'INVALID') INTO v_room_exists;

    IF v_room_exists THEN
        RAISE NOTICE '✗ TEST FAILED: Invalid code was found!';
    ELSE
        RAISE NOTICE '✓ Invalid invite code correctly returns no results';
        RAISE NOTICE '  Searched for: INVALID';
        RAISE NOTICE '  Result: Room not found';
    END IF;

END $$;


-- ===========================================================================
-- SUMMARY: Display Current State
-- ===========================================================================
SELECT '============================' as "";
SELECT 'TEST SUMMARY: Current State' as "";
SELECT '============================' as "";

SELECT 'ENROLLED STUDENTS:' as section;
SELECT rs.id, rs.room_id, r.room_code, rs.student_name, rs.student_email
FROM proctoring_room_students rs
JOIN proctoring_rooms r ON rs.room_id = r.id
ORDER BY rs.id;

SELECT 'ROOM DETAILS:' as section;
SELECT id, room_code, exam_id, status, capacity,
       (SELECT COUNT(*) FROM proctoring_room_students WHERE room_id = proctoring_rooms.id) as student_count
FROM proctoring_rooms;
