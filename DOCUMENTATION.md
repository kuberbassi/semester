# Semester — Core Technical Documentation

Semester is a full-stack, responsive Academic Operating System designed to help college students track compliance, view schedules, query their records via an AI assistant, and manage backups.

---

## 1. Directory Structure & Architecture

Semester is structured as a monorepo containing two active primary directories:
- **`frontend/`**: Single Page Application built on React, Vite, and TypeScript, compiled into a progressive web app (PWA).
- **`api-node/`**: Core API server built on Express, TypeScript, and Prisma ORM, deployed on Neon Serverless PostgreSQL.

```
Semester/
├── api-node/                     # Express Backend Engine
│   ├── prisma/
│   │   └── schema.prisma        # Database schema definitions
│   ├── src/
│   │   ├── app.ts               # Express configuration, rate limiting, & security middlewares
│   │   ├── index.ts             # Server runtime entry point
│   │   ├── config/              # Prisma singleton & environment verification
│   │   ├── middleware/          # Authorization checks & platform parsing
│   │   ├── routes/              # Modular API endpoints
│   │   ├── utils/               # LLM, Google Drive, & response wrappers
│   │   └── vercel.ts            # Vercel serverless integration
│   └── package.json
│
├── frontend/                    # Vite + React Client App
│   ├── public/                  # Logo images, manifest configurations, and sw.js
│   ├── src/
│   │   ├── App.tsx             # Application router
│   │   ├── index.css            # Custom CSS Variables and Dark Mode theme configurations
│   │   ├── components/
│   │   │   ├── layout/          # AIChat sidebar, BottomNav, and layout wrapper
│   │   │   ├── modals/          # Modal sheets (subject edits, timetables)
│   │   │   └── ui/              # Reusable responsive buttons, inputs, & modals
│   │   ├── contexts/            # Global Auth, Semester, and Theme providers
│   │   ├── hooks/               # Custom lifecycle handlers
│   │   ├── lib/                 # Testable attendance, date, and timetable domain rules
│   │   ├── pages/               # Main pages (Dashboard, Settings, Timetable, Calendar, etc.)
│   │   ├── services/            # Axios API client handlers
│   │   ├── types/               # TypeScript interfaces
│   │   └── utils/               # PDF rendering & calculation routines
│   └── package.json
```

Context values live in small context-only modules, while provider components own state and effects. This keeps React Fast Refresh reliable and lets consumers import contracts without pulling provider implementation into the module graph.

Shared API responses are normalized in `frontend/src/services/attendance.service.ts` and described in `frontend/src/types/index.ts`. Legacy `id`/`_id`, timetable field-name, and nested-response compatibility is handled at that boundary or in focused domain helpers rather than scattered unchecked casts.

Active product and package names use **Semester**. Some internal values deliberately retain the old `zenith_` prefix: authentication cookie names, localStorage/cache keys, the legacy migration-key prefix accepted by the API, the backup-encryption fallback, and an existing deployment host in the security policy. These are compatibility contracts, not visible branding. Rename them only through an explicit migration that preserves existing sessions, preferences, backups, and tokens.

## Local quality gate

Run `npm run quality` from the repository root. It performs backend and frontend lint, database-free domain unit tests, and both production builds. `.github/workflows/quality.yml` runs the same command for pushes and pull requests.

Database-backed attendance scripts remain separate because they require explicit credentials and create temporary sentinel records. A successful default quality run therefore proves static checks, pure domain behavior, and compilation, but not an authenticated production attendance flow.

---

## 2. Database Schema (Prisma)

**Prisma Schema File**: `api-node/prisma/schema.prisma`

All tables are deployed on a Serverless PostgreSQL database (Neon). Below is the comprehensive schema documentation:

### 2.1 Model: `User` (Table: `users`)
Contains base profile data, targets, and auth configurations. Deleting a user cascades deletions down to all child rows.

| Field Name | Type | Attributes / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `String` | `@id`, `@default(cuid())` | Unique user identifier. |
| `google_id` | `String` | `@unique` | Linked Google authentication identity. |
| `email` | `String` | `@unique` | Primary email address. |
| `name` | `String` | | Display name of the user. |
| `picture` | `String?` | | Profile avatar URL. |
| `branch` | `String?` | | Engineering / academic branch. |
| `course` | `String?` | | Current degree course. |
| `college` | `String?` | | Name of the institution. |
| `batch` | `String?` | | Batch code. |
| `enrollment_number` | `String?`| | Student registry identifier. |
| `admission_year` | `String?` | | Year of admission. |
| `current_semester` | `Int` | `@default(1)` | Current active semester. |
| `target_attendance` | `Int` | `@default(75)` | Default target attendance percentage. |
| `attendance_threshold`| `Int` | `@default(75)` | Minimum threshold target limit. |
| `warning_threshold` | `Int` | `@default(76)` | Threshold warning color limit. |
| `biometrics` | `Json` | `@default("{}")` | Biometric configuration flags. |
| `created_at` | `DateTime` | `@default(now())` | Creation date. |
| `updated_at` | `DateTime` | `@updatedAt` | Automatic update timestamp. |

---

### 2.2 Model: `UserSession` (Table: `user_sessions`)
Represents active refresh tokens, logged-in browsers, and session parameters.

The active-device view updates the current session's `last_active_at` when it is loaded. The current device is labelled **Active now**; other devices show their last server-verified session activity with seconds and the browser's explicit timezone. API timestamps remain Unix milliseconds, avoiding ambiguous timezone-free date strings.

| Field Name | Type | Attributes / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `String` | `@id`, `@default(cuid())` | Unique session identifier. |
| `user_id` | `String` | | Foreign key referencing `User.id`. |
| `device_id` | `String?` | | Unique hardware signature. |
| `country_code` | `String?` | | ISO country code captured from trusted hosting-edge headers; no third-party IP lookup is performed. |
| `refresh_token_hash` | `String` | `@unique` | Securely hashed OAuth token. |
| `refresh_expires_at` | `DateTime`| | Session expiration timestamp. |
| `refresh_issued_at` | `DateTime`| `@default(now())` | Issuance timestamp. |
| `ip` | `String?` | | Client IP address. |
| `user_agent` | `String?` | | User agent header string. |
| `last_active_at` | `DateTime`| `@default(now())` | Last session heartbeat ping. |
| `rotated_at` | `DateTime?`| | Token rotation grace period marker. |
| `created_at` | `DateTime`| `@default(now())` | Creation date. |

---

### 2.3 Model: `Subject` (Table: `subjects`)
Tracks subjects, compliance requirements, practicals, assignments, and credit hours.

| Field Name | Type | Attributes / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `String` | `@id`, `@default(cuid())` | Unique subject identifier. |
| `user_id` | `String` | | Foreign key referencing `User.id`. |
| `name` | `String` | | Display name of the subject. |
| `code` | `String` | `@default("")` | Academic course code. |
| `professor` | `String` | `@default("")` | Professor's name. |
| `classroom` | `String` | `@default("")` | Room / lecture hall number. |
| `semester` | `Int` | `@default(1)` | Mapped academic semester. |
| `type` | `String` | `@default("theory")` | Type of subject (e.g. `theory`, `practical`). |
| `credits` | `Int?` | | Subject weight credits. |
| `attended` | `Int` | `@default(0)` | Count of attended lectures. |
| `total` | `Int` | `@default(0)` | Count of total lectures. |
| `target` | `Int` | `@default(75)` | Specific attendance target % for this subject. |
| `categories` | `String[]` | | Array of assigned categories (Theory, Practical). |
| `practicals` | `Json?` | | Practical checklist (total, completed, hardcopy). |
| `assignments` | `Json?` | | Assignment checklist (total, completed, hardcopy). |
| `syllabus` | `String?` | | Subject syllabus detailed text. |
| `created_at` | `DateTime` | `@default(now())` | Row creation timestamp. |
| `updated_at` | `DateTime` | `@updatedAt` | Row update timestamp. |

---

### 2.4 Model: `AttendanceLog` (Table: `attendance_logs`)
Tracks individual marked attendance logs.

| Field Name | Type | Attributes / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `String` | `@id`, `@default(cuid())` | Unique log entry identifier. |
| `user_id` | `String` | | Foreign key referencing `User.id`. |
| `subject_id` | `String` | | Foreign key referencing `Subject.id`. |
| `subject_name` | `String` | | Helper string cache of subject name. |
| `date` | `String` | | Date of lecture (Format: `YYYY-MM-DD`). |
| `status` | `Enum` | `AttendanceStatus` | `present`, `absent`, `late`, `approved_medical`, `medical`, `duty`, `substituted`, or `cancelled`. |
| `type` | `String` | `@default("Lecture")` | Attendance identity. Manual/legacy records use a class type such as `Lecture`; timetable-generated records use `<slot type>::<block start>` so separate same-subject blocks on one date remain independently markable. |
| `notes` | `String?` | | Student notes. |
| `semester` | `Int?` | | Cached semester number. |
| `substituted_by`| `String?` | | Foreign key referencing substitute subject ID. |
| `timestamp` | `DateTime` | `@default(now())` | Server-generated entry creation time. Editing preserves this timestamp; the corresponding `SystemLog` records the edit time. |

Attendance logs have a compound uniqueness constraint on `user_id`, `subject_id`, `date`, and `type`. The timetable attendance flow therefore supplies a stable block-aware `type`: every adjacent run of the same subject and slot type receives the identifier of the run's first period. This preserves one-click marking for consecutive periods without collapsing another occurrence of that subject later in the day.

---

### 2.5 Model: `ManualCourse` (Table: `manual_courses`)
Tracks non-academic online certifications (e.g., Coursera, Udemy).

| Field Name | Type | Attributes / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `String` | `@id`, `@default(cuid())` | Unique course identifier. |
| `user_id` | `String` | | Foreign key referencing `User.id`. |
| `name` | `String?` | | Title of the online course. |
| `platform` | `String?` | | Hosting platform provider. |
| `status` | `String?` | | e.g. `not_started`, `in_progress`, `Completed`. |
| `progress` | `Int` | `@default(0)` | Completion percentage. |
| `url` | `String?` | | Hyperlink reference. |
| `notes` | `String?` | | Study notes. |
| `extra` | `Json?` | | Free-form key-value metadata. |
| `created_at` | `DateTime` | `@default(now())` | Row creation timestamp. |

---

### 2.6 Model: `Timetable` (Table: `timetable`)
Stores slot timetables and weekly class matrices.

| Field Name | Type | Attributes / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `String` | `@id`, `@default(cuid())` | Unique timetable identifier. |
| `user_id` | `String` | | Foreign key referencing `User.id`. |
| `semester` | `Int` | `@default(1)` | Corresponding semester number. |
| `schedule` | `Json` | `@default("{}")` | Map of weekly schedules (e.g. Monday slots array). |
| `periods` | `Json?` | | Configured period slots. |
| `updated_at` | `DateTime` | `@default(now())`, `@updatedAt`| Row modification timestamp. |

---

### 2.7 Model: `UserPreference` (Table: `user_preferences`)
Handles application configs (e.g. google drive token, theme states).

| Field Name | Type | Attributes / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `String` | `@id`, `@default(cuid())` | Unique preference row identifier. |
| `user_id` | `String` | `@unique` | Foreign key referencing `User.id`. |
| `preferences` | `Json` | `@default("{}")` | Key-value settings dictionary. |
| `updated_at` | `DateTime` | `@default(now())`, `@updatedAt`| Preference update timestamp. |

---

### 2.8 Model: `UserBackup` (Table: `user_backups`)
Handles secure automated backups.

| Field Name | Type | Attributes / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `String` | `@id`, `@default(cuid())` | Unique backup identifier. |
| `user_id` | `String` | | Foreign key referencing `User.id`. |
| `backup_type` | `String` | `@default("pre_delete_auto")`| System-labeled type (e.g. `pre_import_auto`). |
| `data` | `Json` | `@default("{}")` | Hashed/secure backup data payload. |
| `created_at` | `DateTime` | `@default(now())` | Creation date. |
| `expires_at` | `DateTime` | | Deletion schedule timestamp. |

---

### 2.9 Model: `SystemLog` (Table: `system_logs`)
Tracks user logs and system heartbeats.

The activity screen requests seven events initially and seven more per explicit **Load more activity** action. The API normalizes timezone-less Prisma timestamps against the independent UTC creation time embedded in classic CUID event IDs, while UUID events written atomically with PostgreSQL `CURRENT_TIMESTAMP` remain unchanged. The same normalization is applied to session activity/expiry values, backup times, and activity timestamps supplied to the AI context; the browser performs only the final conversion to the device timezone. Calendar attendance dates remain date-only strings and are never passed through this instant-time conversion.

| Field Name | Type | Attributes / Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `String` | `@id`, `@default(cuid())` | Unique system log entry identifier. |
| `user_id` | `String` | | Foreign key referencing `User.id`. |
| `action` | `String` | | Log action title. |
| `description`| `String` | | Detailed activity explanation. |
| `ip` | `String?` | | Client IP registry. |
| `user_agent` | `String?` | | Client user agent registry. |
| `timestamp` | `DateTime` | `@default(now())` | Activity occurrence date/time. |

Settings shows the latest 100 activity events with second-level local display time and the full unique event ID. Users can explicitly refresh the history; a failed refresh preserves the last successfully loaded records and reports the failure instead of presenting an empty history.

Practical and assignment tracker changes update the existing `Subject` JSON and create the corresponding `SystemLog` in one atomic PostgreSQL statement. Submitted-to-unsubmitted transitions therefore do not create duplicate subject records. A compare-on-`updated_at` guard rejects stale concurrent clients with HTTP `409`; because the log shares the statement, a rejected state change cannot leave behind a false activity event. Identical no-op updates return the authoritative subject without creating an activity record. The server generates a unique event ID and PostgreSQL generates its timestamp.

---

## 3. Key Architectural Workflows

### 3.1 ☁️ Google Drive Sync
Users can authenticate with Google Drive to back up their data. The backend connects directly to Google APIs using OAuth tokens to perform `multipart/related` file uploads inside Google Drive's private sandbox folder (`appDataFolder`). The system retains the 5 most recent backups and automatically cleans up older files.

### 3.2 🔑 Cryptographic Account Migration
Semester enables seamless data migrations. The source user initiates migration, generating a cryptographically-signed token containing their user ID and expiration date.
The destination account submits this token. The backend verifies the signature, initiates safety backups for both accounts, wipes the destination data, transfers the source records, updates the destination profile fields, and deletes the source user account.

### 3.3 🤖 LLM Failover In Semester Assistant
The AI Semester Assistant uses a Groq LLM (`llama-3.3-70b-versatile`) to generate query completions. In the event of rate limit errors or API timeouts, it falls back to a Google Gemini API (`gemini-2.5-flash`) stream.

The context builder is scoped to the semester selected in the UI (or the user's current semester when none is supplied). Attendance logs, subject totals, medical-leave counts, timetable selection, and pending-class checks use that same semester; it never falls back to another semester's timetable. Today's logs are queried independently rather than inferred from a limited recent-log list. Pending attendance uses the block-aware identity described below, and all “today” calculations use an explicitly supplied `Asia/Kolkata` date.

The assistant receives official attendance and the medical-as-absent scenario as separately labelled metrics, exact practical/assignment progress and submission state, today's bulk-mark eligibility, and recent activity IDs with UTC timestamps. Its prompt is read-only: it may explain UI actions but cannot claim to mutate data. It must not claim grades, SGPA, CGPA, or academic-strength data unless exact values are present in context.

### 3.4 Timetable Attendance Blocks

`GET /api/attendance/classes-for-date` sorts the selected day's full timetable and assigns class slots to attendance blocks. A class continues the previous block only when the immediately preceding timetable slot is also a class with both the same subject and the same slot type. Breaks and custom slots therefore end a block.

For example, a schedule of `Mathematics, Mathematics, Physics, Mathematics` produces three markable blocks: the first two Mathematics periods share one mark, Physics has one mark, and the later Mathematics period has its own mark. The API returns `attendance_type` for each scheduled row, and the frontend sends that value to `POST /api/attendance/mark` as the record's `type`.

The classes-for-date response matches block-aware logs by this exact identity. Older records that only contain a legacy type such as `Lecture` remain supported and are assigned sequentially to compatible consecutive blocks. Optimistic marking, editing, and deletion in `AttendanceModal` use the same block identity, preventing one occurrence from changing another occurrence of the same subject on the same date.

### 3.5 Bulk Attendance Marking

The three-dot action on the `Scheduled Classes` strip applies Present, Absent, Medical Leave (`approved_medical`), or Cancelled to every scheduled attendance block. Substitution is intentionally excluded because each substituted class requires an explicit replacement subject.

The client sends every block identity to one bulk endpoint. Row actions are disabled while it runs, and the modal reloads server data after completion. The operation never edits existing marks and never permits a partially successful batch.

The modal treats loaded logs as date-scoped authoritative state. It clears records immediately when the date changes, ignores stale responses from earlier requests, and disables all attendance mutations until logs for the exact selected date load successfully. A failed mutation is not automatically repeated: because the server may have committed before the response was lost, the modal reloads both logs and scheduled classes and reports the reconciled state. A visible retry action and automatic reload on browser reconnection recover from temporary connectivity failures without risking duplicate writes.

Bulk marking has a stricter empty-date contract: if any attendance record exists for the selected date and semester, all bulk status choices are disabled and the user is directed to **Unmark all** first. `POST /api/attendance/mark-all` repeats that check server-side and performs eligibility validation, all log inserts, subject-counter changes, and its system activity event in one PostgreSQL statement. Concurrent or stale requests therefore fail without partially marking the date or overwriting existing records.

New records receive their creation timestamp from PostgreSQL without accepting a client-provided timestamp. Updating an existing individual mark preserves its original attendance-log creation timestamp; a separate system activity entry records the edit event and its time.

`POST /api/attendance/unmark-all` has different safety requirements because deletion affects counters and substitution companions. The frontend snapshots the explicit database IDs currently shown under `Marked Records` and sends those IDs with the selected date and semester. The backend never selects records by creation timestamp or timetable inference. A single PostgreSQL data-modifying CTE verifies ownership, exact date, and semester membership; expands required substitution companion records; deletes the deduplicated set; and applies per-subject counter deltas once. If any requested ID is stale or outside that scope, the guarded delete affects zero rows and the API returns `409 STALE_ATTENDANCE`. The entire operation therefore commits completely or leaves every record and counter unchanged.

### 3.6 Attendance Status and Percentage Rules

The status counters are centralized in `api-node/src/utils/attendanceStatus.ts`:

| Status | Included in conducted total | Included as attended |
| :--- | :---: | :---: |
| `present`, `late`, `duty`, `substituted` | Yes | Yes |
| `medical`, `approved_medical` | Yes | Yes (official metric) |
| `absent` | Yes | No |
| `cancelled` | No | No |

The dashboard's primary percentage is the official metric:

`official attendance = total attended / total conducted classes`

The smaller conservative metric keeps medical leaves in the conducted denominator but treats them as not attended:

`medical as absent = (total attended - medical leave count) / total conducted classes`

Both `medical` and `approved_medical` are subtracted. The count is derived from all matching semester logs, including legacy logs whose semester is resolved through their subject. Cancelled classes remain outside both formulas because they were not conducted. The AI assistant receives both values with explicit labels.

### 3.7 Calendar Indicators and Local Dates

Calendar day cells display up to six compact log indicators in stored log order. Present uses the theme foreground colour, Absent red, Medical Leave blue, Cancelled slate, and Substitution violet; other supported attended states fall back to orange. The legend uses the same mapping.

The floating radial navigation displays one centred page-name label above the expanded fan. It defaults to the current route and updates as the pointer focuses another bubble; individual bubbles remain icon-only to keep the compact layout uncluttered. Labels mirror each destination's primary page name exactly, including **Practicals & Assignments**.

Dashboard summary cards use natural content height on the desktop grid. A long daily timetable can therefore expand independently without stretching the attendance-health and academic-target cards into large empty panels.

Frontend attendance and course date defaults use `formatLocalDate` (`YYYY-MM-DD` from local calendar components) rather than slicing a UTC ISO timestamp. This prevents late-night or early-morning actions from being assigned to an adjacent date because of timezone conversion.
