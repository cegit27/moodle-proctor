-- Integration Test Data Setup

-- Create test teacher
INSERT INTO users (moodle_user_id, username, email, first_name, last_name, role)
VALUES (1001, 'teacher1', 'teacher@school.edu', 'Dr.', 'Smith', 'teacher')
ON CONFLICT (email) DO NOTHING;

-- Create test exam
INSERT INTO exams (id, moodle_course_id, moodle_course_module_id, exam_name, course_name, duration_minutes)
VALUES (1, 1001, 2001, 'Midterm Mathematics', 'MATH 101', 60)
ON CONFLICT (id) DO UPDATE SET exam_name = EXCLUDED.exam_name;

-- Create test room with invite code
INSERT INTO proctoring_rooms (exam_id, teacher_id, room_code, status, capacity)
VALUES (1, 1, 'MTH101AB', 'created', 15);

-- Verify data
SELECT 'USERS:' as table_name;
SELECT id, username, email, role FROM users WHERE role = 'teacher';

SELECT 'EXAMS:' as table_name;
SELECT id, exam_name, course_name FROM exams;

SELECT 'ROOMS:' as table_name;
SELECT id, room_code, exam_id, status, capacity FROM proctoring_rooms;
