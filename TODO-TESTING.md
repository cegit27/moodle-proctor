# Moodle-Proctor Complete Testing & CI/CD Implementation TODO (Updated)

## ✅ 1. Create TODO.md (DONE)

## ✅ 2. Frontend Unit Tests (COMPLETE)
- ✅ `frontend/src/__tests__/Proctoring.test.tsx`
- ✅ `frontend/src/__tests__/ExamDashboard.test.tsx`
- ✅ `frontend/src/__tests__/Upload.test.tsx`
- [ ] Update `frontend/jest.config.js`: 80% coverage

## [ ] 3. Backend Improvements...
## [ ] 3. Backend Improvements
- [ ] Extend `tests/unit/exam.service.test.ts`: timeouts/violations
- [ ] New `tests/unit/room.service.test.ts`
- [ ] `tests/integration/webrtc.integration.test.ts`

## [ ] 4. AI Proctoring (Real Mocks)
- [ ] Update `tests/unit/ai_proctoring/test_face_monitor.py`: ML fixtures
- [ ] `tests/integration/ai_ws.test.ts`

## [ ] 5. Manual Proctoring (Rewrite)
- [ ] Full `manual_proctoring/__tests__/main.test.js` → Electron/Spectron
- [ ] `manual_proctoring/__tests__/monitoring.test.js`

## [ ] 6. E2E Extensions
- [ ] `tests/e2e/proctor-dashboard.e2e.test.ts`
- [ ] `tests/e2e/violation-trigger.e2e.test.ts`

## [ ] 7. Test Structure
- [ ] `tests/docker/` (container tests)
- [ ] Global `tests/coverage.yml` (80% enforce)

## [ ] 8. Docker Testing
- [ ] `docker-compose.test.yml`
- [ ] `Dockerfile.test` per service

## [ ] 9. CI/CD Improvements
- [ ] Update `.github/workflows/ci.yml`: parallel, coverage badges, Docker

## [ ] 10. Install & Verify
```
cd moodle-proctor
npm ci && pip install -r ai_proctoring/requirements.txt -r tests/requirements.txt
npm test && pytest tests/ --cov
docker-compose -f docker-compose.test.yml up test
```

## [ ] 11. Coverage Reports & Finalize
- [ ] ≥80% all modules
- [ ] Allure/Sonar reports
- [ ] Update TESTING_REPORT.md

**Progress: 0/11 → Run `npm run test-all` after completion.**

