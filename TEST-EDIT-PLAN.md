# TEST-EDIT-PLAN.md: Fixing AuthService TypeScript Error

## Approved Plan Summary
**Target:** moodle-proctor/tests/unit/auth.service.test.ts (line 23 error)

**Root Cause:** Test imports singleton instance but tries `new` on it.

**Fix:** Direct class import + new instance per test.

## TODO Steps
- [ ] Step 1: Edit test file with exact diff replacements
- [ ] Step 2: Verify TypeScript errors gone in VSCode
- [ ] Step 3: Run tests: `cd moodle-proctor/tests && npx jest auth.service.test.ts`
- [ ] Step 4: Update this TODO with progress
- [ ] Step 5: Complete task
