// ============================================================================
// LTI Module - Routes
// HTTP endpoints for LTI 1.1 launch
// ============================================================================

import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import {
  validateLaunchRequest,
  findOrCreateRoomForLtiContext,
  findOrCreateUserByEmail
} from './lti.service';
import {
  sendGradeForAttempt
} from './lti-outcomes.service';
import logger from '../../config/logger';
import { UserRole } from '../../types';

// ============================================================================
// Routes Plugin
// ============================================================================

export default fp(async (fastify: FastifyInstance) => {
  fastify.get('/api/lti/launch', {
    config: {
      public: true
    }
  }, async (_request, reply) => {
    return reply.type('text/html').send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>LTI Launch Endpoint</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: #f8fafc;
            color: #0f172a;
            margin: 0;
            padding: 48px 20px;
          }
          .card {
            max-width: 760px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 12px 40px rgba(15, 23, 42, 0.08);
            padding: 32px;
          }
          h1 {
            margin-top: 0;
          }
          code {
            background: #e2e8f0;
            padding: 2px 6px;
            border-radius: 6px;
          }
          ul {
            padding-left: 20px;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>LTI launch endpoint is online</h1>
          <p>This URL expects an <strong>LTI 1.1 POST launch</strong> from Moodle, not a normal browser GET request.</p>
          <p>If you reached this page from Moodle, the External Tool is likely configured as a plain URL instead of a proper LTI launch.</p>
          <ul>
            <li>Tool URL: <code>${process.env.BACKEND_URL || 'http://localhost:5000'}/api/lti/launch</code></li>
            <li>Consumer key: <code>${process.env.LTI_CONSUMER_KEY || 'moodle'}</code></li>
            <li>Launch container: <code>New window</code></li>
            <li>Privacy: enable name and email sharing</li>
          </ul>
        </div>
      </body>
      </html>
    `);
  });

  // ==========================================================================
  // POST /api/lti/launch - LTI 1.1 launch endpoint
  // ==========================================================================
  // Receives POST request from Moodle with OAuth 1.0 signature + LTI parameters
  // Validates signature, finds/creates room, returns HTML redirect to desktop app
  //
  // PUBLIC endpoint - no auth middleware (LTI provides its own auth via OAuth)
  // ==========================================================================

  fastify.post('/api/lti/launch', {
    config: {
      public: true // Bypass auth middleware
    }
  }, async (request, reply): Promise<any> => {
    try {
      const body = request.body as any;

      logger.info('LTI launch received', {
        contextId: body.context_id,
        resourceId: body.resource_link_id,
        userId: body.user_id,
        roles: body.roles
      });

      // ======================================================================
      // Step 1: Validate OAuth 1.0 signature and LTI parameters
      // ======================================================================

      const ltiContext = await validateLaunchRequest(body, fastify.pg as any);

      // ======================================================================
      // Step 2: Handle role-based routing
      // ======================================================================

      if (ltiContext.isInstructor) {
        // Instructor launch - redirect to teacher dashboard
        logger.info('Instructor LTI launch - redirecting to dashboard', {
          contextKey: ltiContext.contextKey
        });

        return reply.type('text/html').send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Instructor Access - Moodle Proctoring</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                text-align: center;
                padding: 80px 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
              }
              .container {
                background: white;
                color: #333;
                max-width: 500px;
                margin: 0 auto;
                padding: 40px;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
              }
              h1 { margin: 0 0 20px 0; color: #667eea; }
              p { line-height: 1.6; margin-bottom: 20px; }
              a {
                display: inline-block;
                padding: 12px 24px;
                background: #667eea;
                color: white;
                text-decoration: none;
                border-radius: 6px;
                font-weight: 600;
                transition: background 0.2s;
              }
              a:hover { background: #5568d3; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>👨‍🏫 Instructor Access</h1>
              <p><strong>Instructor LTI integration is not supported.</strong></p>
              <p>Please use the Teacher Dashboard to create proctoring rooms and monitor students.</p>
              <a href="http://localhost:3000">Open Teacher Dashboard</a>
            </div>
          </body>
          </html>
        `);
      }

      // ======================================================================
      // Step 3: Find or create user (must happen before room creation for instructor ownership)
      // ======================================================================

      const userId = await findOrCreateUserByEmail(
        fastify.pg as any,
        ltiContext.userEmail,
        ltiContext.userFullname
      );

      // ======================================================================
      // Step 4: Student/Instructor launch - Find or create room
      // ======================================================================

      logger.info('LTI launch - processing room creation', {
        contextKey: ltiContext.contextKey,
        isInstructor: ltiContext.isInstructor,
        userId
      });

      const roomCode = await findOrCreateRoomForLtiContext(
        fastify.pg as any,
        ltiContext,
        1, // exam_id (default to 1 for LTI)
        ltiContext.isInstructor ? (userId || undefined) : undefined // Pass database user ID for instructors
      );

      // ======================================================================
      // Step 5: Generate JWT token for desktop app
      // ======================================================================

      const tokenPayload = {
        userId: userId || 0,
        moodleUserId: userId || 0,
        username: ltiContext.userEmail || `lti-user-${userId || 0}`,
        email: ltiContext.userEmail || `lti-user-${userId || 0}@placeholder.local`,
        roomCode: roomCode,
        ltiLaunch: true,
        contextId: ltiContext.contextKey,
        resourceId: ltiContext.resourceId,
        role: UserRole.STUDENT,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
      };

      const token = fastify.jwt.sign(
        tokenPayload,
        { expiresIn: '24h' }
      );

      logger.info('Generated JWT for LTI launch', {
        userId,
        roomCode,
        contextKey: ltiContext.contextKey
      });

      // ======================================================================
      // Step 6: Return HTML redirect page with proctor:// deep link
      // ======================================================================

      const htmlResponse = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Launching Proctoring App...</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
              text-align: center;
              padding: 80px 20px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              background: white;
              color: #333;
              max-width: 500px;
              margin: 0 auto;
              padding: 40px;
              border-radius: 12px;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            }
            h1 { margin: 0 0 20px 0; color: #667eea; }
            p { line-height: 1.6; margin-bottom: 15px; }
            .room-code {
              font-family: 'Courier New', monospace;
              background: #f0f0f0;
              padding: 8px 16px;
              border-radius: 4px;
              font-weight: bold;
              letter-spacing: 1px;
            }
            .spinner {
              border: 4px solid #f3f3f3;
              border-top: 4px solid #667eea;
              border-radius: 50%;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
              margin: 20px auto;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            a {
              display: inline-block;
              padding: 12px 24px;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              transition: background 0.2s;
              margin-top: 10px;
            }
            a:hover { background: #5568d3; }
            .fallback {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e0e0e0;
            }
            .error {
              background: #fee;
              color: #c33;
              padding: 12px;
              border-radius: 6px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚀 Launching Proctoring App</h1>
            <div class="spinner"></div>
            <p><strong>Room:</strong> <span class="room-code">${roomCode}</span></p>
            <p>The desktop app should open automatically.</p>
            <div class="fallback">
              <p><strong>If the app doesn't open:</strong></p>
              <a href="proctor://room/${encodeURIComponent(roomCode)}?token=${encodeURIComponent(token)}">
                Click here to launch
              </a>
            </div>
            <div class="fallback">
              <p><strong>Don't have the desktop app?</strong></p>
              <a href="https://github.com/aryaniyaps/moodle-proctor#download" target="_blank">
                Download Proctoring App
              </a>
            </div>
          </div>
          <script>
            // Auto-launch after 2 seconds
            setTimeout(function() {
              window.location = 'proctor://room/${encodeURIComponent(roomCode)}?token=${encodeURIComponent(token)}';
            }, 2000);
          </script>
        </body>
        </html>
      `;

      return reply.type('text/html').send(htmlResponse);

    } catch (error: any) {
      // ======================================================================
      // Error Handling
      // ======================================================================

      if (error.name === 'LtiValidationError') {
        logger.error('LTI validation failed', { error: error.message });
        return reply.code(403).type('text/html').send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <title>LTI Error</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 80px 20px; background: #fee; color: #c33; }
              .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; }
              h1 { margin: 0 0 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>❌ LTI Launch Failed</h1>
              <p><strong>Invalid LTI signature</strong></p>
              <p>Please contact your instructor or Moodle administrator.</p>
            </div>
          </body>
          </html>
        `);
      }

      if (error.name === 'LtiTimestampError') {
        logger.error('LTI timestamp error', { error: error.message });
        return reply.code(403).type('text/html').send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <title>LTI Error</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 80px 20px; background: #fee; color: #c33; }
              .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; }
              h1 { margin: 0 0 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>❌ LTI Launch Failed</h1>
              <p><strong>Invalid timestamp</strong></p>
              <p>Your system clock may be incorrect. Please sync your clock and try again.</p>
            </div>
          </body>
          </html>
        `);
      }

      if (error.name === 'LtiRoomCreationError') {
        logger.error('LTI room creation failed', { error: error.message, cause: error.cause });
        return reply.code(500).type('text/html').send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <title>LTI Error</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 80px 20px; background: #fee; color: #c33; }
              .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; }
              h1 { margin: 0 0 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>❌ LTI Launch Failed</h1>
              <p><strong>Failed to create proctoring room</strong></p>
              <p>Please try again or contact your instructor.</p>
            </div>
          </body>
          </html>
        `);
      }

      // Generic error
      logger.error('LTI launch error', { error });
      return reply.code(500).type('text/html').send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>LTI Error</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 80px 20px; background: #fee; color: #c33; }
            .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; }
            h1 { margin: 0 0 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ LTI Launch Failed</h1>
            <p><strong>An unexpected error occurred</strong></p>
            <p>Please try again or contact your instructor.</p>
          </div>
        </body>
        </html>
      `);
    }
  });

  // ==========================================================================
  // GET /api/lti/config - LTI tool configuration (for XML cartridge)
  // ==========================================================================
  // Returns configuration information for manual tool setup in Moodle
  // NOTE: XML cartridge generation is deferred to Phase 2
  // ==========================================================================

  fastify.get('/api/lti/config', async (_request, _reply) => {
    return {
      success: true,
      data: {
        title: 'Moodle Proctoring',
        description: 'AI-powered proctoring for Moodle exams',
        launchUrl: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/lti/launch`,
        consumerKey: process.env.LTI_CONSUMER_KEY || 'moodle',
        // NOTE: Never share the secret in API responses
        // Instructor must configure this manually in Moodle
        iconUrl: `${process.env.BACKEND_URL || 'http://localhost:5000'}/icon.png`,
        toolConsumerInfo: {
          productFamilyCode: 'moodle-proctor',
          version: '1.0.0'
        }
      }
    };
  });

  // ==========================================================================
  // POST /api/lti/outcomes/send-grade - Send grade to Moodle (Phase 3)
  // ==========================================================================
  // Sends exam grade back to Moodle via LTI Outcomes service
  // Requires OAuth signature and POX XML format
  // ==========================================================================

  // ==========================================================================
  // POST /api/lti/outcomes/send-grade - Send grade to Moodle (Phase 3)
  // ==========================================================================
  // Sends exam grade back to Moodle via LTI Outcomes service
  // Requires OAuth signature and POX XML format
  // ==========================================================================

  fastify.post('/api/lti/outcomes/send-grade', {
    // Accept JSON for grade passback
  }, async (request, reply) => {
    try {
      const body = request.body as {
        attemptId: number;
        score: number;
      };

      // Validate request
      if (!body.attemptId || typeof body.score !== 'number') {
        return reply.code(400).send({
          success: false,
          error: 'attemptId and score are required'
        });
      }

      if (body.score < 0 || body.score > 1) {
        return reply.code(400).send({
          success: false,
          error: 'Score must be between 0 and 1'
        });
      }

      logger.info('Sending grade to Moodle', {
        attemptId: body.attemptId,
        score: body.score
      });

      // Send grade using LTI Outcomes service
      const response = await sendGradeForAttempt(
        fastify.pg,
        body.attemptId,
        body.score
      );

      if (response.success) {
        return reply.send({
          success: true,
          message: 'Grade sent to Moodle successfully',
          data: response
        });
      } else {
        return reply.code(500).send({
          success: false,
          error: 'Failed to send grade to Moodle',
          details: response.description
        });
      }

    } catch (error: any) {
      logger.error('LTI grade passback failed', { error: error.message });
      return reply.code(500).send({
        success: false,
        error: 'Failed to send grade to Moodle',
        details: error.message
      });
    }
  });
});
