# Moodle-Proctor Complete Testing TODO (Approved Plan)

## Phase 1: Preparation ✅ COMPLETE
- [x] Create .env.test.example with all vars
- [x] Setup test fixtures (DB seeds, media files)
- [x] Create docker-compose.test.yml

## Phase 2: Unit Tests - Improve with Real Data
- [ ] Frontend: Extend src/__tests__/*.test.tsx (API mocks → MSW, camera fixture)
- [ ] Backend: Fix auth.service race condition, add utils
- [ ] AI Proctoring: Update test_*.py (real lite models, video fixtures)
- [ ] Manual Proctoring: Expand main.test.js → renderer tests

## Phase 3: Integration & E2E
- [ ] Backend integration: Add room/multi-user
- [ ] Playwright E2E: Extend exam-flow, add proctor-flow.e2e.ts, admin.spec.ts
- [ ] Scanning/Upload: New Jest/Playwright tests

## Phase 4: Infrastructure
- [ ] CI/CD: Update .github/workflows/*.yml (cov >80%, parallel)
- [ ] Coverage: Jest/pytest thresholds

## Phase 5: Execute & Report
- [ ] Run full suite in Docker
- [ ] Generate reports (lcov/html)
- [ ] Update TESTING_REPORT.md
- [ ] [COMPLETE]

Progress: Phase 1 starting...

