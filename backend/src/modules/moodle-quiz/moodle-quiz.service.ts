// ============================================================================
// Moodle Quiz Module - Service Layer
// Fetches quiz data from Moodle using REST API
// ============================================================================

import axios from 'axios';
import type { Pool } from 'pg';
import logger from '../../config/logger';
import {
  MoodleQuiz,
  MoodleQuestion,
  QuizSyncResult
} from './moodle-quiz.schema';

// ============================================================================
// Configuration
// ============================================================================

const MOODLE_BASE_URL = process.env.MOODLE_BASE_URL || 'http://localhost:8080';
const MOODLE_REST_FORMAT = 'json';
const MOODLE_WS_PATH = '/webservice/rest/server.php';

// ============================================================================
// Types
// ============================================================================

/**
 * Moodle Web Service Response
 */
interface MoodleWSResponse<T> {
  exception?: string;
  errorcode?: string;
  message?: string;
  data?: T;
}

/**
 * Mod Quiz Get Quizzes By Courses Response
 */
interface MoodleQuizResponse {
  id: number;
  course: number;
  coursemodule: number;
  name: string;
  intro?: string;
  introformat?: number;
  introattachments?: any[];
  timeopen?: number;
  timeclose?: number;
  timelimit?: number;
  overduehandling?: string;
  graceperiod?: number;
  preferredbehaviour?: string;
  canredoquestions?: boolean;
  attempts?: number;
  attemptonlast?: boolean;
  grademethod?: number;
  decimalpoints?: number;
  questiondecimalpoints?: number;
  reviewattempt?: number;
  reviewcorrectness?: number;
  reviewmarks?: number;
  reviewspecificfeedback?: number;
  reviewgeneralfeedback?: number;
  reviewrightanswer?: number;
  reviewoverallfeedback?: number;
  questionsperpage?: number;
  navmethod?: string;
  shufflequestions?: boolean;
  shuffleanswers?: boolean;
  questions?: MoodleQuestionResponse[];
  browsersecurity?: string;
  subnet?: string;
  delay1?: number;
  delay2?: number;
  showuserpicture?: number;
  showblocks?: number;
  completionattemptsexhausted?: number;
  completionpass?: number;
  allowofflineattempts?: number;
}

/**
 * Moodle Question Response
 */
interface MoodleQuestionResponse {
  id: number;
  name: string;
  questiontext: string;
  questiontextformat: number;
  questionfiles?: any[];
  generalfeedback?: string;
  generalfeedbackformat?: number;
  defaultmark?: number;
  penalty?: number;
  qtype: string;
  length?: number;
  stamp?: string;
  version?: number;
  hidden?: number;
  category?: number;
  contextid?: number;
  answer?: any[];
  options?: any;
}

// ============================================================================
// Moodle API Client
// ============================================================================

/**
 * Call Moodle Web Service
 * @param function - Moodle WS function name
 * @param token - Moodle web service token
 * @param params - Function parameters
 * @returns Promise<T> - Response data
 */
async function callMoodleWS<T>(
  functionName: string,
  token: string,
  params: Record<string, any> = {}
): Promise<T> {
  const url = `${MOODLE_BASE_URL}${MOODLE_WS_PATH}`;

  try {
    const response = await axios.get<MoodleWSResponse<T>>(url, {
      params: {
        wsfunction: functionName,
        wstoken: token,
        moodlewsrestformat: MOODLE_REST_FORMAT,
        ...params
      },
      timeout: 30000
    });

    // Check for Moodle errors
    if (response.data.exception) {
      throw new Error(`Moodle API error: ${response.data.message} (${response.data.errorcode})`);
    }

    return response.data as T;
  } catch (error: any) {
    logger.error('Moodle API call failed', {
      function: functionName,
      error: error.message,
      url
    });
    throw error;
  }
}

// ============================================================================
// Quiz Sync Functions
// ============================================================================

/**
 * Fetch quiz by course module ID from Moodle
 * @param token - Moodle web service token
 * @param courseId - Course ID
 * @param quizId - Quiz ID (optional, fetches all if not provided)
 * @returns Promise<MoodleQuiz[]> - Array of quizzes
 */
export async function fetchQuizzesFromMoodle(
  token: string,
  courseId: number,
  quizId?: number
): Promise<MoodleQuiz[]> {
  try {
    logger.info('Fetching quizzes from Moodle', { courseId, quizId });

    const quizzes = await callMoodleWS<MoodleQuizResponse[]>(
      'mod_quiz_get_quizzes_by_courses',
      token,
      {
        courseids: [courseId]
      }
    );

    if (!Array.isArray(quizzes)) {
      logger.warn('Unexpected Moodle response format', { quizzes });
      return [];
    }

    // Filter by quiz ID if provided
    const filteredQuizzes = quizId
      ? quizzes.filter(q => q.id === quizId)
      : quizzes;

    logger.info(`Fetched ${filteredQuizzes.length} quiz(zes) from Moodle`, {
      courseId,
      quizId
    });

    // Transform to our schema
    return filteredQuizzes.map(transformMoodleQuiz);
  } catch (error: any) {
    logger.error('Failed to fetch quizzes from Moodle', {
      courseId,
      quizId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Fetch quiz questions by quiz ID from Moodle
 * @param token - Moodle web service token
 * @param quizId - Quiz ID
 * @returns Promise<MoodleQuestion[]> - Array of questions
 */
export async function fetchQuizQuestionsFromMoodle(
  token: string,
  quizId: number
): Promise<MoodleQuestion[]> {
  try {
    logger.info('Fetching quiz questions from Moodle', { quizId });

    const response = await callMoodleWS<any>(
      'mod_quiz_get_quiz_questions',
      token,
      {
        quizid: quizId
      }
    );

    // Moodle returns questions as an object with slot keys or array
    const questionsData = response.questions || response;

    let questions: MoodleQuestionResponse[] = [];
    if (Array.isArray(questionsData)) {
      questions = questionsData;
    } else if (typeof questionsData === 'object') {
      // Convert object with slot keys to array
      questions = Object.values(questionsData);
    }

    logger.info(`Fetched ${questions.length} question(s) from Moodle`, { quizId });

    // Transform to our schema
    return questions.map(transformMoodleQuestion);
  } catch (error: any) {
    logger.error('Failed to fetch quiz questions from Moodle', {
      quizId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Transform Moodle quiz response to our schema
 */
function transformMoodleQuiz(quiz: MoodleQuizResponse): MoodleQuiz {
  return {
    id: quiz.id,
    course: quiz.course,
    courseModule: quiz.coursemodule,
    name: quiz.name,
    intro: quiz.intro || '',
    timeOpen: quiz.timeopen || null,
    timeClose: quiz.timeclose || null,
    timeLimit: quiz.timelimit || 0,
    questions: (quiz.questions || []).map(transformMoodleQuestion)
  };
}

/**
 * Transform Moodle question response to our schema
 */
function transformMoodleQuestion(question: MoodleQuestionResponse): MoodleQuestion {
  return {
    id: question.id,
    name: question.name,
    questionText: question.questiontext,
    defaultMark: question.defaultmark || 1,
    qtype: question.qtype,
    category: question.category || null,
    options: question.options || null
  };
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Sync quiz data to database
 * @param pg - PostgreSQL pool
 * @param quiz - Quiz data
 * @param ltiContextKey - LTI context key (for linking)
 * @returns Promise<QuizSyncResult> - Sync result with IDs
 */
export async function syncQuizToDatabase(
  pg: Pool,
  quiz: MoodleQuiz,
  ltiContextKey?: string
): Promise<QuizSyncResult> {
  const client = await pg.connect();

  try {
    await client.query('BEGIN');

    // Check if quiz exists
    const existingQuiz = await client.query(
      'SELECT id FROM moodle_quizzes WHERE moodle_quiz_id = $1',
      [quiz.id]
    );

    let quizId: number;

    if (existingQuiz.rows.length > 0) {
      // Update existing quiz
      quizId = existingQuiz.rows[0].id;

      await client.query(
        `UPDATE moodle_quizzes SET
          course_id = $1,
          course_module_id = $2,
          name = $3,
          intro = $4,
          time_open = $5,
          time_close = $6,
          time_limit = $7,
          lti_context_key = $8,
          updated_at = NOW()
        WHERE moodle_quiz_id = $9`,
        [
          quiz.course,
          quiz.courseModule,
          quiz.name,
          quiz.intro,
          quiz.timeOpen,
          quiz.timeClose,
          quiz.timeLimit,
          ltiContextKey || null,
          quiz.id
        ]
      );

      logger.info('Updated quiz in database', { quizId, moodleQuizId: quiz.id });

      // Delete old questions
      await client.query('DELETE FROM moodle_questions WHERE quiz_id = $1', [quizId]);
    } else {
      // Insert new quiz
      const insertResult = await client.query(
        `INSERT INTO moodle_quizzes (
          moodle_quiz_id,
          course_id,
          course_module_id,
          name,
          intro,
          time_open,
          time_close,
          time_limit,
          lti_context_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          quiz.id,
          quiz.course,
          quiz.courseModule,
          quiz.name,
          quiz.intro,
          quiz.timeOpen,
          quiz.timeClose,
          quiz.timeLimit,
          ltiContextKey || null
        ]
      );

      quizId = insertResult.rows[0].id;

      logger.info('Inserted quiz to database', { quizId, moodleQuizId: quiz.id });
    }

    // Insert questions
    const questionIds: number[] = [];

    for (const question of quiz.questions) {
      const questionResult = await client.query(
        `INSERT INTO moodle_questions (
          quiz_id,
          moodle_question_id,
          name,
          question_text,
          default_mark,
          qtype,
          category,
          options,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        RETURNING id`,
        [
          quizId,
          question.id,
          question.name,
          question.questionText,
          question.defaultMark,
          question.qtype,
          question.category,
          question.options ? JSON.stringify(question.options) : null
        ]
      );

      questionIds.push(questionResult.rows[0].id);
    }

    await client.query('COMMIT');

    logger.info('Quiz synced to database successfully', {
      quizId,
      questionCount: questionIds.length
    });

    return {
      quizId,
      questionIds,
      success: true,
      message: `Synced ${questionIds.length} questions`
    };

  } catch (error: any) {
    await client.query('ROLLBACK');

    logger.error('Failed to sync quiz to database', {
      moodleQuizId: quiz.id,
      error: error.message
    });

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get quiz by LTI context key
 * @param pg - PostgreSQL pool
 * @param ltiContextKey - LTI context key
 * @returns Promise<MoodleQuiz | null> - Quiz or null
 */
export async function getQuizByLtiContextKey(
  pg: Pool,
  ltiContextKey: string
): Promise<MoodleQuiz | null> {
  try {
    const result = await pg.query(
      `SELECT
        mq.id,
        mq.moodle_quiz_id as "id",
        mq.course_id as "course",
        mq.course_module_id as "courseModule",
        mq.name,
        mq.intro,
        mq.time_open as "timeOpen",
        mq.time_close as "timeClose",
        mq.time_limit as "timeLimit"
      FROM moodle_quizzes mq
      WHERE mq.lti_context_key = $1`,
      [ltiContextKey]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const quiz = result.rows[0];

    // Fetch questions
    const questionsResult = await pg.query(
      `SELECT
        id,
        moodle_question_id as "moodleQuestionId",
        name,
        question_text as "questionText",
        default_mark as "defaultMark",
        qtype,
        category,
        options
      FROM moodle_questions
      WHERE quiz_id = $1
      ORDER BY id ASC`,
      [quiz.id]
    );

    return {
      ...quiz,
      questions: questionsResult.rows.map(row => ({
        id: row.moodleQuestionId,
        name: row.name,
        questionText: row.questionText,
        defaultMark: row.defaultMark,
        qtype: row.qtype,
        category: row.category,
        options: row.options ? JSON.parse(row.options) : null
      }))
    };
  } catch (error: any) {
    logger.error('Failed to get quiz by LTI context key', {
      ltiContextKey,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get quiz by room code (via LTI context key)
 * @param pg - PostgreSQL pool
 * @param roomCode - Room code
 * @returns Promise<MoodleQuiz | null> - Quiz or null
 */
export async function getQuizByRoomCode(
  pg: Pool,
  roomCode: string
): Promise<MoodleQuiz | null> {
  try {
    const result = await pg.query(
      `SELECT
        mq.id,
        mq.moodle_quiz_id as "id",
        mq.course_id as "course",
        mq.course_module_id as "courseModule",
        mq.name,
        mq.intro,
        mq.time_open as "timeOpen",
        mq.time_close as "timeClose",
        mq.time_limit as "timeLimit"
      FROM moodle_quizzes mq
      INNER JOIN proctoring_rooms pr ON mq.lti_context_key = pr.lti_context_key
      WHERE pr.room_code = $1`,
      [roomCode]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const quiz = result.rows[0];

    // Fetch questions
    const questionsResult = await pg.query(
      `SELECT
        id,
        moodle_question_id as "moodleQuestionId",
        name,
        question_text as "questionText",
        default_mark as "defaultMark",
        qtype,
        category,
        options
      FROM moodle_questions
      WHERE quiz_id = $1
      ORDER BY id ASC`,
      [quiz.id]
    );

    return {
      ...quiz,
      questions: questionsResult.rows.map(row => ({
        id: row.moodleQuestionId,
        name: row.name,
        questionText: row.questionText,
        defaultMark: row.defaultMark,
        qtype: row.qtype,
        category: row.category,
        options: row.options ? JSON.parse(row.options) : null
      }))
    };
  } catch (error: any) {
    logger.error('Failed to get quiz by room code', {
      roomCode,
      error: error.message
    });
    throw error;
  }
}

export async function getQuizByExamMapping(
  pg: Pool,
  moodleCourseId: number,
  moodleCourseModuleId: number
): Promise<MoodleQuiz | null> {
  try {
    const result = await pg.query(
      `SELECT
        mq.id,
        mq.moodle_quiz_id as "id",
        mq.course_id as "course",
        mq.course_module_id as "courseModule",
        mq.name,
        mq.intro,
        mq.time_open as "timeOpen",
        mq.time_close as "timeClose",
        mq.time_limit as "timeLimit"
      FROM moodle_quizzes mq
      WHERE mq.course_id = $1
      AND mq.course_module_id = $2
      ORDER BY mq.updated_at DESC
      LIMIT 1`,
      [moodleCourseId, moodleCourseModuleId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const quiz = result.rows[0];
    const questionsResult = await pg.query(
      `SELECT
        moodle_question_id as "moodleQuestionId",
        name,
        question_text as "questionText",
        default_mark as "defaultMark",
        qtype,
        category,
        options
      FROM moodle_questions
      WHERE quiz_id = $1
      ORDER BY id ASC`,
      [quiz.id]
    );

    return {
      ...quiz,
      questions: questionsResult.rows.map(row => ({
        id: row.moodleQuestionId,
        name: row.name,
        questionText: row.questionText,
        defaultMark: row.defaultMark,
        qtype: row.qtype,
        category: row.category,
        options: typeof row.options === 'string' ? JSON.parse(row.options) : row.options
      }))
    };
  } catch (error: any) {
    logger.error('Failed to get quiz by exam mapping', {
      moodleCourseId,
      moodleCourseModuleId,
      error: error.message
    });
    throw error;
  }
}
