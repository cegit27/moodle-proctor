// ============================================================================
// Moodle Integration Service
// Handles authentication and user sync with Moodle LMS
// ============================================================================

import axios from 'axios';
import config from '../../config';
import logger from '../../config/logger';
import { MoodleError } from '../../utils/errors';

// ============================================================================
// Types
// ============================================================================

interface MoodleTokenResponse {
  token: string;
}

interface MoodleTokenErrorResponse {
  error: string;
  errorcode?: string;
  stacktrace?: string;
  debuginfo?: string;
}

interface MoodleSiteInfo {
  userid: number;
  username: string;
  firstname?: string;
  lastname?: string;
  fullname?: string;
  email?: string;
  lang?: string;
  userpictureurl?: string;
  siteurl: string;
  sitename: string;
  functions?: Array<{ name?: string }>;
}

interface MoodleUser {
  id: number;
  username: string;
  email: string;
  firstname?: string;
  lastname?: string;
  fullname?: string;
  userpictureurl?: string;
}

interface MoodleCourseSummary {
  id: number;
}

interface MoodleCourseUserProfile {
  roles?: Array<{
    shortname?: string;
    shortName?: string;
    name?: string;
  }>;
}

const TEACHER_ROLE_HINTS = [
  'manager',
  'editingteacher',
  'teacher',
  'coursecreator',
  'instructor',
  'faculty'
];

export function inferMoodleRoleFromIdentity(identity: {
  username?: string;
  email?: string;
}): 'student' | 'teacher' {
  const normalizedUsername = identity.username?.trim().toLowerCase() || '';
  const normalizedEmail = identity.email?.trim().toLowerCase() || '';
  const emailLocalPart = normalizedEmail.split('@')[0] || '';

  const hasTeacherHint = (value: string) =>
    TEACHER_ROLE_HINTS.some(hint => value === hint || value.includes(hint));

  return hasTeacherHint(normalizedUsername) || hasTeacherHint(emailLocalPart)
    ? 'teacher'
    : 'student';
}

// ============================================================================
// Moodle Service
// ============================================================================

class MoodleService {
  private baseUrl: string;
  private serviceShortname: string;

  constructor() {
    this.baseUrl = config.moodle.baseUrl;
    this.serviceShortname = config.moodle.serviceShortname;
  }

  private async callWebService<T>(
    token: string,
    functionName: string,
    params: Record<string, string | number | boolean | Array<string | number>> = {}
  ): Promise<T> {
    const resolvedParams = new URLSearchParams({
      wstoken: token,
      wsfunction: functionName,
      moodlewsrestformat: 'json'
    });

    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        value.forEach((entry, index) => {
          resolvedParams.append(`${key}[${index}]`, String(entry));
        });
      } else {
        resolvedParams.append(key, String(value));
      }
    }

    const response = await axios.get<T | { exception: string; message?: string; errorcode?: string }>(
      `${this.baseUrl}/webservice/rest/server.php`,
      { params: resolvedParams }
    );

    if (response.status !== 200) {
      throw new MoodleError(`Moodle REST server failed (${response.status})`);
    }

    const data = response.data;
    if (typeof data === 'object' && data && 'exception' in data) {
      const msg = typeof data.message === 'string' ? data.message : 'Moodle exception';
      const code = data.errorcode ? ` (${data.errorcode})` : '';
      throw new MoodleError(`${msg}${code}`);
    }

    return data as T;
  }

  /**
   * Authenticate with Moodle and get token
   */
  async authenticate(username: string, password: string): Promise<string> {
    try {
      logger.info(`Authenticating user ${username} with Moodle`);

      const params = new URLSearchParams({
        username,
        password,
        service: this.serviceShortname,
      });

      const response = await axios.post<MoodleTokenResponse | MoodleTokenErrorResponse>(
        `${this.baseUrl}/login/token.php`,
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
        }
      );

      if (response.status !== 200) {
        throw new MoodleError(`Moodle token endpoint failed (${response.status})`);
      }

      const data = response.data as MoodleTokenResponse | MoodleTokenErrorResponse;

      // Check if token is present
      if ('token' in data && typeof data.token === 'string' && data.token.length > 0) {
        logger.info(`User ${username} authenticated successfully with Moodle`);
        return data.token;
      }

      // Check if error is present
      if ('error' in data && typeof data.error === 'string') {
        const code = data.errorcode ? ` (${data.errorcode})` : '';
        throw new MoodleError(`${data.error}${code}`);
      }

      throw new MoodleError('Unexpected Moodle response from token endpoint');
    } catch (error) {
      if (error instanceof MoodleError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        throw new MoodleError(
          `Failed to connect to Moodle: ${error.message}`,
          503
        );
      }

      logger.error('Moodle authentication error:', error);
      throw new MoodleError('Authentication failed');
    }
  }

  /**
   * Validate token and get site info
   */
  async validateToken(token: string): Promise<MoodleSiteInfo> {
    try {
      const data = await this.callWebService<MoodleSiteInfo>(token, 'core_webservice_get_site_info');

      if ('userid' in data && typeof data.userid === 'number') {
        return data;
      }

      throw new MoodleError('Unexpected Moodle response from site info');
    } catch (error) {
      if (error instanceof MoodleError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        throw new MoodleError(
          `Failed to validate token with Moodle: ${error.message}`,
          503
        );
      }

      logger.error('Moodle token validation error:', error);
      throw new MoodleError('Token validation failed');
    }
  }

  /**
   * Sync user from Moodle to database
   * Returns user role (student or teacher)
   */
  async syncUser(moodleToken: string, siteInfo: MoodleSiteInfo): Promise<{
    userId: number;
    role: 'student' | 'teacher';
  }> {
    const role = await this.resolveUserRole(moodleToken, siteInfo);

    if (role === 'teacher') {
      logger.info(`Resolved Moodle user ${siteInfo.username || siteInfo.email} as teacher`);
    }

    return {
      userId: siteInfo.userid,
      role,
    };
  }

  /**
   * Get Moodle user info from token
   */
  async getUserInfo(token: string): Promise<MoodleUser> {
    const siteInfo = await this.validateToken(token);

    return {
      id: siteInfo.userid,
      username: siteInfo.username,
      email: this.getResolvedEmail(siteInfo),
      firstname: siteInfo.firstname,
      lastname: siteInfo.lastname,
      fullname: `${siteInfo.firstname || ''} ${siteInfo.lastname || ''}`.trim(),
      userpictureurl: siteInfo.userpictureurl,
    };
  }

  async resolveUserRole(
    token: string,
    siteInfo: Pick<MoodleSiteInfo, 'userid' | 'username' | 'email'>
  ): Promise<'student' | 'teacher'> {
    try {
      const directRoles = await this.callWebService<Array<{
        shortname?: string;
        shortName?: string;
        name?: string;
      }>>(
        token,
        'core_role_get_user_roles',
        { userid: siteInfo.userid }
      ).catch(() => []);

      const normalizedDirectRoles = directRoles.flatMap(role => [
        role.shortname,
        role.shortName,
        role.name
      ])
        .filter((value): value is string => Boolean(value))
        .map(value => value.toLowerCase());

      if (normalizedDirectRoles.some(role => TEACHER_ROLE_HINTS.includes(role))) {
        return 'teacher';
      }

      const courses = await this.callWebService<MoodleCourseSummary[]>(
        token,
        'core_enrol_get_users_courses',
        { userid: siteInfo.userid }
      ).catch(() => []);

      for (const course of courses) {
        const profiles = await this.callWebService<MoodleCourseUserProfile[]>(
          token,
          'core_user_get_course_user_profiles',
          {
            'userlist[0][userid]': siteInfo.userid,
            'userlist[0][courseid]': course.id
          }
        ).catch(() => []);

        const normalizedRoles = profiles
          .flatMap(profile => profile.roles || [])
          .flatMap(role => [role.shortname, role.shortName, role.name])
          .filter((value): value is string => Boolean(value))
          .map(value => value.toLowerCase());

        if (normalizedRoles.some(role => TEACHER_ROLE_HINTS.includes(role))) {
          return 'teacher';
        }
      }
    } catch (error) {
      logger.warn('Failed to resolve Moodle role from web services, using fallback role resolution', {
        userId: siteInfo.userid,
        error: (error as Error).message
      });
    }

    return inferMoodleRoleFromIdentity(siteInfo);
  }

  getResolvedEmail(siteInfo: Pick<MoodleSiteInfo, 'email' | 'userid' | 'username'>): string {
    const normalizedEmail = siteInfo.email?.trim();

    if (normalizedEmail) {
      return normalizedEmail.toLowerCase();
    }

    const safeUsername =
      siteInfo.username?.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-') ||
      `moodle-user-${siteInfo.userid}`;

    return `${safeUsername}-${siteInfo.userid}@placeholder.local`;
  }
}

// Export singleton instance
export default new MoodleService();
