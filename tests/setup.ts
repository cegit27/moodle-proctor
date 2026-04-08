/**
 * @file tests/setup.ts
 * @description Global test setup and configuration
 */

import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// ============================================================================
// Global Test Configuration
// ============================================================================

// Set test database
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 
  'postgresql://postgres:postgres@localhost:5432/moodle_proctor_test';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// ============================================================================
// Setup Timeout
// ============================================================================

jest.setTimeout(30000);

// ============================================================================
// Mock timers (optional)
// ============================================================================

// Don't mock timers by default for integration tests
// Use jest.useFakeTimers() in specific tests if needed

// ============================================================================
// Global Test Hooks
// ============================================================================

beforeAll(async () => {
  console.log('Setting up test suite...');
});

afterAll(async () => {
  console.log('Cleaning up test suite...');
});

// ============================================================================
// Custom Matchers
// ============================================================================

expect.extend({
  toBeValidJWT(received: string) {
    const jwtRegex = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
    const pass = jwtRegex.test(received);

    return {
      message: () => 
        `expected ${received} to ${pass ? 'not ' : ''}be a valid JWT`,
      pass,
    };
  },

  toBeValidEmail(received: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);

    return {
      message: () =>
        `expected ${received} to ${pass ? 'not ' : ''}be a valid email`,
      pass,
    };
  },

  toBeValidUUID(received: string) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);

    return {
      message: () =>
        `expected ${received} to ${pass ? 'not ' : ''}be a valid UUID`,
      pass,
    };
  },

  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;

    return {
      message: () =>
        `expected ${received} to ${pass ? 'not ' : ''}be within range ${floor} - ${ceiling}`,
      pass,
    };
  },
});

// ============================================================================
// Suppress Console Errors in Tests
// ============================================================================

const originalError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render') ||
       args[0].includes('Not implemented: HTMLFormElement.prototype.submit'))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

// ============================================================================
// Extend Jest Matchers TypeScript
// ============================================================================

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidJWT(): R;
      toBeValidEmail(): R;
      toBeValidUUID(): R;
      toBeWithinRange(floor: number, ceiling: number): R;
    }
  }
}
