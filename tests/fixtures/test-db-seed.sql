-- Test DB Seed Data for moodle_proctor_test
-- Run: psql -f this_file postgresql://proctor_user:proctor_pass@localhost:5433/moodle_proctor_test

-- Clean slate
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- Users (teacher/student)
INSERT INTO users (id, email, name, role, moodle_user_id) VALUES
(1, 'teacher@example.com', 'Proctor Teacher', 'teacher', 100),
(2, 'student1@example.com', 'Student Alice', 'student', 101),
(3, 'student2@example.com', 'Student Bob', 'student', 102);

-- Rooms
INSERT INTO proctoring_rooms (id, room_code, exam_id, teacher_id, capacity, status) VALUES
(1, 'TEST001', 1, 1, 5, 'created');

-- Exam Attempts
INSERT INTO exam_attempts (id, user_id, room_id, exam_id, status, started_at) VALUES
(1, 2, 1, 1, 'in_progress', NOW());

-- Violations sample
INSERT INTO violations (id, attempt_id, type, severity, confidence, metadata, created_at) VALUES
(1, 1, 'phone_detected', 'high', 0.92, '{"bbox": [100,200,300,400]}', NOW());

-- Indexes for tests
CREATE INDEX IF NOT EXISTS idx_room_students_room_id ON proctoring_room_students(room_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_room_students_email ON proctoring_room_students(room_id, student_email);

