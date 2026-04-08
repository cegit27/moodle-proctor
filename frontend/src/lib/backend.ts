// ============================================================================
// Backend API Integration
// Connects frontend to the backend API
// ============================================================================

import { BACKEND_URL } from './config';

// ============================================================================
// Types
// ============================================================================

export interface BackendUser {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'student' | 'teacher';
  profileImageUrl?: string;
}

export interface BackendAuthResponse {
  success: true;
  data: {
    token: string;
    user: BackendUser;
  };
}

export interface TeacherStats {
  overview: {
    totalExams: number;
    totalAttempts: number;
    activeAttempts: number;
    completedAttempts: number;
    terminatedAttempts: number;
  };
  violations: {
    total: number;
    inLast24Hours: number;
    byType: Record<string, number>;
    bySeverity: {
      info: number;
      warning: number;
    };
  };
  students: {
    total: number;
    active: number;
  };
  exams: {
    upcoming: number;
    ongoing: number;
    completed: number;
  };
  timeRange: string;
  generatedAt: string;
}

export interface TeacherAttempt {
  id: number;
  examId: number;
  examName: string;
  courseName: string;
  userId: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  status: 'not_started' | 'in_progress' | 'submitted' | 'terminated';
  startedAt: string | null;
  submittedAt: string | null;
  submissionReason: string | null;
  violationCount: number;
  durationMinutes: number;
  maxWarnings: number;
  ipAddress: string;
  hiddenAt: string | null;
  isHidden: boolean;
}

export interface TeacherStudent {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  profileImageUrl?: string | null;
  lastLoginAt: string | null;
}

export interface TeacherReport {
  attemptId: number;
  examName: string;
  courseName: string;
  studentName: string;
  studentEmail: string;
  status: string;
  startedAt: string | null;
  submittedAt: string | null;
  submissionReason: string | null;
  violationCount: number;
  durationMinutes: number;
  ipAddress: string;
  violations: {
    total: number;
    byType: Record<string, number>;
  };
}

export interface TeacherExam {
  id: number;
  moodleCourseId: number;
  moodleCourseModuleId: number;
  examName: string;
  courseName: string;
  durationMinutes: number;
  maxWarnings: number;
  createdAt: string;
  totalAttempts?: number;
  activeAttempts?: number;
  completedAttempts?: number;
}

export interface ProctoringRoomSummary {
  id: number;
  examId: number;
  roomCode: string;
  examName: string;
  courseName: string;
  studentCount: number;
  capacity: number;
  durationMinutes: number;
  createdAt: string;
  activatedAt: string | null;
}

export interface RoomMonitoringStudent {
  enrollmentId: number;
  roomId: number;
  attemptId: number | null;
  userId: number | null;
  studentName: string;
  studentEmail: string;
  status: 'not_started' | 'in_progress' | 'submitted' | 'terminated';
  startedAt: string | null;
  submittedAt: string | null;
  ipAddress: string | null;
  warningCount: number;
  totalViolationCount: number;
}

export interface CreatedRoomDetails {
  roomId: number;
  roomCode: string;
  inviteLink: string;
  examName: string;
  courseName: string;
}

export interface BackendError {
  success: false;
  error: string;
}

// ============================================================================
// API Client
// ============================================================================

class BackendAPIClient {
  private baseUrl: string;
  private token: string | null = null;
  private tokenRecoveryPromise: Promise<string | null> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  private async ensureToken(): Promise<string | null> {
    if (this.token || typeof window === 'undefined') {
      return this.token;
    }

    const storedToken = window.localStorage.getItem('auth_token');
    if (storedToken) {
      this.token = storedToken;
      return storedToken;
    }

    if (!this.tokenRecoveryPromise) {
      this.tokenRecoveryPromise = fetch('/api/auth/backend-session', {
        credentials: 'include',
      })
        .then(async response => {
          if (!response.ok) {
            return null;
          }

          const data = (await response.json().catch(() => ({}))) as {
            authenticated?: boolean;
            token?: string;
          };

          if (data.authenticated && data.token) {
            this.setToken(data.token);
            return data.token;
          }

          return null;
        })
        .finally(() => {
          this.tokenRecoveryPromise = null;
        });
    }

    return this.tokenRecoveryPromise;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = new Headers(options?.headers);

    await this.ensureToken();

    if (options?.body !== undefined && options?.body !== null) {
      headers.set('Content-Type', 'application/json');
    } else {
      headers.delete('Content-Type');
    }

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = data as BackendError;
      throw new Error(error.error || 'Request failed');
    }

    return data as T;
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================

  async login(username: string, password: string): Promise<BackendAuthResponse> {
    const response = await this.request<BackendAuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });

    // Store token
    if (response.success && response.data.token) {
      this.setToken(response.data.token);
    }

    return response;
  }

  async validateToken(token: string): Promise<BackendAuthResponse> {
    return this.request<BackendAuthResponse>('/api/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  async getCurrentUser(): Promise<BackendAuthResponse> {
    return this.request<BackendAuthResponse>('/api/auth/me');
  }

  // ==========================================================================
  // Exams
  // ==========================================================================

  async getExams(filters?: { examId?: number }) {
    const params = new URLSearchParams();
    if (filters?.examId) params.append('examId', filters.examId.toString());

    const query = params.toString() ? `?${params}` : '';
    return this.request<{ success: true; data: { exams: TeacherExam[]; total: number } }>(
      `/api/teacher/exams${query}`
    );
  }

  async getExam(examId: number) {
    return this.request<{ success: true; data: { exams: TeacherExam[] } }>(
      `/api/teacher/exams/${examId}`
    );
  }

  // ==========================================================================
  // Attempts
  // ==========================================================================

  async getAttempts(query: {
    examId?: number;
    status?: string;
    userId?: number;
    search?: string;
    includeHidden?: boolean;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, value.toString());
    });

    const queryString = params.toString();
    return this.request<{ success: true; data: { attempts: TeacherAttempt[]; total: number } }>(
      `/api/teacher/attempts${queryString ? `?${queryString}` : ''}`
    );
  }

  async getAttemptDetails(attemptId: number) {
    return this.request<{ success: true; data: unknown }>(
      `/api/teacher/attempts/${attemptId}`
    );
  }

  async getAttemptViolations(attemptId: number) {
    return this.request<{ success: true; data: { violations: unknown[]; total: number } }>(
      `/api/teacher/attempts/${attemptId}/violations`
    );
  }

  // ==========================================================================
  // Students
  // ==========================================================================

  async getStudents(query: {
    search?: string;
    examId?: number;
    limit?: number;
    offset?: number;
  }) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, value.toString());
    });

    const queryString = params.toString();
    return this.request<{ success: true; data: { students: TeacherStudent[]; total: number } }>(
      `/api/teacher/students${queryString ? `?${queryString}` : ''}`
    );
  }

  // ==========================================================================
  // Reports
  // ==========================================================================

  async getReports(query: {
    examId?: number;
    userId?: number;
    startDate?: string;
    endDate?: string;
    minViolations?: number;
    limit?: number;
    offset?: number;
  }) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, value.toString());
    });

    const queryString = params.toString();
    return this.request<{ success: true; data: { reports: TeacherReport[]; total: number } }>(
      `/api/teacher/reports${queryString ? `?${queryString}` : ''}`
    );
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  async getStats(query: {
    timeRange?: 'hour' | 'day' | 'week' | 'month' | 'all';
    examId?: number;
  }) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) params.append(key, value.toString());
    });

    const queryString = params.toString();
    return this.request<{ success: true; data: TeacherStats }>(
      `/api/teacher/stats${queryString ? `?${queryString}` : ''}`
    );
  }

  async getActiveRooms() {
    return this.request<{ success: true; data: ProctoringRoomSummary[] }>(
      '/api/room/active'
    );
  }

  async createRoom(examId: number) {
    return this.request<{ success: true; data: CreatedRoomDetails }>('/api/room/create', {
      method: 'POST',
      body: JSON.stringify({ examId }),
    });
  }

  async activateRoom(roomId: number) {
    return this.request<{ success: true; data: { roomId: number; status: string } }>(
      `/api/room/${roomId}/activate`,
      {
        method: 'POST',
      }
    );
  }

  async closeRoom(roomId: number) {
    return this.request<{ success: true; data: { roomId: number; status: string } }>(
      `/api/room/${roomId}/close`,
      {
        method: 'POST',
      }
    );
  }

  async deleteRoom(roomId: number) {
    return this.request<{ success: true; data: { roomId: number; deleted: boolean } }>(
      `/api/room/${roomId}`,
      {
        method: 'DELETE',
      }
    );
  }

  async hideAttempt(attemptId: number) {
    return this.request<{ success: true; data: { attemptId: number; hiddenAt: string; isHidden: boolean } }>(
      `/api/teacher/attempts/${attemptId}/hide`,
      {
        method: 'POST',
      }
    );
  }

  async unhideAttempt(attemptId: number) {
    return this.request<{ success: true; data: { attemptId: number; isHidden: boolean } }>(
      `/api/teacher/attempts/${attemptId}/unhide`,
      {
        method: 'POST',
      }
    );
  }

  async deleteAttempt(attemptId: number) {
    return this.request<{ success: true; data: { attemptId: number; deleted: boolean } }>(
      `/api/teacher/attempts/${attemptId}`,
      {
        method: 'DELETE',
      }
    );
  }

  async getRoomStudents(roomId: number) {
    return this.request<{ success: true; data: RoomMonitoringStudent[] }>(
      `/api/room/${roomId}/students`
    );
  }

  // ==========================================================================
  // Server-Sent Events
  // ==========================================================================

  connectToSSE(filters?: { examId?: number; userId?: number }): EventSource {
    const params = new URLSearchParams();
    if (filters?.examId) params.append('examId', filters.examId.toString());
    if (filters?.userId) params.append('userId', filters.userId.toString());

    const queryString = params.toString();
    const url = `${this.baseUrl}/api/teacher/events${queryString ? `?${queryString}` : ''}`;

    const eventSource = new EventSource(url, {
      withCredentials: true,
    });

    return eventSource;
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const backendAPI = new BackendAPIClient(BACKEND_URL);
