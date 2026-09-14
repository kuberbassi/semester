# Semester Improvement Log

This file is a simple record of the code-quality work being done. It is written for people, not only for tools.

## Working rules

- Keep the current product behaviour unless a change is clearly described here.
- Prefer small, reviewable improvements over a rewrite.
- Test after each meaningful batch.
- Be honest about what was automatically checked and what still needs a real browser or logged-in test.
- Do not hide warnings just to make a check look green.

## 28 August 2026 - Starting baseline

What I checked:

- The backend and frontend both use strict TypeScript.
- The complete production build passed.
- Backend lint passed.
- Frontend lint did not pass: 223 errors and 9 warnings were reported.
- No normal `*.test.*` or `*.spec.*` test suite currently exists. The backend has useful database test scripts, but they are separate from a regular automated unit-test suite.

The main problems found:

- Some real React correctness warnings, including conditional hooks and unstable effect code.
- A lot of loose `any` types, especially where API data reaches the frontend.
- Several very large files that carry too many responsibilities.
- Important attendance behaviour is carefully handled, but not protected by enough automated regression tests.

First batch being worked on:

- Fix the highest-risk React correctness findings without changing screens or product behaviour.
- Re-run focused lint, full lint, backend lint, and the production build.

### First batch completed

What changed:

- Fixed `GlassCard` so all animation hooks always run in the same order. Previously, two hooks only ran when hover effects were enabled, which can break React's hook rules.
- Kept the same moving glare and brightness effects while making their motion values reusable and safe.
- Made toast functions stable between renders. Toast IDs now use the browser's built-in unique ID generator instead of a random render warning.
- Split reusable toast and semester hooks/contexts out of provider component files. This keeps React hot reload predictable and makes responsibilities clearer.
- Removed a redundant semester startup effect. The existing state initializer already loads the saved or profile semester, so the extra state update was unnecessary.
- Moved the automatic version-check function inside its effect, so the effect owns the function and cleanup it depends on.

Validation after the batch:

- Focused lint for every core file changed in this batch: passed with zero findings.
- Complete production build: passed.
- Backend lint: passed.
- Frontend lint improved from 223 errors and 9 warnings to 215 errors and 9 warnings.
- The full frontend lint is still failing. Most remaining errors are loose `any` types, plus some effect dependency and general cleanup work. This is remaining work, not hidden or ignored.
- The local build reports that `VITE_GOOGLE_CLIENT_ID` is missing, so Google Login is not usable in this local build unless that environment value is supplied. Compilation still succeeds using the project's fallback.

What was not tested in this batch:

- No live logged-in browser flow was run.
- No production data was changed.

### Second batch completed

What changed:

- Separated authentication, confirmation, and theme hooks from their provider components. Provider files now focus on rendering and state ownership; reusable hooks and types have their own small files.
- Moved the authentication refresh cooldown to a stable module constant and removed an unused error variable.
- Changed authentication error handling from loose `any` access to a checked Axios error shape.
- Removed state updates from the theme synchronization effect. Theme actions now update theme and accent state together, while the effect only updates the page class and local storage.
- Kept the Practicals page helper private to the page because nothing else imports it.
- Stabilized the Practicals data-loading effect with `useCallback` and explicit dependencies.
- Added `CODE_QUALITY_PLAN.md` and linked it from the README. The plan covers source code, tests, scripts, CI, types, file structure, README, and technical documentation.

Validation after the second batch:

- Complete production build: passed.
- Frontend lint improved from 215 errors and 9 warnings to 208 errors and 7 warnings.
- Full frontend lint still fails, mainly because of loose `any` types and the remaining page-level effect dependencies.
- The same local `VITE_GOOGLE_CLIENT_ID` warning remains.

Next intended batch:

- Fix the remaining effect dependency warnings carefully, starting with attendance because changing request timing there has the highest product risk.
- Then remove simple unused-variable and `prefer-const` findings before starting the shared API type work.

### Third batch completed

What changed:

- Fixed all currently reported React effect dependency warnings without disabling the rule.
- Attendance class and log loaders are now stable callbacks with explicit semester dependencies. The existing request-number protection remains in place so an older response cannot replace a newer one.
- Attendance reload-on-reconnect now uses those same stable loaders.
- Calendar, Courses, Practicals, Settings, Timetable, and Edit Subject loading effects now declare the values they actually depend on.
- Theme actions are stable callbacks, allowing settings to load saved preferences without recreating the effect on every render.
- Removed mechanical `prefer-const` findings and the remaining unused-variable findings.
- Added root `lint`, `lint:api`, and `lint:frontend` commands and documented them in the README.

Validation after the third batch:

- Complete production build: passed.
- Backend lint: passed.
- Frontend lint now reports 190 errors and zero warnings.
- All 190 remaining frontend lint errors are `no-explicit-any` typing findings. Other currently enabled frontend lint rules are clean.
- Compared with the starting baseline, this is down from 223 errors and 9 warnings.
- The local build still uses the missing-Google-client-ID fallback.

Important limitation:

- These effect changes were verified by lint and compilation, not by a live authenticated attendance session. A browser-level regression check is still required before claiming the attendance interaction is fully verified.

Next intended batch:

- Define safer shared frontend data types, beginning at the API error and dashboard response boundaries.
- Replace `any` gradually by domain area, with a build after each group rather than performing a blind repository-wide replacement.

### Fourth batch completed

What changed:

- Added a defined shape for API error responses used by the shared Axios client.
- Added the refresh and retry markers to Axios request types instead of attaching them through `any` casts.
- Refresh failures are now checked with Axios's runtime type guard before reading status or error codes.
- React Query now extracts status, cancellation details, and user-facing messages through a shared checked helper.
- Preserved support for deliberately silent errors without assuming every thrown value has a `meta` object.
- Replaced the loose generic debounce signature with an argument-tuple type.
- Added an explicit browser type for Safari's older `webkitAudioContext` property and safely handle its absence.

Validation after the fourth batch:

- Focused lint for the four changed boundary/utility files: passed with zero findings.
- Complete production build: passed.
- Frontend lint improved from 190 errors to 178 errors, with zero warnings.
- The remaining 178 findings are still explicit `any` types in domain types, services, hooks, pages, and components.
- The local Google client ID warning remains unchanged.

Next intended batch:

- Define the dashboard, attendance-log, subject-summary, timetable, and common API response shapes in the shared frontend types.
- Apply those types first to service return values and hooks, then allow the compiler to reveal incorrect assumptions in individual screens.

### Fifth batch completed

What changed:

- Expanded the shared attendance record type to cover the statuses and compatibility fields the application actually receives.
- Added named types for attendance mutation results and normalized scheduled classes.
- Defined dashboard subjects, recent logs, daily/weekly data, and summary fields instead of leaving them as `any`.
- Defined report subject rows and semester-result subjects with safe known fields.
- Updated the attendance service to return typed attendance changes, calendar records, and scheduled classes.
- Typed the old/new subjects response shapes handled by the service.
- Removed all loose types from the dashboard data hook, including the cached user threshold lookup.
- Made subject identity compatibility explicit: dashboard deletion now accepts either `id` or `_id` and refuses to issue a delete without a real identifier.

Validation after the fifth batch:

- Shared type and dashboard-hook focused lint: passed.
- Complete production build: passed.
- Frontend lint improved from 178 errors to 159 errors, with zero warnings.
- The build exposed one unsafe `_id` assumption in the dashboard. It was corrected with an explicit `id`/`_id` resolution before the successful build.
- The local Google client ID warning remains unchanged.

Next intended batch:

- Type timetable slots, subjects, and periods where they enter the Timetable and Dashboard pages.
- Then type the attendance modal's local state and helpers using the new scheduled-class and attendance-record models.

### Sixth batch completed

What changed:

- Expanded timetable slot and grid-period types to describe the legacy and current field names the UI already supports.
- Timetable subjects can now be represented safely as an ID, name string, or embedded subject object without using `any`.
- Removed all explicit `any` types from the Timetable page, Slot modal, and Structure modal.
- Timetable state now uses named schedule, slot, period, and subject types.
- Slot editing now narrows embedded subject objects before reading IDs, names, or codes.
- Modal inputs now accept typed periods and subjects, and the slot-type selector is restricted to supported slot types.
- Period editing is restricted to the three editable fields instead of accepting arbitrary property names.

Validation after the sixth batch:

- Focused lint for the Timetable page, both timetable modals, and shared types: passed with zero findings.
- Complete production build: passed.
- Frontend lint improved from 159 errors to 124 errors, with zero warnings.
- TypeScript initially rejected direct property access on a subject that might be a string. The code now narrows it to an object first, and the build passes.
- The local Google client ID warning remains unchanged.

Next intended batch:

- Apply `ScheduledClass`, `AttendanceRecord`, and `Subject` to Attendance modal state and helper parameters.
- Replace error catches with checked Axios errors while preserving reconciliation and rollback behaviour.

### Seventh batch completed

What changed:

- Removed every explicit `any` type from the Attendance modal.
- Attendance modal state now uses `ScheduledClass`, `AttendanceRecord`, and `Subject` instead of unstructured arrays.
- Added a local grouped-class model that records the original classes behind a merged attendance block.
- Typed simple and detailed attendance statuses so unsupported values cannot be passed accidentally.
- Typed the Subject row and substitution dropdown callback contracts.
- Added a single checked Axios error-message helper for delete, mark, bulk mark, unmark, clear, and detailed-update failures.
- Preserved optimistic snapshots and rollback arrays with their real types.
- Added the remaining legacy compatibility fields discovered by the compiler, including `subjectId`, `subject_info`, and optional alternate IDs.

Validation after the seventh batch:

- Attendance modal and shared-type focused lint: passed with zero findings.
- Complete production build: passed.
- Frontend lint improved from 124 errors to 88 errors, with zero warnings.
- The compiler exposed several legacy fields and one unvalidated status string. Those are now explicitly modeled or narrowed before use.
- No live authenticated attendance flow was run. Correctness evidence remains static analysis and compilation for this batch.
- The local Google client ID warning remains unchanged.

Next intended batch:

- Remove loose types from Edit Subject, Practicals, calculation hooks, and interaction hooks.
- Then finish the remaining attendance-service and settings/data-transfer boundary types.

### Eighth batch completed

What changed:

- Added explicit attendance-calculation result and summary models.
- Grade calculations now accept courses with known credit and grade fields instead of arbitrary objects.
- Removed loose types from the shared calculation engine and both calculation hooks.
- Long-press callbacks now accept real React mouse or touch events, and the timer uses a browser-safe timeout type.
- Added a complete Edit Subject form model covering categories, attendance counts, credits, and practical/assignment totals.
- Edit Subject now validates that a subject identifier exists before saving.
- Removed all explicit `any` types from the Edit Subject modal and Practicals page.
- Practical and assignment mutations now accept either `id` or `_id` and stop with a visible error if neither exists.

Validation after the eighth batch:

- Focused lint for calculations, long press, Edit Subject, and Practicals: passed with zero findings.
- Complete production build: passed.
- Frontend lint improved from 88 errors to 58 errors, with zero warnings.
- The local Google client ID warning remains unchanged.

Next intended batch:

- Type the remaining Dashboard and Calendar compatibility helpers.
- Then finish Settings data operations and the remaining attendance-service payloads.

### Ninth batch completed

What changed:

- Removed the final loose `any` values from Dashboard, Calendar, Google Drive settings, login, account settings, AI chat, and the attendance service.
- Added named compatibility types for timetable periods and slots, Drive backups and status, notices, notifications, manual courses, and analytics payloads.
- Dashboard timetable-to-subject matching now has an explicit input and return contract while still supporting old IDs, names, and embedded subject objects.
- Long-press menu coordinates now safely distinguish mouse events from touch events.
- Added one shared error-message helper so API, JavaScript, and unknown failures are handled consistently without assuming every caught value is an Axios error.
- Import data stays `unknown` at the trust boundary rather than pretending uploaded JSON has already been validated.

Validation after the ninth batch:

- Complete root lint passed for the backend and frontend with zero errors and zero warnings.
- This completes the lint cleanup from the original baseline of 223 errors and 9 warnings.
- No lint rules were disabled to obtain the clean result.

Next intended batch:

- Add repeatable unit tests for attendance normalization, bulk attendance rules, timetable compatibility, date handling, and attendance calculations.
- Add those tests to the root quality commands and continuous integration.

### Tenth batch completed

What changed:

- Added a database-free Node test suite that runs directly against the TypeScript domain modules.
- Covered legacy attendance-status normalization, counted-versus-attended rules, cancelled classes, medical leave, timetable slot compatibility, schedule scoring, attendance targets, summaries, grade weighting, and local date formatting.
- Extracted Dashboard timetable matching, time parsing, and ordering into a focused domain utility instead of keeping those rules inside the page component.
- Added regression coverage for ID-based and label-based subject matching, break exclusion, and 12-hour timetable ordering.
- Added root `test`, `test:unit`, and `quality` commands. `npm run quality` is now the one-command local gate for lint, tests, and both builds.
- Added a GitHub Actions workflow that installs the locked dependency tree and runs the same quality command on pushes and pull requests.
- Updated README, technical documentation, and the code-quality plan to describe the commands, architecture boundaries, CI behavior, and database-test limitation accurately.

Validation after the tenth batch:

- Unit suite: 9 tests passed, 0 failed.
- Complete root lint: passed with zero errors and zero warnings.
- The database-backed integration scripts were not run because they require configured credentials and create temporary records. They remain separate, documented checks.

Next intended batch:

- Run the complete root quality gate from a clean command invocation.
- Review whitespace, changed-file scope, generated artifacts, remaining large files, and final documentation accuracy.

### Final quality pass completed

What changed during final review:

- The first complete gate exposed stricter timetable-slot and optional subject-field assumptions that lint alone could not detect. Slot creation now validates its day and period and narrows the supported type before calling the service.
- Optional subject IDs and teacher names are resolved before use instead of being passed as guaranteed strings.
- Removed the remaining inline lint suppression; the clean result does not depend on disabled rules.
- Confirmed generated build files remain ignored and no package lock update was needed for the new scripts or tests.

Final validation evidence:

- `npm run quality`: passed from start to finish.
- Backend lint: passed.
- Frontend lint: passed with zero errors and zero warnings. Original baseline was 223 errors and 9 warnings.
- Unit tests: 9 passed, 0 failed.
- Backend TypeScript production build: passed.
- Frontend TypeScript and Vite PWA production build: passed; 2,572 modules transformed and the service worker was generated.
- `git diff --check`: passed. Git only reported the repository's existing Windows line-ending conversion notices.
- A sandboxed repeat build was once blocked from reading the local Vite config; rerunning the same complete gate with normal filesystem access passed. This was a tool sandbox limitation, not a project failure.

Known limits and remaining maintenance debt:

- No live authenticated attendance, Google Drive, account migration, or database integration flow was run in this pass. Those require real credentials and server state; build and unit evidence must not be described as proof of those flows.
- `AttendanceModal.tsx`, `Dashboard.tsx`, and `attendance.service.ts` are still large. Their risky domain boundaries are now typed and some timetable logic has been extracted, but further splitting should happen alongside feature work so it does not become a large behavior-changing rewrite.
- The local build environment does not contain `VITE_GOOGLE_CLIENT_ID`, so the documented `missing-client-id` fallback was compiled. Deployment must provide the real value.
- CI has been added locally but has not run remotely because this work was not committed or pushed.

Plan status:

- React correctness: completed for all reported lint findings.
- Reliable root checks: completed.
- Initial critical-domain unit tests: completed.
- Loose frontend boundary typing: completed for the original lint scope.
- Responsibility cleanup: completed as a safe foundation through context splitting and timetable-domain extraction; continued feature-led decomposition is recorded above as maintenance debt.
- README, technical documentation, CI, and final static verification: completed.

### Semester naming cleanup and structure-plan expansion

What was found:

- The old `Zenith` name still appeared in the backend workspace package name, API documentation, frontend build banner, calculation-engine comment, export filenames, migration keys, and Google Drive backup filenames.
- Other `zenith_` values are persisted compatibility contracts: authentication cookies, browser storage/cache keys, old migration keys, the backup-encryption fallback, existing Drive backup names, and a deployed host allowed by the security policy.

What changed:

- Renamed the backend workspace to `semester-api`, including the lockfile entry. Backend command output now shows `semester-api`.
- Renamed the frontend build banner and API documentation to Semester.
- New offline exports, downloaded Drive backups, Drive uploads, and generated migration keys now use `semester_` names.
- Drive listing and cleanup query both Semester and legacy Zenith backup names, so old cloud backups remain visible and still count toward retention.
- Migration completion accepts both `semester_migrate_` and legacy `zenith_migrate_` keys.
- Kept session cookies, browser storage, encryption fallback, and the existing CSP host unchanged to avoid logging users out, losing preferences, invalidating old encrypted data, or blocking a live endpoint.
- Documented those retained compatibility identifiers so future cleanup does not mistake them for accidental visible branding.
- Expanded the quality plan with an explicit file-and-folder structure stage covering directory ownership, feature/domain extraction, API/UI boundaries, naming, dead-file checks, import updates, and small verified moves.

Validation:

- Complete `npm run quality`: passed.
- Backend output now identifies the package as `semester-api`.
- Unit tests: 9 passed, 0 failed.
- Backend and frontend lint: passed.
- Backend and frontend production builds: passed.
- The only build notice remains the missing local `VITE_GOOGLE_CLIENT_ID` fallback.

### Outstanding-work requirements documented

- Added a final `Work left and requirements` section to the code-quality plan.
- It records every important unverified or unfinished area: authenticated attendance, database integration scripts, Google Drive, account migration, real Google sign-in, browser/mobile review, remote CI, continued file organization, and legacy-identifier migration.
- Each item now states the minimum credentials, test accounts, environment access, authorization, or regression evidence needed to complete it.
