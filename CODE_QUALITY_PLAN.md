# Semester Code Quality Plan

This plan improves the existing project without rewriting it or changing working behaviour unnecessarily.

## What good means for this project

- Attendance and timetable rules stay accurate during retries, duplicate requests, stale screens, and partial failures.
- The server remains the final authority for stored academic data.
- Important behaviour has automated tests, not only comments or successful builds.
- Frontend and backend lint pass without hiding useful rules.
- Data passed between the API and frontend has clear TypeScript types.
- Large files are split when that makes a real workflow easier to understand.
- Files and folders have clear ownership, consistent names, and predictable import boundaries.
- README and technical documentation describe the code that actually exists.

## Completed foundation

The initial whole-project quality pass is complete. The project now has a clean lint baseline, root lint/test/build commands, database-free regression tests for core domain rules, a CI quality gate, named frontend API/domain types, split React context modules, extracted timetable domain logic, and updated maintainer documentation.

The sections below remain the standard for future changes. They describe the order used during this pass and the expectations new work should preserve.

## Improvement order

### 1. React correctness

Fix hook-order problems, unstable effects, missing dependencies, render-time side effects, and hot-reload structure.

### 2. Reliable quality commands

Make build, frontend lint, backend lint, and tests easy to run from the project root. Add CI only after these checks are dependable locally.

### 3. Tests for important rules

Start with attendance calculations, timetable block identity, bulk marking, duplicate requests, authorization, and date handling.

### 4. Stronger types

Replace loose `any` values at API and storage boundaries with named request, response, timetable, subject, and attendance types.

### 5. Smaller responsibilities

Gradually split the largest files. Extract domain logic and state orchestration before extracting small pieces of markup.

### 6. File and folder structure

Organize by responsibility without doing a risky one-shot reshuffle:

- document what belongs in `pages`, `components`, `contexts`, `hooks`, `lib`, `services`, `types`, backend `routes`, and backend `utils`;
- move domain rules out of page and modal files into testable feature or library modules;
- keep API transport/compatibility code separate from UI state and presentation;
- use consistent Semester naming for active modules while preserving explicitly documented legacy storage and protocol keys;
- remove dead, duplicate, generated, or abandoned files only after reference and build checks;
- update imports and documentation in the same change as every move;
- prefer small feature-led moves, with lint, tests, and builds after each batch.

Completion means a maintainer can predict where new code belongs, major files have one primary responsibility, active names match the product, and no move silently breaks persisted user data or public contracts.

### 7. Documentation and final verification

Keep README setup and validation commands current, repair outdated or broken text, document architecture decisions that future maintainers need, and run representative browser and authenticated workflows where possible.

## Required checks for future changes

Run `npm run quality` before merging. For database, authentication, backup, or attendance mutation changes, also run the relevant integration script or a representative authenticated flow and record that evidence separately. A green build is not a substitute for live workflow verification.

## How progress is recorded

[`logs.md`](logs.md) records completed changes, measured check results, known limitations, and what has not yet been tested.

## Work left and requirements

These items were not completed or could not be verified safely during the initial quality pass.

### Authenticated attendance verification

Run marking, editing, duplicate correction, bulk marking, unmark-all, reconnect recovery, and multi-semester checks against a real test account.

**Needed:** A disposable authenticated account, a configured test database, and permission to create and remove test attendance records.

### Database integration scripts

Run the attendance, tracker-activity, and bulk-attendance integration scripts and verify their cleanup.

**Needed:** A non-production `DATABASE_URL` with the current Prisma schema and permission to create sentinel test records.

### Google Drive backup and restore

Verify linking, manual backup, listing old and new backup names, download, restore, retention cleanup, and disconnect behavior.

**Needed:** Google OAuth client credentials and a disposable Google account with Drive AppData access.

### Account migration

Verify new `semester_migrate_` keys and backward compatibility with old `zenith_migrate_` keys, including failure and rollback paths.

**Needed:** Two disposable authenticated accounts and a configured test database containing non-sensitive sample data.

### Real frontend authentication build

Build and exercise Google sign-in without the local `missing-client-id` fallback.

**Needed:** A valid `VITE_GOOGLE_CLIENT_ID` configured for the local or preview origin.

### Browser and mobile workflow review

Manually verify Dashboard, Attendance, Calendar, Timetable, Settings, keyboard interactions, loading/error states, and responsive layouts.

**Needed:** A running frontend and backend, an authenticated test account, and representative desktop and mobile viewport testing.

### Remote CI verification

Confirm the new GitHub Actions quality workflow succeeds in the repository environment.

**Needed:** Commit and push authorization, plus repository Actions access and required build configuration.

### Continued file-structure organization

Further split `AttendanceModal.tsx`, `Dashboard.tsx`, and `attendance.service.ts` around domain orchestration, API transport, and presentation responsibilities.

**Needed:** Small feature-led batches, regression tests for each extracted rule, and authenticated workflow verification for attendance-related moves.

### Remaining legacy identifier migration

Only migrate old cookie, localStorage, encryption, backup, and host identifiers when existing users and stored data can be preserved.

**Needed:** A versioned migration design, dual-read transition period, production host confirmation, rollback plan, and tests using existing-format sessions and backups.
