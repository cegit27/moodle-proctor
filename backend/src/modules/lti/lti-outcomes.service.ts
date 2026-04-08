// ============================================================================
// LTI Module - Outcomes Service (Grade Passback)
// Implements LTI 1.1 Outcomes service for sending grades to Moodle
// ============================================================================

import axios from 'axios';
import crypto from 'crypto';
import logger from '../../config/logger';

// ============================================================================
// Types
// ============================================================================

/**
 * LTI Outcome Result
 * Represents a grade/score to send back to Moodle
 */
export interface LtiOutcomeResult {
  sourcedId: string; // lis_result_sourcedid from LTI launch
  score: number; // Score between 0.0 and 1.0
  userId: number; // Internal user ID
  attemptId?: number; // Exam attempt ID (for tracking)
}

/**
 * LTI Outcome Response
 * Response from Moodle after sending grade
 */
export interface LtiOutcomeResponse {
  success: boolean;
  message?: string;
  codeMajor?: string;
  severity?: string;
  description?: string;
}

// ============================================================================
// LTI Outcomes Service
// ============================================================================

/**
 * Parse POX XML request for replaceResult
 * @param sourcedId - lis_result_sourcedid from LTI launch
 * @param score - Score between 0.0 and 1.0
 * @param messageIdentifier - Unique message ID
 * @returns POX XML string
 */
function buildReplaceResultPox(
  sourcedId: string,
  score: number,
  messageIdentifier: string
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<imsx_POXEnvelopeRequest xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">
  <imsx_POXHeader>
    <imsx_POXRequestHeaderInfo>
      <imsx_version>V1.0</imsx_version>
      <imsx_messageIdentifier>${messageIdentifier}</imsx_messageIdentifier>
    </imsx_POXRequestHeaderInfo>
  </imsx_POXHeader>
  <imsx_POXBody>
    <replaceResultRequest>
      <resultRecord>
        <sourcedGUID>
          <sourcedId>${sourcedId}</sourcedId>
        </sourcedGUID>
        <result>
          <score>
            <textString>${score.toFixed(2)}</textString>
          </score>
        </result>
      </resultRecord>
    </replaceResultRequest>
  </imsx_POXBody>
</imsx_POXEnvelopeRequest>`;
}

/**
 * Parse POX XML response from Moodle
 * @param xml - POX response XML
 * @returns Parsed response object
 */
function parsePoxResponse(xml: string): LtiOutcomeResponse {
  try {
    // Extract codeMajor
    const codeMajorMatch = xml.match(/<imsx_codeMajor>([A-Za-z]+)<\/imsx_codeMajor>/);
    const codeMajor = codeMajorMatch ? codeMajorMatch[1] : 'unknown';

    // Extract severity
    const severityMatch = xml.match(/<imsx_severity>([A-Za-z]+)<\/imsx_severity>/);
    const severity = severityMatch ? severityMatch[1] : 'unknown';

    // Extract description
    const descriptionMatch = xml.match(/<imsx_description>([^<]+)<\/imsx_description>/);
    const description = descriptionMatch ? descriptionMatch[1] : '';

    // Check if success
    const success = codeMajor === 'success';

    logger.info('LTI outcome response parsed', {
      success,
      codeMajor,
      severity,
      description
    });

    return {
      success,
      codeMajor,
      severity,
      description
    };
  } catch (error: any) {
    logger.error('Failed to parse POX response', { error: error.message });
    return {
      success: false,
      message: 'Failed to parse Moodle response'
    };
  }
}

/**
 * Send grade to Moodle via LTI Outcomes service
 * @param outcomeServiceUrl - lis_outcome_service_url from LTI launch
 * @param consumerKey - OAuth consumer key
 * @param consumerSecret - OAuth consumer secret
 * @param sourcedId - lis_result_sourcedid from LTI launch
 * @param score - Score between 0.0 and 1.0
 * @returns Promise<LtiOutcomeResponse> - Response from Moodle
 */
export async function sendGradeToMoodle(
  outcomeServiceUrl: string,
  consumerKey: string,
  consumerSecret: string,
  sourcedId: string,
  score: number
): Promise<LtiOutcomeResponse> {
  try {
    // Validate score range
    if (score < 0 || score > 1) {
      throw new Error(`Score must be between 0 and 1, got: ${score}`);
    }

    logger.info('Sending grade to Moodle via LTI Outcomes', {
      outcomeServiceUrl,
      sourcedId,
      score
    });

    // Generate unique message identifier
    const messageIdentifier = `send-grade-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Build POX XML request body
    const poxBody = buildReplaceResultPox(sourcedId, score, messageIdentifier);

    // Prepare OAuth parameters
    const oauthParams = {
      oauth_consumer_key: consumerKey,
      oauth_token: '', // No token needed for LTI 1.1
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_nonce: crypto.randomBytes(16).toString('base64'),
      oauth_version: '1.0',
      oauth_signature: ''
    };

    // Generate signature
    // Note: ims-lti library doesn't directly support POX requests, so we need manual signing
    const url = new URL(outcomeServiceUrl);
    const signatureBase = [
      'POST',
      encodeURIComponent(url.origin + url.pathname),
      // Sort and encode parameters
      Object.entries(oauthParams)
        .filter(([key]) => key !== 'oauth_signature')
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .sort()
        .join('&')
    ].join('&');

    const signingKey = `${encodeURIComponent(consumerSecret)}&`;
    const signature = crypto
      .createHmac('sha1', signingKey)
      .update(signatureBase)
      .digest('base64');

    oauthParams.oauth_signature = signature;

    // Build Authorization header
    const authHeader = `OAuth ${Object.entries(oauthParams)
      .map(([key, value]) => `${encodeURIComponent(key)}="${encodeURIComponent(value)}"`)
      .join(', ')}`;

    // Send POST request with POX body
    const response = await axios.post(outcomeServiceUrl, poxBody, {
      headers: {
        'Content-Type': 'application/xml',
        'Authorization': authHeader
      },
      timeout: 30000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    // Parse POX response
    const outcomeResponse = parsePoxResponse(response.data);

    logger.info('Grade sent to Moodle successfully', {
      sourcedId,
      score,
      success: outcomeResponse.success,
      codeMajor: outcomeResponse.codeMajor
    });

    return outcomeResponse;

  } catch (error: any) {
    logger.error('Failed to send grade to Moodle', {
      outcomeServiceUrl,
      sourcedId,
      score,
      error: error.message,
      response: error.response?.data
    });

    return {
      success: false,
      message: error.message,
      description: error.response?.data || 'Failed to send grade to Moodle'
    };
  }
}

/**
 * Send grade for an exam attempt
 * Looks up LTI outcome details from database and sends grade
 * @param pg - PostgreSQL pool
 * @param attemptId - Exam attempt ID
 * @param score - Score between 0.0 and 1.0
 * @returns Promise<LtiOutcomeResponse> - Response from Moodle
 */
export async function sendGradeForAttempt(
  pg: any,
  attemptId: number,
  score: number
): Promise<LtiOutcomeResponse> {
  try {
    // Get attempt details with LTI outcome info
    const result = await pg.query(
      `SELECT
        ea.id as "attemptId",
        ea.user_id as "userId",
        pr.lti_context_key as "ltiContextKey",
        pr.lti_resource_id as "ltiResourceId",
        u.email as "userEmail"
      FROM exam_attempts ea
      INNER JOIN proctoring_rooms pr ON ea.room_id = pr.id
      INNER JOIN users u ON ea.user_id = u.id
      WHERE ea.id = $1`,
      [attemptId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Exam attempt not found: ${attemptId}`);
    }

    // TODO: Store lis_outcome_service_url and lis_result_sourcedid in database
    // For now, we need to get these from the original LTI launch context
    // This is a limitation of the current schema - we need to add these columns

    logger.warn('LTI outcome service not fully implemented', {
      attemptId,
      reason: 'lis_outcome_service_url and lis_result_sourcedid not stored in database',
      recommendation: 'Add these columns to proctoring_rooms or exam_attempts table'
    });

    return {
      success: false,
      message: 'LTI outcome service requires additional database columns',
      description: 'See backend logs for details'
    };

  } catch (error: any) {
    logger.error('Failed to send grade for attempt', {
      attemptId,
      score,
      error: error.message
    });

    return {
      success: false,
      message: error.message,
      description: 'Failed to send grade for exam attempt'
    };
  }
}
