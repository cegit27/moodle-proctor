# TODOs

## Post-Hackathon Enhancements

### Post-Exam Analytics
**What:** Add violation replay API, analytics endpoint, room cloning, bulk operations

**Why:** Enables post-exam review, statistical analysis, and room management at scale

**Pros:**
- Teachers can replay student proctoring sessions
- Violation statistics by room, exam, time period
- Duplicate room configurations for multiple exam sections
- Bulk operations (close all rooms, export enrollments)

**Cons:**
- ~2-3 hours implementation effort
- Requires API design and storage for screenshots/replay data

**Context:** Deferred from hackathon demo. Live monitoring features take priority. Analytics are impressive but not demo-critical. Build after core room-based invite code flow is working.

**Effort estimate:** M (2-3 hours human / ~45 min CC)
**Priority:** P2
**Depends on:** Core invite code flow, screenshot capture implementation

---

### Infrastructure Scaling
**What:** Add Redis caching for active room state, per-student API rate limiting

**Why:** Supports >50 concurrent students, reduces database load, prevents abuse

**Pros:**
- 60-second TTL caching reduces DB queries by ~90%
- Rate limiting prevents API abuse during exams
- Proven pattern for high-concurrency scenarios

**Cons:**
- ~2-2.5 hours implementation effort
- Adds infrastructure dependency (Redis)
- Over-engineering for <20 student demo

**Context:** Deferred from hackathon demo. PostgreSQL is sufficient for demo scale (<20 students). Redis becomes necessary at production scale (100+ students, multiple concurrent rooms).

**Effort estimate:** M (2-2.5 hours human / ~40 min CC)
**Priority:** P3
**Depends on:** Production deployment, multi-room scaling requirements

---

## Pre-Implementation Critical Fixes

### Database Connection Error Handling
**What:** Add try/catch for database connection failures in `POST /api/room/:code/join`

**Why:** Prevents 500 errors when PostgreSQL is unavailable

**Pros:**
- Graceful error handling
- Clear user-facing message
- Prevents silent failures

**Cons:**
- ~15 min implementation effort

**Context:** CRITICAL GAP identified in engineering review. If DB connection fails during student join, the endpoint throws uncaught exception → 500 error → confusing "Something went wrong" message. Must be fixed before implementation.

**Effort estimate:** S (15 min human / ~5 min CC)
**Priority:** P1 (BLOCKER)
**Depends on:** Nothing — implement immediately in Phase 1

---

### User Creation Race Condition
**What:** Improve duplicate key error handling in `getOrCreateUserByEmail()`

**Why:** Two students joining simultaneously with same email could see confusing error

**Pros:**
- Clear error message for duplicate enrollment
- Handles race condition gracefully

**Cons:**
- ~30 min implementation effort
- Requires database query retry logic

**Context:** CRITICAL GAP identified in engineering review. Current plan catches `duplicate key` exception but returns generic "Email already registered" message. Should be "You are already enrolled in this room" to match the duplicate enrollment check.

**Effort estimate:** S (30 min human / ~10 min CC)
**Priority:** P1 (BLOCKER)
**Depends on:** Nothing — implement immediately in Phase 1

---

### IndexedDB Quota Handling
**What:** Add quota exceeded error handling in `OfflineFrameBuffer`

**Why:** Prevents silent failure when browser storage limit is reached

**Pros:**
- Graceful degradation when quota exceeded
- User can see "Storage full" message
- Prevents data loss

**Cons:**
- ~30 min implementation effort
- Requires quota monitoring before writes

**Context:** CRITICAL GAP identified in engineering review. If student's device has limited storage or many buffered frames, IndexedDB writes will fail silently. Must detect quota exceeded and notify user (or disable offline mode with warning).

**Effort estimate:** S (30 min human / ~10 min CC)
**Priority:** P1 (BLOCKER)
**Depends on:** Offline mode implementation (Phase 2)

---

## Design System & Tokens

### Design System Specification
**What:** Create DESIGN.md with CSS variables, typography scale, color palette, spacing system, and component library

**Why:** No design system exists → engineers guess → inconsistent UI. A design system ensures visual cohesion across all components.

**Pros:**
- Consistent visual language
- Faster implementation (tokens defined upfront)
- Easier maintenance (change once, update everywhere)
- Onboarding guide for new contributors

**Cons:**
- ~2-3 hours to specify completely
- Requires design taste + technical understanding

**Context:** DESIGN.md gap flagged in plan-design-review. Current plan describes features ("color-coded violations") but not specific hex codes, fonts, or spacing. Without tokens, engineers will pick arbitrary values (red=red, blue=blue) → generic look.

**Should specify:**
- Color palette (CSS variables for violation severity, semantic colors, neutrals)
- Typography (heading font, body font, scale: 12/14/16/18/24/32/48px)
- Spacing (4/8/12/16/24/32/48px scale)
- Border radius (4/8/12/16px)
- Shadows (subtle, medium, strong)
- Component patterns (buttons, cards, modals, inputs)

**Effort estimate:** M (2-3 hours human / ~30 min CC)
**Priority:** P2
**Depends on:** Nothing — can run in parallel with implementation

---

### Visual Specificity for UI Descriptions
**What:** Rewrite all generic UI descriptions in plan with specific pixel values, colors, fonts, and spacing

**Why:** "Full-screen student grid" could be anything. Specific descriptions prevent implementation guesses.

**Pros:**
- Engineer builds exactly what was envisioned
- No rework from misinterpretation
- Faster implementation (clear specs)

**Cons:**
- ~1 hour to rewrite plan sections
- Requires visualizing each component

**Context:** AI slop risk flagged in plan-design-review. Plan uses generic language: "color-coded violations", "incident timeline", "one-click interventions". These need specificity:
- Violation overlays: "3px red border (#DC2626) with pulse animation"
- Timeline: "320px right sidebar, 48px Söhne Bold header, 16px Inter body, 40px color-coded left border"
- Interventions: "Icon-only buttons in 32px circle, hover shows text label"

**Effort estimate:** S (1 hour human / ~15 min CC)
**Priority:** P2
**Depends on:** DESIGN.md (for color/typography tokens)

---

## Interaction Design Gaps

### Student Detail Panel Content Layout
**What:** Specify how violation screenshots, teacher notes, and session timeline are arranged in the 480px slide-out panel

**Why:** "Student detail panel with screenshots and notes" describes what but not where. Layout matters for usability.

**Pros:**
- Clear implementation spec
- Consistent across students
- Supports keyboard navigation

**Cons:**
- ~30 min to specify wireframe

**Context:** Design review selected slide-out panel pattern but didn't specify internal layout. Options:
1. Vertical stack (screenshots top, notes middle, timeline bottom)
2. Tabs (screenshots | notes | timeline) - 3 sections
3. Accordion (click to expand each section)

Without spec, engineer will pick easiest (likely vertical stack) which may not be best UX.

**Effort estimate:** S (30 min human / ~10 min CC)
**Priority:** P3
**Depends on:** Nothing — pure UX decision

---

### Violation Screenshot Display Pattern
**What:** Define how screenshots are displayed in student detail panel (inline thumbnails? lightbox? grid?)

**Why:** "Auto-capture screenshot on violation" is backend. Display pattern is frontend UX.

**Pros:**
- Teachers can quickly scan violations
- Pattern consistent across all students

**Cons:**
- ~45 min to specify interaction

**Context:** Proctoring artifacts expansion added screenshots but not display. Options:
1. Inline thumbnails (200x150px, 3-column grid) — click to expand
2. Lightbox (thumbnails → fullscreen modal) — better for detail viewing
3. Carousel (prev/next arrows) — saves space

Recommendation: Lightbox pattern (best balance of overview + detail).

**Effort estimate:** S (45 min human / ~15 min CC)
**Priority:** P3
**Depends on:** Student detail panel layout

---

### Room Countdown Timer Visual Design
**What:** Specify timer UI — digital clock? progress bar? circular? placement? animation?

**Why:** "Room countdown timer" is vague. Timer creates urgency (demo psychology) — needs to feel imminent.

**Pros:**
- Clear visual communication
- Motivates teachers to share code quickly

**Cons:**
- ~30 min to spec

**Context:** UI polish expansion added countdown but not design. Options:
1. Digital clock in header: "02:00:00 remaining" (functional, boring)
2. Circular progress in corner (modern, but small)
3. Full-width progress bar under metrics (most visible)

Recommendation: Digital clock in header + turns red at 15:00 remaining.

**Effort estimate:** S (30 min human / ~10 min CC)
**Priority:** P3
**Depends on:** Operations Center header design
