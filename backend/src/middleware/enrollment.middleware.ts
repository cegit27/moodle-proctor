// ============================================================================
// Enrollment Signature Validation Middleware
// Validates HMAC signatures on room-based enrollment requests
// ============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';
import { validateEnrollmentSignature } from '../modules/room/room.service';

/**
 * Middleware to validate enrollment signature on requests
 * Prevents tampering with enrollment IDs stored in localStorage
 */
export async function enrollmentSignatureMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const enrollmentId = request.headers['x-room-enrollment-id'];
  const roomId = request.headers['x-room-id'];
  const signature = request.headers['x-room-enrollment-signature'];

  // Skip validation if headers are missing (not a room-based request)
  if (!enrollmentId || !signature) {
    return; // Let the request proceed (will be handled by auth checks)
  }

  // Validate the signature
  const enrollmentIdNum = parseInt(enrollmentId as string, 10);
  const roomIdNum = parseInt(roomId as string, 10);

  if (isNaN(enrollmentIdNum) || isNaN(roomIdNum)) {
    return reply.code(400).send({
      success: false,
      error: 'Invalid enrollment headers'
    });
  }

  const isValid = validateEnrollmentSignature(enrollmentIdNum, roomIdNum, signature as string);

  if (!isValid) {
    return reply.code(403).send({
      success: false,
      error: 'Invalid enrollment signature. Please rejoin the room.'
    });
  }

  // Signature is valid, proceed with request
}
