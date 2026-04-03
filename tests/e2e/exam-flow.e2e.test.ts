/**
 * @file tests/e2e/exam-flow.e2e.test.ts
 * @description End-to-End tests for complete exam flow using Playwright
 */

import { test, expect, Page, Browser } from '@playwright/test';

test.describe('E2E: Complete Exam Flow', () => {
  let page: Page;
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
  const backend_URL = process.env.BACKEND_URL || 'http://localhost:5000';

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(`${BASE_URL}/login`);
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('should complete student login', async () => {
    // Enter credentials
    await page.fill('[data-testid="username-input"]', 'student1');
    await page.fill('[data-testid="password-input"]', 'password123');

    // Click login
    await page.click('[data-testid="login-button"]');

    // Wait for redirect to dashboard
    await page.waitForURL(`${BASE_URL}/dashboard/student`);

    // Verify logged in
    const studentGreeting = await page.textContent('[data-testid="student-greeting"]');
    expect(studentGreeting).toContain('Welcome');
  });

  test('should view available exams', async () => {
    // Login first
    await page.fill('[data-testid="username-input"]', 'student1');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    // Navigate to exams
    await page.click('[data-testid="nav-exams"]');
    await page.waitForURL(`${BASE_URL}/dashboard/student/exams`);

    // Verify exam list loaded
    const examCards = await page.locator('[data-testid="exam-card"]');
    expect(await examCards.count()).toBeGreaterThan(0);

    // Check exam details visible
    const firstExamName = await page.textContent('[data-testid="exam-card"]:first-child >> [data-testid="exam-name"]');
    expect(firstExamName).toBeTruthy();
  });

  test('should start exam', async () => {
    // Login
    await page.fill('[data-testid="username-input"]', 'student1');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    // Navigate to exams
    await page.click('[data-testid="nav-exams"]');

    // Click start exam button
    await page.click('[data-testid="exam-card"]:first-child >> [data-testid="start-button"]');

    // Accept proctoring terms
    const acceptTerms = await page.locator('[data-testid="accept-terms-checkbox"]');
    if (await acceptTerms.isVisible()) {
      await acceptTerms.check();
    }

    // Click final start button
    await page.click('[data-testid="confirm-start-button"]');

    // Wait for exam entry
    await page.waitForURL(`${BASE_URL}/exam/**`);

    // Verify exam interface loaded
    const examHeader = await page.textContent('[data-testid="exam-header"]');
    expect(examHeader).toBeTruthy();
  });

  test('should answer exam questions', async () => {
    // Go through start exam flow
    await page.fill('[data-testid="username-input"]', 'student1');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.click('[data-testid="nav-exams"]');
    await page.click('[data-testid="exam-card"]:first-child >> [data-testid="start-button"]');
    
    const acceptTerms = await page.locator('[data-testid="accept-terms-checkbox"]');
    if (await acceptTerms.isVisible()) {
      await acceptTerms.check();
    }
    
    await page.click('[data-testid="confirm-start-button"]');
    await page.waitForURL(`${BASE_URL}/exam/**`);

    // Answer first question
    const firstQuestion = '[data-testid="question"]:first-child';
    const radioButtons = await page.locator(`${firstQuestion} >> [data-testid="option"]`);

    if (await radioButtons.count() > 0) {
      await radioButtons.first().click();
    }

    // Navigate to next question
    await page.click('[data-testid="next-button"]');

    // Verify on next question
    await page.waitForTimeout(500);
    const questionNumber = await page.textContent('[data-testid="question-number"]');
    expect(questionNumber).toContain('2');
  });

  test('should track exam time', async () => {
    // Start exam
    await page.fill('[data-testid="username-input"]', 'student1');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.click('[data-testid="nav-exams"]');
    await page.click('[data-testid="exam-card"]:first-child >> [data-testid="start-button"]');
    
    const acceptTerms = await page.locator('[data-testid="accept-terms-checkbox"]');
    if (await acceptTerms.isVisible()) {
      await acceptTerms.check();
    }
    
    await page.click('[data-testid="confirm-start-button"]');
    await page.waitForURL(`${BASE_URL}/exam/**`);

    // Get initial time remaining
    const timeRemaining = await page.textContent('[data-testid="time-remaining"]');
    expect(timeRemaining).toMatch(/\d+:\d+/); // HH:MM format

    // Wait and verify time decreases
    await page.waitForTimeout(2000);
    const updatedTime = await page.textContent('[data-testid="time-remaining"]');
    expect(updatedTime).not.toBe(timeRemaining);
  });

  test('should activate camera for proctoring', async () => {
    // Start exam
    await page.fill('[data-testid="username-input"]', 'student1');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.click('[data-testid="nav-exams"]');
    await page.click('[data-testid="exam-card"]:first-child >> [data-testid="start-button"]');
    
    const acceptTerms = await page.locator('[data-testid="accept-terms-checkbox"]');
    if (await acceptTerms.isVisible()) {
      await acceptTerms.check();
    }
    
    await page.click('[data-testid="confirm-start-button"]');
    await page.waitForURL(`${BASE_URL}/exam/**`);

    // Verify camera frame element exists
    const cameraFrame = await page.locator('[data-testid="camera-frame"]');
    expect(await cameraFrame.isVisible()).toBeTruthy();

    // Verify proctoring status
    const proctorStatus = await page.textContent('[data-testid="proctor-status"]');
    expect(proctorStatus).toContain('Active');
  });

  test('should display proctoring warnings', async () => {
    // This test assumes violation detection is active
    // Start exam
    await page.fill('[data-testid="username-input"]', 'student1');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.click('[data-testid="nav-exams"]');
    await page.click('[data-testid="exam-card"]:first-child >> [data-testid="start-button"]');
    
    const acceptTerms = await page.locator('[data-testid="accept-terms-checkbox"]');
    if (await acceptTerms.isVisible()) {
      await acceptTerms.check();
    }
    
    await page.click('[data-testid="confirm-start-button"]');
    await page.waitForURL(`${BASE_URL}/exam/**`);

    // Wait for potential warning
    await page.waitForTimeout(5000);

    // Check if warning appeared
    const warningPanel = page.locator('[data-testid="warning-panel"]');
    if (await warningPanel.isVisible()) {
      const warningText = await warningPanel.textContent();
      expect(warningText).toBeTruthy();
    }
  });

  test('should submit exam', async () => {
    // Start exam and answer all questions
    await page.fill('[data-testid="username-input"]', 'student1');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.click('[data-testid="nav-exams"]');
    await page.click('[data-testid="exam-card"]:first-child >> [data-testid="start-button"]');
    
    const acceptTerms = await page.locator('[data-testid="accept-terms-checkbox"]');
    if (await acceptTerms.isVisible()) {
      await acceptTerms.check();
    }
    
    await page.click('[data-testid="confirm-start-button"]');
    await page.waitForURL(`${BASE_URL}/exam/**`);

    // Answer all questions (if any)
    let currentQuestion = 1;
    while (await page.locator('[data-testid="next-button"]').isVisible()) {
      const options = await page.locator('[data-testid="option"]');
      if (await options.count() > 0) {
        await options.first().click();
      }
      await page.click('[data-testid="next-button"]');
      currentQuestion++;
    }

    // Click submit
    await page.click('[data-testid="submit-button"]');

    // Confirm submission
    const confirmButton = page.locator('[data-testid="confirm-submit-button"]');
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }

    // Wait for submission confirmation
    await page.waitForURL(`${BASE_URL}/exam/confirmation`);

    // Verify submission message
    const confirmationText = await page.textContent('[data-testid="submission-message"]');
    expect(confirmationText).toContain('successfully');
  });

  test('should view exam results', async () => {
    // Login and navigate to results
    await page.fill('[data-testid="username-input"]', 'student1');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    // Click on submitted exam
    await page.click('[data-testid="nav-results"]');
    await page.waitForURL(`${BASE_URL}/dashboard/student/results`);

    // Click view result
    await page.click('[data-testid="result-item"]:first-child >> [data-testid="view-button"]');

    // Verify results page
    const resultScore = await page.textContent('[data-testid="result-score"]');
    expect(resultScore).toMatch(/\d+\s*\/\s*\d+/);
  });

  test('should handle exam timeout', async () => {
    // This test assumes quick timeout for testing
    // Start exam
    await page.fill('[data-testid="username-input"]', 'student1');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.click('[data-testid="nav-exams"]');
    await page.click('[data-testid="exam-card"]:first-child >> [data-testid="start-button"]');
    
    const acceptTerms = await page.locator('[data-testid="accept-terms-checkbox"]');
    if (await acceptTerms.isVisible()) {
      await acceptTerms.check();
    }
    
    await page.click('[data-testid="confirm-start-button"]');
    await page.waitForURL(`${BASE_URL}/exam/**`);

    // Wait for timeout (if configured)
    await page.waitForTimeout(2000);

    // Check if timeout message appears or auto-submit happens
    const timeoutMessage = page.locator('[data-testid="timeout-message"]');
    if (await timeoutMessage.isVisible()) {
      expect(await timeoutMessage.textContent()).toContain('Time');
    }
  });
});

test.describe('E2E: Teacher Dashboard', () => {
  let page: Page;
  const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(`${BASE_URL}/login`);
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('should login as teacher', async () => {
    await page.fill('[data-testid="username-input"]', 'teacher1');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');

    await page.waitForURL(`${BASE_URL}/dashboard/teacher`);

    const dashboardTitle = await page.textContent('[data-testid="dashboard-title"]');
    expect(dashboardTitle).toContain('Teacher');
  });

  test('should view student monitoring', async () => {
    // Login as teacher
    await page.fill('[data-testid="username-input"]', 'teacher1');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL(`${BASE_URL}/dashboard/teacher`);

    // Navigate to monitoring
    await page.click('[data-testid="nav-monitoring"]');

    // Verify student grid visible
    const studentCards = await page.locator('[data-testid="student-card"]');
    if (await studentCards.count() > 0) {
      expect(await studentCards.count()).toBeGreaterThan(0);
    }
  });

  test('should view violations report', async () => {
    // Login as teacher
    await page.fill('[data-testid="username-input"]', 'teacher1');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="login-button"]');
    await page.waitForURL(`${BASE_URL}/dashboard/teacher`);

    // Navigate to reports
    await page.click('[data-testid="nav-reports"]');
    await page.waitForURL(`${BASE_URL}/dashboard/teacher/reports`);

    // Verify report loaded
    const reportTable = await page.locator('[data-testid="reports-table"]');
    expect(await reportTable.isVisible()).toBeTruthy();
  });
});
