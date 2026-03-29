import postgres from '@fastify/postgres';
import config from '../src/config';
import logger from '../src/config/logger';
import { Pool } from 'pg';

async function seed(pg: Pool) {
  const client = await pg.connect();

  try {
    // Disable triggers/indexes for bulk insert
    await client.query('BEGIN');

    // Clear existing data
    await client.query('DELETE FROM audit_logs');
    await client.query('DELETE FROM proctoring_sessions');
    await client.query('DELETE FROM violations');
    await client.query('DELETE FROM exam_attempts');
    await client.query('DELETE FROM exams');
    await client.query('DELETE FROM users');

    // Create teacher
    const teacherResult = await client.query(
      `INSERT INTO users (moodle_user_id, username, email, first_name, last_name, role)
       VALUES (1001, 'teacher1', 'teacher@example.com', 'John', 'Teacher', 'teacher')
       RETURNING id`
    );
    const teacherId = teacherResult.rows[0].id;

    // Create student
    const studentResult = await client.query(
      `INSERT INTO users (moodle_user_id, username, email, first_name, last_name, role)
       VALUES (1002, 'student1', 'student@example.com', 'Jane', 'Student', 'student')
       RETURNING id`
    );
    const studentId = studentResult.rows[0].id;

    // Create exam
    const examResult = await client.query(
      `INSERT INTO exams (moodle_course_id, moodle_course_module_id, exam_name, course_name, duration_minutes, max_warnings)
       VALUES (2001, 3001, 'Mathematics Final', 'Calculus 101', 90, 15)
       RETURNING id`
    );
    const examId = examResult.rows[0].id;

    // Create exam attempt
    const attemptResult = await client.query(
      `INSERT INTO exam_attempts (user_id, exam_id, status)
       VALUES ($1, $2, 'in_progress')
       RETURNING id`,
      [studentId, examId]
    );
    const attemptId = attemptResult.rows[0].id;

    logger.info(`Seed complete:
- Teacher ID: ${teacherId}
- Student ID: ${studentId}
- Exam ID: ${examId}
- Attempt ID: ${attemptId}`);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Seed failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const pg = new Pool({ connectionString: config.database.url });
  seed(pg).then(
    () => process.exit(0),
    (error) => {
      logger.error(error);
      process.exit(1);
    }
  );
}

export default seed;

