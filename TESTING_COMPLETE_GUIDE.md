# Complete Testing & CI/CD Setup Guide

## 📋 Project Overview

This document provides a comprehensive guide to the automated testing and CI/CD setup for the **Online Proctoring System** - a complete exam proctoring platform with:

- **Backend**: Fastify + TypeScript + PostgreSQL
- **Frontend**: Next.js 14 + React 18
- **AI Proctoring**: FastAPI + Python 3.11+
- **Desktop Client**: Electron
- **CI/CD**: GitHub Actions with Docker

---

## 🏗️ Project Structure

```
moodle-proctor/
├── tests/
│   ├── unit/
│   │   ├── auth.service.test.ts
│   │   ├── exam.service.test.ts
│   │   ├── student.service.test.ts
│   │   ├── violation.service.test.ts
│   │   ├── utils.test.ts
│   │   └── ai_proctoring/
│   │       ├── test_face_monitor.py
│   │       ├── test_phone_detection.py
│   │       └── test_gaze_tracking.py
│   ├── integration/
│   │   ├── auth.integration.test.ts
│   │   ├── exam.integration.test.ts
│   │   └── violation.integration.test.ts
│   ├── e2e/
│   │   └── exam-flow.e2e.test.ts
│   ├── setup.ts
│   ├── jest.config.js
│   ├── playwright.config.ts
│   └── pytest.ini
├── .github/
│   └── workflows/
│       └── test-and-deploy.yml
├── .env.example
└── [backend/, frontend/, ai_proctoring/]
```

---

## 🧪 Test Layers

### 1. Unit Tests

**Purpose**: Test individual functions, services, and components in isolation

**Coverage**:
- **Backend**: Auth, Exam, Student, Violation services
- **Frontend**: Components, hooks, utilities
- **AI**: Face detection, phone detection, gaze tracking

**Run Unit Tests**:
```bash
# Backend
cd backend
npm run test

# Frontend
cd frontend
npm run test

# Python AI
cd ai_proctoring
pytest tests/unit -v --cov
```

### 2. Integration Tests

**Purpose**: Test interactions between services and API endpoints

**Coverage**:
- Auth flow (login → token → validation)
- Exam lifecycle (create → start → submit)
- Violation reporting and tracking
- Database interactions

**Run Integration Tests**:
```bash
# Backend Integration Tests
cd backend
npm run test:integration

# Python Integration Tests
cd ai_proctoring
pytest tests/integration -v
```

### 3. End-to-End (E2E) Tests

**Purpose**: Test complete user journeys through the application

**Coverage**:
- Student exam flow (login → exams → start → answer → submit)
- Proctoring activation and monitoring
- Teacher dashboard features
- Real-time violation detection

**Run E2E Tests**:
```bash
# Requires running backend and frontend
npm run test:e2e

# Specific test file
npx playwright test tests/e2e/exam-flow.e2e.test.ts
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- **PostgreSQL** 15
- **Docker** and Docker Compose (for services)
- **Git** (for version control)

### Installation

1. **Clone and Setup**:
```bash
cd moodle-proctor
cp .env.example .env.test
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
cd ai_proctoring && pip install -r requirements.txt && cd ..
```

2. **Database Setup**:
```bash
# Create test database
psql -U postgres -c "CREATE DATABASE moodle_proctor_test;"

# Run migrations
cd backend
npm run migrate:test
```

3. **Start Services** (for integration/E2E tests):
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: AI Proctoring
cd ai_proctoring
python main.py

# Terminal 4: Moodle (using Docker)
docker-compose up moodle
```

---

## 📊 Test Coverage Goals

| Component | Target | Metric |
|-----------|--------|--------|
| Backend   | 80%+   | Lines & Branches |
| Frontend  | 75%+   | Lines & Branches |
| Python AI | 70%+   | Lines coverage |
| Overall   | 75%+   | Avg coverage |

---

## ⚙️ Configuration Files

### .env.example

```bash
# copy to .env for local development
# copy to .env.test for testing
```

**Key Settings**:
- Database connection
- Authentication secrets  
- API endpoints (backend, AI service)
- CORS configuration
- Feature flags

### jest.config.js (Backend)

- Test environment: Node.js
- Test match patterns: `**/*.test.ts`
- Coverage threshold: 75%
- Timeout: 10 seconds

### playwright.config.ts (E2E)

- Browsers: Chromium, Firefox, WebKit
- Base URL: `http://localhost:3000`
- Screenshots/Videos: On failure
- Reporters: HTML, JUnit, JSON

### pytest.ini (Python)

- Test paths: `tests/`
- Coverage: HTML + LCOV reports
- Markers: `@pytest.mark.unit`, `@pytest.mark.integration`

---

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

The pipeline (`test-and-deploy.yml`) runs on every push and pull request:

#### Step 1: Setup (Parallel)
- Install Node.js 18
- Install Python 3.11+
- Install all dependencies
- Cache dependencies

#### Step 2: Backend Tests
- Lint with ESLint
- Build TypeScript
- Run unit tests
- Run integration tests
- Generate coverage reports

#### Step 3: Frontend Tests
- Lint with ESLint
- Build Next.js
- Run component tests
- Generate coverage reports

#### Step 4: AI Tests (Python)
- Lint with Flake8
- Type check with Mypy
- Run unit tests
- Generate coverage reports

#### Step 5: E2E Tests
- Build all services
- Start backend + frontend
- Run Playwright tests
- Capture screenshots/videos on failure

#### Step 6: Security Scanning
- Trivy vulnerability scanner
- npm audit (dependencies)
- Safety check (Python)

#### Step 7: Code Quality
- SonarQube analysis
- Code coverage metrics

#### Step 8: Build Docker Images
- Backend service
- Frontend service
- AI service
- Push to container registry

#### Step 9: Deploy (optional)
- Deploy to production
- Run post-deployment tests

---

## 📝 Running Tests Locally

### Quick Start

```bash
# Run all tests
npm run test:all

# Run specific layer
npm run test:unit
npm run test:integration
npm run test:e2e

# Watch mode (development)
npm run test:watch
```

### Detailed Commands

#### Backend

```bash
# All tests with coverage
cd backend
npm run test -- --coverage

# Only unit tests
npm run test -- tests/unit

# Only integration tests
npm run test -- tests/integration

# Watch mode
npm run test:watch

# Specific test file
npm run test -- auth.service.test.ts

# Update snapshots
npm run test -- -u
```

#### Frontend

```bash
cd frontend
npm run test

# Coverage report
npm run test -- --coverage

# Watch mode
npm run test -- --watch

# Update snapshots
npm run test -- -u
```

#### Python AI

```bash
cd ai_proctoring

# All tests
pytest tests/ -v

# Unit tests only
pytest tests/unit -v

# Integration tests only
pytest tests/integration -v

# Specific test file
pytest tests/unit/test_face_monitor.py -v

# With coverage
pytest tests/ --cov --cov-report=html

# Show coverage
pytest tests/ --cov --cov-report=term-missing
```

#### E2E Tests

```bash
# All browsers
npx playwright test

# Specific browser
npx playwright test --project=chromium

# Watch mode (UI)
npx playwright test --ui

# Debug mode
npx playwright test --debug

# Specific test file
npx playwright test tests/e2e/exam-flow.e2e.test.ts

# Record (for updating tests)
npx playwright codegen http://localhost:3000
```

---

## 🔍 Test Examples

### Unit Test Example

```typescript
describe('AuthService', () => {
  it('should login user successfully', async () => {
    const result = await authService.login(mockFastify, {
      username: 'testuser',
      password: 'password123'
    });
    
    expect(result).toHaveProperty('token');
    expect(result.token).toBeValidJWT();
  });
});
```

### Integration Test Example

```typescript
describe('POST /api/auth/login', () => {
  it('should return JWT token after login', async () => {
    const response = await request(app.server)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'password123' })
      .expect(200);
    
    expect(response.body).toHaveProperty('token');
  });
});
```

### E2E Test Example

```typescript
test('should complete exam flow', async ({ page }) => {
  await page.fill('[data-testid="username"]', 'student1');
  await page.fill('[data-testid="password"]', 'password123');
  await page.click('[data-testid="login-button"]');
  
  await page.waitForURL('**/dashboard');
  expect(await page.textContent('h1')).toContain('Dashboard');
});
```

### Python Test Example

```python
def test_face_detection():
    monitor = FaceMonitor(logger)
    frame = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)
    
    result = monitor.process_frame(frame)
    assert result['faces'] >= 0
    assert 'violations' in result
```

---

## 📊 Coverage Reports

### View Coverage Reports

```bash
# Backend
open backend/coverage/index.html

# Frontend
open frontend/coverage/index.html

# Python
open ai_proctoring/htmlcov/index.html
```

### Generate Coverage Badge

```bash
# Add to README.md
![Coverage Badge](https://img.shields.io/badge/coverage-75%25-brightgreen)
```

---

## 🐛 Debugging

### Backend Debugging

```bash
# Debug mode
cd backend
node --inspect-brk node_modules/.bin/jest --runInBand

# Visual Studio Code launch config
{
  "type": "node",
  "request": "launch",
  "program": "${workspaceFolder}/backend/src/index.ts",
  "preLaunchTask": "npm: dev"
}
```

### E2E Debugging

```bash
# Step through tests
npx playwright test --debug

# Generate trace for inspection
npx playwright test --trace=on

# Open trace viewer
npx playwright show-trace trace.zip
```

---

## ⚠️ Common Issues & Solutions

### Issue: Tests timeout
**Solution**:
```bash
# Increase timeout
jest.setTimeout(30000);
# or in jest.config.js: testTimeout: 30000
```

### Issue: Database connection error
**Solution**:
```bash
# Verify PostgreSQL is running
psql -U postgres -c "SELECT 1"

# Check environment variables
echo $DATABASE_URL
```

### Issue: Port already in use
**Solution**:
```bash
# Find process using port
lsof -i :5000

# Kill process
kill -9 <PID>
```

### Issue: E2E tests failing on CI
**Solution**:
```yaml
# Add to workflow
- name: Wait for services
  run: |
    npx wait-on http://localhost:3000 --timeout 60000
```

---

## 🔐 Security Testing

### OWASP Testing

Tests include validation for:
- SQL Injection prevention
- XSS protection
- CSRF token handling
- Authentication bypass attempts
- Authorization enforcement

### Dependency Auditing

```bash
# Backend
npm audit --audit-level=moderate

# Frontend
npm audit --audit-level=moderate

# Python
safety check
```

---

## 📈 Performance Testing

### Test Latency Targets

- API response: < 200ms (95th percentile)
- Page load: < 3s (frontend)
- WebSocket connection: < 500ms
- Frame processing: < 33ms (~30 FPS)

### Load Testing (Optional)

```bash
# Install k6
brew install k6

# Run load test
k6 run loadtest.js
```

---

## 📚 Best Practices

### ✅ Do's

- ✓ Write tests for critical paths
- ✓ Use descriptive test names
- ✓ Mock external dependencies
- ✓ Test error cases
- ✓ Maintain test data fixtures
- ✓ Run tests before commit
- ✓ Keep tests fast and isolated
- ✓ Use coverage reports

### ❌ Don'ts

- ✗ Test implementation details
- ✗ Use hardcoded timeouts
- ✗ Create test interdependencies
- ✗ Ignore test failures
- ✗ Skip security tests
- ✗ Leave console.log in production code
- ✗ Test without isolation
- ✗ Ignore coverage gaps

---

## 🚢 Deployment

### Pre-deployment Checklist

- [ ] All tests pass locally
- [ ] Coverage above threshold
- [ ] No security vulnerabilities
- [ ] Code reviewed
- [ ] CI pipeline green
- [ ] Docker images built
- [ ] Database migrations tested
- [ ] Rollback plan documented

### Deployment Steps

```bash
# Merge to main branch
git merge feature-branch

# CI/CD pipeline automatically:
# 1. Runs all tests
# 2. Builds Docker images
# 3. Pushes to registry
# 4. Deploys to production
# 5. Runs smoke tests
```

---

## 📞 Support & Documentation

### Links

- [Jest Documentation](https://jestjs.io/)
- [Playwright Documentation](https://playwright.dev/)
- [Pytest Documentation](https://docs.pytest.org/)
- [GitHub Actions](https://github.com/features/actions)
- [Fastify Documentation](https://www.fastify.io/)
- [Next.js Documentation](https://nextjs.org/docs)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)

### Troubleshooting

For issues or questions:
1. Check test logs
2. Run locally to reproduce
3. Check similar test cases
4. Consult documentation
5. Open GitHub issue if needed

---

## 📝 License

This testing suite is part of the Moodle-Proctor system and follows the same license.

---

**Last Updated**: 2024-01-15  
**Version**: 1.0.0  
**Maintainers**: Development Team
