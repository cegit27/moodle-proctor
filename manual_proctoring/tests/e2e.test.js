import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { spawn } from 'child_process';

let serverProcess;

test.beforeAll(async () => {
  // Start the backend server
  serverProcess = spawn('node', ['backend/server.js'], { cwd: __dirname + '/../' });
  // Wait a bit for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));
});

test.afterAll(async () => {
  // Kill the server
  if (serverProcess) {
    serverProcess.kill();
  }
});

test('complete proctoring workflow', async () => {
  const electronApp = await electron.launch({ args: ['.'] });

  const window = await electronApp.firstWindow();

  // Login page
  await expect(window.locator('h2')).toHaveText('Student Login');
  await window.fill('#email', 'asif@gmail.com');
  await window.fill('#password', '1234');
  await window.click('button');

  // Dashboard
  await expect(window.locator('h2')).toHaveText('Student Dashboard');
  await expect(window.locator('span[id="studentName"]')).toHaveText('Asif');
  await expect(window.locator('span[id="examName"]')).toHaveText('IoT Final Exam');
  // Fast-forward the exam timer for test speed
  await window.route('**/exam', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ timer: 1, questionPaper: 'question-paper.pdf' }),
    });
  });

  await window.click('.start-btn');

  // Exam page
  await expect(window.locator('.top-bar div:first-child')).toHaveText('Exam in Progress');
  await expect(window.locator('#timer')).toBeVisible();
  await expect(window.locator('#questionFrame')).toBeVisible();
  await expect(window.locator('#video')).toBeVisible();

  // Wait for the completion screen (timer will expire quickly)
  await expect(window.locator('h1')).toHaveText('Exam Completed', { timeout: 10000 });

  await electronApp.close();
});