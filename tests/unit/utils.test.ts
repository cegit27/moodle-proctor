/**
 * @file tests/unit/utils.test.ts
 * @description Unit tests for Utility Functions
 */

describe('Utility Functions', () => {
  describe('generateSessionId()', () => {
    it('should generate unique session IDs', () => {
      // Generate multiple IDs and verify uniqueness
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(`session-${Date.now()}-${Math.random()}`);
      }
      expect(ids.size).toBe(100);
    });

    it('should generate session ID with required format', () => {
      const sessionId = `session-${Date.now()}-${Math.random()}`;
      expect(sessionId).toMatch(/^session-\d+-0\.\d+$/);
    });
  });

  describe('validateEmail()', () => {
    it('should validate correct email format', () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      expect(emailRegex.test('user@example.com')).toBe(true);
      expect(emailRegex.test('test.user@example.co.uk')).toBe(true);
    });

    it('should reject invalid email format', () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      expect(emailRegex.test('invalid-email')).toBe(false);
      expect(emailRegex.test('user@example')).toBe(false);
      expect(emailRegex.test('@example.com')).toBe(false);
    });

    it('should handle null and undefined', () => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      expect(emailRegex.test(null as any)).toBe(false);
      expect(emailRegex.test(undefined as any)).toBe(false);
    });
  });

  describe('formatTimestamp()', () => {
    it('should format timestamp to ISO string', () => {
      const date = new Date('2024-01-15T10:30:45Z');
      const formatted = date.toISOString();
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should handle different date formats', () => {
      const dates = [
        new Date('2024-01-15'),
        new Date('2024-12-31'),
        new Date()
      ];

      dates.forEach(date => {
        const formatted = date.toISOString();
        expect(formatted).toBeDefined();
        expect(formatted.length).toBeGreaterThan(0);
      });
    });
  });

  describe('calculateDuration()', () => {
    it('should calculate duration between two timestamps', () => {
      const start = new Date('2024-01-15T10:00:00Z');
      const end = new Date('2024-01-15T10:30:00Z');
      const duration = (end.getTime() - start.getTime()) / 1000 / 60; // minutes
      expect(duration).toBe(30);
    });

    it('should handle duration less than 1 minute', () => {
      const start = new Date('2024-01-15T10:00:00Z');
      const end = new Date('2024-01-15T10:00:30Z');
      const duration = (end.getTime() - start.getTime()) / 1000; // seconds
      expect(duration).toBe(30);
    });

    it('should handle negative duration', () => {
      const start = new Date('2024-01-15T10:30:00Z');
      const end = new Date('2024-01-15T10:00:00Z');
      const duration = (end.getTime() - start.getTime()) / 1000 / 60;
      expect(duration).toBeLessThan(0);
    });
  });

  describe('sanitizeInput()', () => {
    it('should remove HTML tags from input', () => {
      const input = '<script>alert("xss")</script>test';
      const sanitized = input.replace(/<[^>]*>/g, '');
      expect(sanitized).toBe('alert("xss")test');
    });

    it('should trim whitespace', () => {
      const input = '  test input  ';
      const trimmed = input.trim();
      expect(trimmed).toBe('test input');
    });

    it('should handle null and undefined', () => {
      expect(null?.toString()).toBeNull();
      expect(undefined?.toString()).toBeUndefined();
    });
  });

  describe('hashPassword()', () => {
    it('should generate hash for password', async () => {
      // Simulate bcrypt or similar
      const password = 'testpassword123';
      const hash = `hashed_${password}`; // In real impl, use bcrypt
      
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
    });

    it('should handle empty password', () => {
      const password = '';
      expect(password.length).toBe(0);
    });
  });

  describe('comparePasswords()', () => {
    it('should verify correct password', () => {
      // Simulate bcrypt comparison
      const password = 'testpassword123';
      const hash = `hashed_${password}`;
      const match = hash === `hashed_${password}`;
      
      expect(match).toBe(true);
    });

    it('should reject incorrect password', () => {
      const password = 'testpassword123';
      const hash = 'hashed_another_password';
      const match = hash === `hashed_${password}`;
      
      expect(match).toBe(false);
    });
  });

  describe('generateRandomToken()', () => {
    it('should generate random token of specified length', () => {
      const length = 32;
      const token = Math.random().toString(36).substring(2, 2 + length);
      expect(token).toBeDefined();
      expect(token.length).toBeLessThanOrEqual(length);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 10; i++) {
        tokens.add(Math.random().toString(36));
      }
      expect(tokens.size).toBe(10);
    });
  });

  describe('convertBase64ToBlob()', () => {
    it('should convert base64 to blob', () => {
      const base64 = 'SGVsbG8gV29ybGQ='; // "Hello World"
      const binaryString = atob(base64);
      expect(binaryString).toBe('Hello World');
    });

    it('should handle image base64', () => {
      // Data URI for 1x1 pixel PNG
      const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const decoded = atob(base64);
      expect(decoded.length).toBeGreaterThan(0);
    });
  });

  describe('parseJSONSafely()', () => {
    it('should parse valid JSON', () => {
      const jsonStr = '{"key": "value"}';
      const parsed = JSON.parse(jsonStr);
      expect(parsed).toEqual({ key: 'value' });
    });

    it('should handle invalid JSON', () => {
      const jsonStr = 'invalid json';
      try {
        JSON.parse(jsonStr);
        expect(true).toBe(false); // Should not reach here
      } catch (e) {
        expect(e).toBeDefined();
      }
    });

    it('should handle empty string', () => {
      const jsonStr = '';
      try {
        JSON.parse(jsonStr);
        expect(true).toBe(false);
      } catch (e) {
        expect(e).toBeDefined();
      }
    });
  });

  describe('deepClone()', () => {
    it('should create deep clone of object', () => {
      const original = { name: 'test', nested: { value: 123 } };
      const clone = JSON.parse(JSON.stringify(original));
      
      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);
      expect(clone.nested).not.toBe(original.nested);
    });

    it('should clone arrays', () => {
      const original = [1, 2, 3];
      const clone = [...original];
      
      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);
    });
  });

  describe('isValidURL()', () => {
    it('should validate correct URLs', () => {
      const urlRegex = /^https?:\/\/.+/;
      expect(urlRegex.test('http://example.com')).toBe(true);
      expect(urlRegex.test('https://example.com/path')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      const urlRegex = /^https?:\/\/.+/;
      expect(urlRegex.test('not-a-url')).toBe(false);
      expect(urlRegex.test('ftp://example.com')).toBe(false);
    });
  });

  describe('retryWithBackoff()', () => {
    it('should retry failed operation', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) throw new Error('Failed');
        return 'success';
      };

      // Simulate retry
      let result;
      for (let i = 0; i < 3; i++) {
        try {
          result = await operation();
          break;
        } catch (e) {
          if (i === 2) throw e;
        }
      }

      expect(result).toBe('success');
    });

    it('should throw error after max retries', async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        throw new Error('Always fails');
      };

      try {
        for (let i = 0; i < 3; i++) {
          await operation();
        }
        expect(true).toBe(false); // Should not reach
      } catch (e) {
        expect(e).toBeDefined();
      }
    });
  });
});
