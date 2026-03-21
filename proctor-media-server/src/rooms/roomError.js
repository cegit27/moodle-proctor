'use strict';

/**
 * Domain-specific error for room-management failures.
 *
 * Usage:
 *   throw new RoomError('ROOM_NOT_FOUND');
 *   throw new RoomError('ROOM_EXISTS', 'Room already exists for this exam');
 *
 * Callers can switch on `err.code` without parsing the message string.
 */
class RoomError extends Error {
  /**
   * @param {string} code    Machine-readable error code (e.g. 'ROOM_NOT_FOUND')
   * @param {string} [message] Human-readable description; falls back to `code`
   */
  constructor(code, message) {
    super(message || code);
    this.name = 'RoomError';
    this.code = code;

    // Preserve V8 stack-trace origin point
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, RoomError);
    }
  }
}

module.exports = RoomError;
