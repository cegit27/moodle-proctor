# Quick Reference: Testing & CI/CD Commands

## 🚀 Quick Start (5 minutes)

```bash
# 1. Setup
chmod +x scripts/setup-tests.sh
./scripts/setup-tests.sh

# 2. Start services
npm run dev:all  # Backend + Frontend + AI in one command

# 3. Run tests
npm run test:all  # All tests
```

---

## 📋 Test Commands

### Run Tests by Layer

```bash
# Unit Tests Only
npm run test:unit

# Integration Tests Only
npm run test:integration

# E2E Tests Only
npm run test:e2e

# All Tests
npm run test:all
```

### Run Specific Tests

```bash
# Backend - Auth tests
cd backend
npm test auth.service.test.ts

# Backend - Exam tests
npm test exam.service.test.ts

# Python - Face detection
cd ai_proctoring
pytest tests/unit/test_face_monitor.py -v

# E2E - Specific scenario
npx playwright test exam-flow --project=chromium
```

### Coverage Reports

```bash
# Generate coverage
npm run test:coverage

# View coverage HTML
open backend/coverage/index.html
open frontend/coverage/index.html
open ai_proctoring/htmlcov/index.html

# Print coverage summary
npm run test:coverage:report
```

---

## 🐛 Debugging

### Debug Backend Tests

```bash
cd backend
npm run test:debug

# Then open chrome://inspect in Chrome
```

### Debug E2E Tests

```bash
# Step-through debugging
npx playwright test --debug

# UI mode
npx playwright test --ui

# Generate trace
npx playwright test --trace=on
npx playwright show-trace trace.zip
```

### Debug Python Tests

```bash
cd ai_proctoring

# Run with breakpoints
pytest tests/unit/test_face_monitor.py --pdb

# Verbose output
pytest tests/unit/test_face_monitor.py -vv -s
```

---

## 📊 Local Development Setup

### Terminal 1: Backend

```bash
cd backend
npm run dev
# Runs on http://localhost:5000
```

### Terminal 2: Frontend

```bash
cd frontend
npm run dev
# Runs on http://localhost:3000
```

### Terminal 3: AI Service

```bash
cd ai_proctoring
python main.py
# Runs on http://localhost:8000
```

### Terminal 4: Database (Docker)

```bash
docker-compose up postgres
# Runs on localhost:5432
```

### Terminal 5: Run Tests

```bash
npm run test:e2e
```

---

## 🔄 CI/CD Pipeline

### View Pipeline Status

```bash
# Check locally before push
npm run lint
npm run type-check
npm run test

# OR run the full pipeline
gh workflow run test-and-deploy.yml

# Check status
gh run list
```

### Trigger Pipeline Manually

```bash
# Via gh CLI
gh workflow run test-and-deploy.yml -r main

# Via GitHub UI
# Settings → Actions → test-and-deploy.yml → Run workflow
```

### View Logs

```bash
# Recent workflow runs
gh run list

# View specific run logs
gh run view <RUN_ID>

# Follow live logs
gh run watch <RUN_ID>
```

---

## ✅ Pre-Commit Checklist

Before committing:

```bash
# 1. Run linter
npm run lint

# 2. Type check
npm run type-check

# 3. Run unit tests
npm run test:unit

# 4. Run integration tests (if modified)
npm run test:integration

# 5. Format code
npm run format

# 6. Check before push
npm run test -- --changedSince=main
```

### Git Hooks (Auto)

```bash
# Install husky (optional)
npm install husky --save-dev
npx husky install

# This will run tests automatically before commit
```

---

## 🔍 Common Tasks

### Run All Tests for a Module

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# Python tests
cd ai_proctoring
pytest tests/ -v
```

### Generate Test Report (HTML)

```bash
# Backend
cd backend
npm test -- --coverage
# Available at: backend/coverage/index.html

# E2E
npx playwright test --reporter=html
# Available at: playwright-report/index.html
```

### Check Coverage Threshold

```bash
npm test -- --coverage --coverageReporters=text-summary
```

### Update Snapshots

```bash
# Backend
cd backend
npm test -- -u

# Frontend
cd frontend
npm test -- -u

# E2E
npx playwright test --update-snapshots
```

---

## 🚢 Pre-Deployment

### Local Verification

```bash
# 1. Pull latest
git pull origin main

# 2. Install dependencies
npm ci

# 3. Run all tests
npm run test:all

# 4. Check coverage
npm run test:coverage

# 5. Run security scan
npm audit --audit-level=moderate

# 6. Build all services
cd backend && npm run build && cd ..
cd frontend && npm run build && cd ..

# 7. Generate Docker images
docker build -t moodle-proctor-backend ./backend
docker build -t moodle-proctor-frontend ./frontend
docker build -t moodle-proctor-ai ./ai_proctoring

# 8. Run smoke tests
npm run test:e2e -- --project=chromium
```

### Deployment

```bash
# Merge to main (triggers CI/CD)
git checkout main
git merge feature-branch
git push

# Monitor deployment
gh run watch

# Check deployed services
curl http://production-backend/health
curl http://production-frontend/
```

---

## 🆘 Troubleshooting

### Tests Timeout

```bash
# Increase timeout
cd backend
npm test -- --testTimeout=30000

# Or in jest.config.js
testTimeout: 30000
```

### Port Already in Use

```bash
# Find process
lsof -i :5000

# Kill process
kill -9 <PID>

# Or use different port
BACKEND_PORT=5001 npm run dev
```

### Database Connection Error

```bash
# Check PostgreSQL
psql -U postgres -c "SELECT 1"

# Check environment
echo $DATABASE_URL

# Create test DB
psql -U postgres -c "CREATE DATABASE moodle_proctor_test;"
```

### E2E Tests Fail

```bash
# Run locally first
npm run dev:all

# Then run tests
npm run test:e2e

# Increase timeout
npx playwright test --timeout=60000

# Debug specific test
npx playwright test exam-flow --debug
```

### Python Import Error

```bash
# Check Python path
which python3

# Verify virtual environment
source venv/bin/activate

# Reinstall dependencies
pip install -r requirements.txt

# Check module path
python -c "import mediapipe; print(mediapipe.__file__)"
```

---

## 📈 Performance Monitoring

### Track Test Duration

```bash
# Run tests with timing
npm test -- --verbose --detectOpenHandles

# Generate performance report
npm test -- --json > test-results.json
```

### Monitor CI/CD Performance

```bash
# Check average build time
gh run list --limit 20

# Analyze workflow timing
gh run view <RUN_ID> --json jobs,durationMinutes
```

---

## 🔐 Security

### Run Security Checks

```bash
# Dependency audit
npm audit
npm audit fix

# Python security
pip install safety
safety check

# Container scanning
trivy image <IMAGE_NAME>
```

### Secret Management

```bash
# Add secret to GitHub
gh secret set MY_SECRET --body "value"

# Use in workflow
secrets.MY_SECRET
```

---

## 📚 Documentation

### View Guides

```bash
# Complete testing guide
open TESTING_COMPLETE_GUIDE.md

# CI/CD summary
open TESTING_CI_CD_SUMMARY.md

# Environment setup
open .env.example
```

### Generate Local Docs

```bash
# Jest documentation
npx jest --showConfig

# Playwright documentation
npx playwright --help

# Pytest documentation
pytest --help
```

---

## 🎯 Quick Reference Table

| Task | Command |
|------|---------|
| Setup | `./scripts/setup-tests.sh` |
| Run all tests | `npm run test:all` |
| Unit tests | `npm run test:unit` |
| Integration tests | `npm run test:integration` |
| E2E tests | `npm run test:e2e` |
| Coverage | `npm run test:coverage` |
| Lint | `npm run lint` |
| Type check | `npm run type-check` |
| Format | `npm run format` |
| Debug E2E | `npx playwright test --debug` |
| Deploy | `git push origin main` |

---

## 📞 Contact & Support

### Getting Help

1. **Check Logs**: Review GitHub Actions logs
2. **Run Locally**: Reproduce issue locally first
3. **Check FAQ**: See TESTING_COMPLETE_GUIDE.md
4. **Open Issue**: File GitHub issue with logs

### Resources

- [Jest Docs](https://jestjs.io/)
- [Playwright Docs](https://playwright.dev/)
- [Pytest Docs](https://docs.pytest.org/)
- [GitHub Actions](https://github.com/features/actions)

---

**Last Updated**: 2024-01-15  
**Version**: 1.0.0  
**Status**: ✅ Ready to Use
