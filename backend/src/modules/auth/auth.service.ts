// ============================================================================
// Authentication Service
// Combines Moodle auth with JWT token generation
// ============================================================================

import { FastifyInstance } from 'fastify';
import logger from '../../config/logger';
import moodleService from './moodle.service';
import jwtService from './jwt.service';
import type { User } from '../../types';
import { UserRole } from '../../types';
import { UnauthorizedError, BadRequestError, MoodleError } from '../../utils/errors';

// ============================================================================
// Types
// ============================================================================

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  expiresAt: number;
  user: User;
}

// ============================================================================
// Authentication Service
// ============================================================================

class AuthService {
  /**
   * Login user with Moodle credentials
   * Returns JWT token and user info
   */
  async login(fastify: FastifyInstance, loginRequest: LoginRequest): Promise<LoginResponse> {
    const { username, password } = loginRequest;

    // Validate input
    if (!username || !password) {
      throw new BadRequestError('Username and password are required');
    }

    try {
      // Step 1: Authenticate with Moodle
      logger.info(`Login attempt for user: ${username}`);
      const moodleToken = await moodleService.authenticate(username, password);

      // Step 2: Validate token and get Moodle user info
      const siteInfo = await moodleService.validateToken(moodleToken);

      // Step 3: Sync user to database
      const { userId, role } = await moodleService.syncUser(moodleToken, siteInfo);

      // Step 4: Check if user exists in database, create if not
      const user = await this.getOrCreateUser(fastify, {
        id: userId,
        moodleUserId: siteInfo.userid,
        username: siteInfo.username,
        email: moodleService.getResolvedEmail(siteInfo),
        firstName: siteInfo.firstname,
        lastName: siteInfo.lastname,
        role: role === 'teacher' ? UserRole.TEACHER : UserRole.STUDENT,
        profileImageUrl: siteInfo.userpictureurl,
      });

      // Step 5: Generate JWT token
      const token = jwtService.generateToken(user, moodleToken);

      // Step 6: Update last login
      await this.updateLastLogin(fastify, user.id);

      logger.info(`User ${username} logged in successfully`);

      // Calculate expiration timestamp
      const payload = jwtService.validateToken(token);
      const expiresAt = payload.exp || Math.floor(Date.now() / 1000) + 3600;

      return {
        token,
        expiresAt,
        user,
      };
    } catch (error) {
      if (error instanceof BadRequestError || error instanceof MoodleError) {
        throw error;
      }
      logger.error('Login error:', error);
      throw new UnauthorizedError('Login failed');
    }
  }

  /**
   * Validate JWT token and return user info
   */
  async validateToken(fastify: FastifyInstance, token: string): Promise<User> {
    try {
      // Decode and validate JWT
      const payload = jwtService.validateToken(token);

      // Get user from database
      const user = await this.getUserById(fastify, payload.userId);

      if (!user) {
        throw new UnauthorizedError('User not found');
      }

      return user;
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('Token validation error:', error);
      throw new UnauthorizedError('Token validation failed');
    }
  }

  /**
   * Refresh JWT token
   */
  async refreshToken(_fastify: FastifyInstance, token: string): Promise<string> {
    try {
      // Validate old token
      const oldPayload = jwtService.validateToken(token);

      // Decrypt Moodle token
      const moodleToken = jwtService.decryptMoodleToken(oldPayload.moodleToken || '');

      // Validate Moodle token is still valid
      await moodleService.validateToken(moodleToken);

      // Generate new JWT
      const newToken = jwtService.refreshToken(token, moodleToken);

      logger.info(`Token refreshed for user ${oldPayload.username}`);
      return newToken;
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('Token refresh error:', error);
      throw new UnauthorizedError('Token refresh failed');
    }
  }

  /**
   * Logout user (invalidate token if needed)
   * For JWT, logout is handled client-side by removing the token
   */
  async logout(_fastify: FastifyInstance, userId: number): Promise<void> {
    // In a stateless JWT system, logout is typically handled client-side
    // If you need server-side logout, consider:
    // 1. Token blacklist in Redis
    // 2. Token versioning in user table
    // 3. Short token expiration with refresh tokens

    logger.info(`User ${userId} logged out`);

    // For now, we'll just log the logout
    // In production, you might want to:
    // - Add token to blacklist
    // - Update user's token version
    // - Log to audit table
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Get user from database by ID
   */
  private async getUserById(fastify: FastifyInstance, userId: number): Promise<User | null> {
    const result = await fastify.pg.query(
      `SELECT
        id,
        moodle_user_id as "moodleUserId",
        username,
        email,
        first_name as "firstName",
        last_name as "lastName",
        role,
        profile_image_url as "profileImageUrl",
        created_at as "createdAt",
        updated_at as "updatedAt",
        last_login_at as "lastLoginAt"
      FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0] as User;
  }

  /**
   * Get or create user in database
   */
  private async getOrCreateUser(
    fastify: FastifyInstance,
    userData: Partial<User>
  ): Promise<User> {
    // Try to get existing user by Moodle user ID
    const existing = await fastify.pg.query(
      'SELECT * FROM users WHERE moodle_user_id = $1',
      [userData.moodleUserId]
    );

    if (existing.rows.length > 0) {
      const existingUser = existing.rows[0] as User;
      const requestedRole = userData.role || UserRole.STUDENT;
      const resolvedRole =
        existingUser.role === UserRole.TEACHER || requestedRole === UserRole.TEACHER
          ? UserRole.TEACHER
          : UserRole.STUDENT;

      // Update existing user
      const result = await fastify.pg.query(
        `UPDATE users SET
          username = $1,
          email = $2,
          first_name = $3,
          last_name = $4,
          role = $5,
          profile_image_url = $6,
          updated_at = NOW()
        WHERE id = $7
        RETURNING *`,
        [
          userData.username,
          userData.email,
          userData.firstName,
          userData.lastName,
          resolvedRole,
          userData.profileImageUrl,
          existingUser.id,
        ]
      );

      return result.rows[0] as User;
    }

    // Create new user
    const result = await fastify.pg.query(
      `INSERT INTO users (
        moodle_user_id,
        username,
        email,
        first_name,
        last_name,
        role,
        profile_image_url
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        userData.moodleUserId,
        userData.username,
        userData.email,
        userData.firstName,
        userData.lastName,
        userData.role,
        userData.profileImageUrl,
      ]
    );

    logger.info(`Created new user: ${userData.username} (${userData.role})`);
    return result.rows[0] as User;
  }

  /**
   * Update user's last login timestamp
   */
  private async updateLastLogin(fastify: FastifyInstance, userId: number): Promise<void> {
    await fastify.pg.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [userId]
    );
  }
}

// Export singleton instance
export default new AuthService();
