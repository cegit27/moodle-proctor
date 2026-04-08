/**
 * @file tests/unit/auth.service.test.ts
 * @description Unit tests for Authentication Service
 */

import * as AuthModule from '../../backend/src/modules/auth/auth.service';
import jwtService from '../../backend/src/modules/auth/jwt.service';
import moodleService from '../../backend/src/modules/auth/moodle.service';
import { UnauthorizedError, BadRequestError, MoodleError } from '../../backend/src/utils/errors';

// Mock dependencies
jest.mock('../../backend/src/modules/auth/jwt.service');
jest.mock('../../backend/src/modules/auth/moodle.service');

describe('AuthService', () => {
let authService: any;
  let mockFastify: any;

  beforeEach(() => {
    (authService = AuthModule.default);
    mockFastify = {
      pg: {
        query: jest.fn(),
        connect: jest.fn()
      }
    };
    jest.clearAllMocks();
  });

  describe('login()', () => {
    it('should successfully log in user with valid credentials', async () => {
      const loginRequest = {
        username: 'testuser',
        password: 'password123'
      };

      const mockMoodleToken = 'moodle-token-123';
      const mockSiteInfo = {
        userid: 1,
        username: 'testuser',
        email: 'test@example.com',
        firstname: 'Test',
        lastname: 'User',
        userpictureurl: 'http://example.com/pic.jpg'
      };

      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role: 'student',
        moodleUserId: 1,
        profileImageUrl: 'http://example.com/pic.jpg',
        createdAt: new Date(),
        lastLoginAt: new Date()
      };

      (moodleService.authenticate as jest.Mock).mockResolvedValue(mockMoodleToken);
      (moodleService.validateToken as jest.Mock).mockResolvedValue(mockSiteInfo);
      (moodleService.syncUser as jest.Mock).mockResolvedValue({
        userId: 1,
        role: 'student'
      });
      (jwtService.generateToken as jest.Mock).mockReturnValue('jwt-token-123');
      (jwtService.validateToken as jest.Mock).mockReturnValue({
        userId: 1,
        exp: Math.floor(Date.now() / 1000) + 3600
      });

      const mockPgQuery = jest.fn().mockResolvedValue({
        rows: [{ ...mockUser, role_id: 2 }]
      });
      mockFastify.pg = { query: mockPgQuery } as any;

      const result = await authService.login(mockFastify as any, loginRequest);

      expect(result).toHaveProperty('token', 'jwt-token-123');
      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('expiresAt');
      expect(moodleService.authenticate).toHaveBeenCalledWith('testuser', 'password123');
    });

    it('should throw BadRequestError when username is missing', async () => {
      const loginRequest = {
        username: '',
        password: 'password123'
      };

      await expect(authService.login(mockFastify as any, loginRequest))
        .rejects
        .toThrow(BadRequestError);
    });

    it('should throw BadRequestError when password is missing', async () => {
      const loginRequest = {
        username: 'testuser',
        password: ''
      };

      await expect(authService.login(mockFastify as any, loginRequest))
        .rejects
        .toThrow(BadRequestError);
    });

    it('should throw UnauthorizedError on Moodle authentication failure', async () => {
      const loginRequest = {
        username: 'testuser',
        password: 'wrongpassword'
      };

      (moodleService.authenticate as jest.Mock)
        .mockRejectedValue(new MoodleError('Invalid credentials'));

      await expect(authService.login(mockFastify as any, loginRequest))
        .rejects
        .toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError on invalid credentials', async () => {
      const loginRequest = {
        username: 'testuser',
        password: 'wrongpassword'
      };

      (moodleService.authenticate as jest.Mock)
        .mockRejectedValue(new Error('Authentication failed'));

      await expect(authService.login(mockFastify as any, loginRequest))
        .rejects
        .toThrow(UnauthorizedError);
    });
  });

  describe('validateToken()', () => {
    it('should successfully validate valid token', async () => {
      const token = 'valid-jwt-token';
      const mockJwtPayload = {
        userId: 1,
        username: 'testuser',
        email: 'test@example.com',
        role: 'student',
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      const mockUser = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com',
        role: 'student'
      };

      (jwtService.validateToken as jest.Mock).mockReturnValue(mockJwtPayload);
      const mockPgQuery = jest.fn().mockResolvedValue({
        rows: [mockUser]
      });
      mockFastify.pg = { query: mockPgQuery } as any;

      const result = await authService.validateToken(mockFastify as any, token);

      expect(result).toEqual(mockUser);
      expect(jwtService.validateToken).toHaveBeenCalledWith(token);
    });

    it('should throw UnauthorizedError for invalid token', async () => {
      const token = 'invalid-jwt-token';

      (jwtService.validateToken as jest.Mock)
        .mockImplementation(() => {
          throw new Error('Invalid token');
        });

      await expect(authService.validateToken(mockFastify as any, token))
        .rejects
        .toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError when user not found', async () => {
      const token = 'valid-jwt-token';
      const mockJwtPayload = {
        userId: 999,
        username: 'nonexistentuser',
        email: 'nonexistent@example.com',
        role: 'student',
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      (jwtService.validateToken as jest.Mock).mockReturnValue(mockJwtPayload);
      const mockPgQuery = jest.fn().mockResolvedValue({
        rows: []
      });
      mockFastify.pg = { query: mockPgQuery } as any;

      await expect(authService.validateToken(mockFastify as any, token))
        .rejects
        .toThrow(UnauthorizedError);
    });
  });

  describe('refreshToken()', () => {
    it('should successfully refresh valid token', async () => {
      const oldToken = 'old-jwt-token';
      const newToken = 'new-jwt-token';

      const mockOldPayload = {
        userId: 1,
        username: 'testuser',
        moodleToken: 'encrypted-moodle-token',
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      (jwtService.validateToken as jest.Mock).mockReturnValue(mockOldPayload);
      (jwtService.decryptMoodleToken as jest.Mock).mockReturnValue('moodle-token-123');
      (moodleService.validateToken as jest.Mock).mockResolvedValue({
        userid: 1,
        username: 'testuser'
      });
      (jwtService.refreshToken as jest.Mock).mockReturnValue(newToken);

      const result = await authService.refreshToken(mockFastify as any, oldToken);

      expect(result).toBe(newToken);
      expect(jwtService.validateToken).toHaveBeenCalledWith(oldToken);
    });

    it('should throw UnauthorizedError on Moodle token validation failure', async () => {
      const oldToken = 'old-jwt-token';

      const mockOldPayload = {
        userId: 1,
        username: 'testuser',
        moodleToken: 'invalid-moodle-token',
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      (jwtService.validateToken as jest.Mock).mockReturnValue(mockOldPayload);
      (jwtService.decryptMoodleToken as jest.Mock).mockReturnValue('moodle-token-123');
      (moodleService.validateToken as jest.Mock)
        .mockRejectedValue(new MoodleError('Invalid Moodle token'));

      await expect(authService.refreshToken(mockFastify as any, oldToken))
        .rejects
        .toThrow(UnauthorizedError);
    });
  });

  describe('logout()', () => {
    it('should successfully logout user', async () => {
      const userId = 1;
      const mockPgQuery = jest.fn().mockResolvedValue({ rows: [] });
      mockFastify.pg = { query: mockPgQuery } as any;

      await authService.logout(mockFastify as any, userId);

      expect(mockPgQuery).toHaveBeenCalled();
    });
  });

  describe('validateCredentials()', () => {
    it('should return true for valid credentials format', () => {
      const result = authService.validateCredentials('testuser', 'password123');
      expect(result).toBe(true);
    });

    it('should return false for empty username', () => {
      const result = authService.validateCredentials('', 'password123');
      expect(result).toBe(false);
    });

    it('should return false for empty password', () => {
      const result = authService.validateCredentials('testuser', '');
      expect(result).toBe(false);
    });

    it('should return false for null values', () => {
      const result = authService.validateCredentials(null as any, null as any);
      expect(result).toBe(false);
    });
  });
});
