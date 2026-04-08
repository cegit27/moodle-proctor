# Moodle Teacher Dashboard Rewrite

## Scope To Preserve

This rewrite is not a full Moodle replacement.

The flow that must stay intact is:

1. Teacher works in Moodle.
2. Teacher selects an exam, timing, question paper, AI, proctoring, and students.
3. Student logs into Moodle and sees assigned exams.
4. Student takes the exam in the existing Electron app.
5. After the exam, the QR-based answer-sheet upload flow stays exactly as it is.

The Electron exam flow is intentionally not being replaced in this pass.

## What Moodle Owns Now

Plugin path:

- `moodle-plugin/local/dscproctor/`

This plugin now provides:

- a Moodle teacher dashboard
- Moodle-side exam registration
- Moodle-side assignment scheduling
- Moodle-side mapping of assignments to selected students
- a Moodle student page showing assigned exams
- a Moodle launch page that builds the Electron handoff for the assigned student
- hybrid settings for linking back to existing services where needed

This means Moodle now covers both:

- teacher planning and assignment
- student visibility and launch handoff

## What Still Stays Outside Moodle

These parts remain in the current stack by design:

- live student exam session in `manual_proctoring/`
- Electron desktop controls and kiosk behavior
- QR answer-sheet upload flow after exam completion
- existing backend services in `backend/`
- AI service in `ai_proctoring/`

That boundary is deliberate and should not be changed unless we explicitly decide to redesign the student flow.

## Current Moodle Data Model

The plugin now uses these Moodle tables:

- `local_dscproctor_exam`
- `local_dscproctor_assign`
- `local_dscproctor_asgnusr`
- `local_dscproctor_room`
- `local_dscproctor_attempt`
- `local_dscproctor_violation`

The teacher scheduling flow for this pass mainly relies on:

### `local_dscproctor_exam`

Stores the teacher-visible exam definition:

- course
- exam name
- default question paper
- duration
- warning limit
- optional legacy exam ID

### `local_dscproctor_assign`

Stores each scheduled assignment:

- selected exam
- teacher
- assignment label
- start and end time
- duration
- question paper
- AI enabled flag
- proctoring enabled flag
- optional Electron room code
- optional Electron launch URL

### `local_dscproctor_asgnusr`

Stores which users were assigned to each scheduled exam.

## Pages In This Pass

### Landing Page

Path:

- `/local/dscproctor/index.php`

Use it to:

- confirm plugin install
- view high-level counts
- jump to teacher and student pages
- verify hybrid configuration

### Teacher Dashboard

Path:

- `/local/dscproctor/teacher_dashboard.php`

Teacher can now:

- register a Moodle-side exam record for a course
- choose a course
- choose an exam for that course
- set assignment timing
- set duration
- set question paper
- enable or disable AI
- enable or disable proctoring
- select students
- optionally store Electron room code and launch URL
- review created assignments

### Student Assigned Exams

Path:

- `/local/dscproctor/student_launch.php`

Student can now:

- log into Moodle
- see assigned exams
- view timing, question paper, AI, proctoring, and room code details
- know that the real exam must still be taken in the Electron app
- continue with the existing QR upload flow after the exam

### Student Electron Handoff

Path:

- `/local/dscproctor/assignment_launch.php?id=<assignmentid>`

Student can now:

- open a Moodle-owned launch page for a single assigned exam
- see whether the exam is ready, upcoming, closed, or missing a room code
- launch the Electron app through the existing `proctor://room/...` deep link format
- use a browser helper URL when one is configured
- fall back to manual room-code entry when needed

## Install Steps

1. Copy `moodle-plugin/local/dscproctor` into your Moodle codebase as `<moodle-root>/local/dscproctor`.
2. Visit `Site administration -> Notifications`.
3. Let Moodle install or upgrade the plugin tables.
4. Open `Site administration -> Plugins -> Local plugins -> DSC Proctor Rewrite`.
5. Configure hybrid settings.

Recommended settings for this pass:

- Hybrid mode: `enabled`
- Legacy backend URL: your current `backend` service URL
- Legacy teacher dashboard URL: optional while migration is in progress
- Legacy AI service URL: your current AI service URL
- Student launch mode: `Hybrid Electron launch`

## Teacher Workflow

1. Open the Moodle teacher dashboard.
2. Register an exam for a course if it does not exist yet.
3. Create an assignment for that exam.
4. Select the students who should take it.
5. Set timing, duration, question paper, AI, and proctoring.
6. Optionally save the Electron room code and launch URL.
7. Students will then see the assignment in Moodle and can open the Electron handoff page from there.

## Student Workflow

1. Student logs into Moodle.
2. Student opens the assigned exams page.
3. Student opens the assignment launch page from Moodle.
4. Student checks readiness, room code, and schedule.
5. Student opens the Electron app from the Moodle handoff button.
6. Student takes the exam in Electron.
7. Student continues to the existing QR answer-sheet upload flow after the exam.

## Important Rules For Future Passes

1. Do not replace the Electron exam session in this rewrite track.
2. Do not break the QR answer-sheet upload flow.
3. Keep Moodle focused on teacher planning, assignment visibility, and scheduling unless we explicitly decide otherwise.
4. Keep storing legacy identifiers where needed so Moodle can point students into the existing exam system.

## Suggested Next Passes

### Pass 3

Focus on integration, not replacement:

- generate or sync Electron room codes from Moodle assignments
- map Moodle assignment records to existing backend exam or room records
- expose cleaner teacher-side details for launch readiness

### Pass 4

Tighten student handoff:

- add a stronger Moodle-to-Electron launch instruction flow
- optionally expose richer download or deep-link handoff options from Moodle
- sync assignment status back from the backend if needed

### Pass 5

Teacher operations only:

- move more teacher reporting into Moodle
- bring assignment monitoring and summary views into Moodle
- keep student exam execution in Electron unless product scope changes

## Files To Work With

- Plugin root: `moodle-plugin/local/dscproctor/`
- Teacher page: `moodle-plugin/local/dscproctor/teacher_dashboard.php`
- Student page: `moodle-plugin/local/dscproctor/student_launch.php`
- Student handoff page: `moodle-plugin/local/dscproctor/assignment_launch.php`
- Repository helpers: `moodle-plugin/local/dscproctor/classes/local/repository.php`
- Assignment service: `moodle-plugin/local/dscproctor/classes/local/assignment_service.php`
- Launch helper: `moodle-plugin/local/dscproctor/classes/local/launch_helper.php`
- Schema: `moodle-plugin/local/dscproctor/db/install.xml`
- Upgrade steps: `moodle-plugin/local/dscproctor/db/upgrade.php`

## Verification Notes

This repo environment does not currently have PHP installed, so Moodle PHP linting was not run here.

The changes in this pass were verified by source review only.
