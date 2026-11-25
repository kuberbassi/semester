# Architecture & Implementation Plan: Semester Native Core (Rust + Kotlin + PC)
## 1. Executive Summary

This plan details the transition of **Semester** from a remote-dependent web application into an **offline-first, cross-platform native suite** powered by a lightweight **Rust Core (~450 lines)**.

### Target Platforms & Strategy
* **Android**: 100% Native Kotlin app (Jetpack Compose) distributed as direct APKs via **GitHub Releases** (skipping Google Play Console fees and reviews).
* **Windows PC**: Lightweight **`.exe`** installer/portable binary using **Tauri v2 + Rust** (skipping costly code-signing certificates via "Run Anyway" SmartScreen).
* **iOS**: **Dropped** (eliminates the $99/year Apple Developer tax, Mac hardware dependency, and App Store gatekeeping).
* **Cost**: **$0 forever**.

---

## 2. High-Level Architecture

```
                       ┌───────────────────────────────────────────────┐
                       │               Shared Rust Core                │
                       │           (crate: semester-core)             │
                       │  • Embedded SQLite (0ms reads)                │
                       │  • Attendance math & "What-If" simulation     │
                       │  • QR timetable compression & parser          │
                       │  • IPU result scraper & PDF parser            │
                       │  • JSON import/export for cloud snapshots     │
                       └───────────────────────┬───────────────────────┘
                                               │
                       ┌───────────────────────┴───────────────────────┐
                       │          UniFFI Interface Bindings            │
                       └───────────────┬───────────────────────┬───────┘
                                       │                       │
                                       ▼                       ▼
                        ┌────────────────────────┐  ┌────────────────────┐
                        │   Android (Kotlin)     │  │   Windows (.exe)   │
                        │  • Jetpack Compose UI  │  │  • Tauri v2 Window │
                        │  • LRA Hardware Haptics│  │  • System Tray     │
                        │  • Live Radar Beacon   │  │  • Global Hotkeys  │
                        │  • Home Screen Widget  │  │  • Local SQLite    │
                        │  • Smart Class Alarms  │  │  • PDF Exporter    │
                        │  • WorkManager Sync    │  │  • QR Sharing      │
                        │  • Google 1-Tap Auth   │  │                    │
                        └──────────────┬─────────┘  └──────────┬─────────┘
                                       │                       │
                                       └───────────┬───────────┘
                                                   │
                                                   ▼
                                 ┌───────────────────────────────────┐
                                 │      Google Drive AppData         │
                                 │    (Hidden 'appDataFolder')       │
                                 │   • Automatic background sync     │
                                 │   • Instant recovery on clear-data│
                                 └───────────────────────────────────┘
```

---

## 3. The Rust Core Specification (~450 Lines Total)

The core is designed to be compact, safe (no `unsafe` blocks, no raw pointers), and easily understandable.

### File Structure
```
semester-core/
├── Cargo.toml
├── uniffi.toml
└── src/
    ├── lib.rs            (~25 lines)  - UniFFI module registration
    ├── models.rs         (~80 lines)  - Structs & Data shapes
    ├── calculations.rs   (~110 lines) - Attendance math, "What-If" simulator & SGPA/CGPA formulas
    ├── db.rs             (~165 lines) - SQLite embedded schema & CRUD operations
    ├── sync.rs           (~80 lines)  - JSON serializer & QR compressed payload encoder
    └── results.rs        (~85 lines)  - IPU table scraper & PDF marks parser
```

### Core Functions Inventory (~21 Total)

#### A. Calculations & Simulations (`calculations.rs`)
1. `calculate_percentage(attended: u32, total: u32) -> f64`
2. `calculate_bunk_guard(attended: u32, total: u32, target: u32) -> BunkGuard`
   * Computes: *"You can safely skip X classes"* or *"Attend next Y classes to recover"*.
3. `calculate_medical_adjusted(attended: u32, total: u32, medical_count: u32) -> f64`
   * Deducts approved medical leave from both numerator and denominator.
4. `get_overall_summary(subjects: Vec<Subject>) -> AttendanceSummary`
   * Calculates overall percentage, safe bunks remaining, and risk level (Safe/Warning/Critical).
5. `simulate_future_attendance(attended: u32, total: u32, future_classes: u32, future_attended: u32) -> f64`
   * **The "What-If" Engine**: Calculates exact trajectory if student skips or attends upcoming sessions.
6. `calculate_sgpa(results: Vec<SubjectResult>) -> f64`
   * Computes weighted SGPA using official IPU credit grade scale (`O:10, A+:9, A:8, B+:7, B:6, C+:5, C:4, P:4, F:0`).

#### B. Local Database Engine (`db.rs` via `rusqlite`)
7. `init_db(db_path: &str) -> Result<Database>`
   * Creates tables (`subjects`, `attendance_logs`, `timetable_slots`, `semester_results`, `notes`).
8. `get_all_subjects() -> Vec<Subject>`
9. `add_subject(name: String, code: Option<String>, target: u32) -> Subject`
10. `update_subject(id: String, name: String, target: u32) -> bool`
11. `delete_subject(id: String) -> bool`
12. `mark_attendance(subject_id: String, status: AttendanceStatus, date: String) -> LogResult`
13. `unmark_attendance(log_id: String) -> bool`
14. `get_attendance_logs(subject_id: String, limit: u32) -> Vec<AttendanceLog>`
15. `get_timetable_for_day(day_of_week: &str) -> Vec<TimetableSlot>`
16. `save_timetable_slot(slot: TimetableSlot) -> bool`

#### C. Cloud Snapshot & QR P2P Sync (`sync.rs`)
17. `export_backup_json() -> String`
    * Dumps full SQLite database to a structured JSON payload for Google Drive.
18. `import_backup_json(json_str: &str) -> Result<SyncStats>`
    * Replaces/merges local SQLite records upon clean install or new device restore.
19. `export_timetable_qr() -> String`
    * Generates a compressed Base64 payload containing all slots and subjects for QR sharing.
20. `import_timetable_qr(qr_payload: &str) -> Result<Vec<TimetableSlot>>`
    * Unpacks scanned QR code into the local timetable in 1 click.

#### D. Results Engine (`results.rs`)
21. `parse_ipu_html(html_str: &str) -> Result<SemesterResult>`
    * Extracts semester marks table, credit weights, and calculates SGPA.

---

## 4. Native Hardware Haptics (Kotlin Android)

Replaces browser Web Audio fallbacks with direct **Linear Resonant Actuator (LRA)** motor control:

```kotlin
// Android Haptic Detent Engine (Apple Watch Crown Emulation)
class HapticCrownEngine(context: Context) {
    private val vibrator = (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator

    // 1. Digital Crown Detent (~7.2° rotary notch while dragging bubble)
    fun crownTick() {
        vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK))
    }

    // 2. Item Focus Detent (Snapping to a subject or page)
    fun focusSnap() {
        vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK))
    }

    // 3. Selection Confirmation (Lifting finger to confirm page choice)
    fun selectionConfirm() {
        vibrator.vibrate(VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK))
    }
}
```

---

## 5. Security & Bulletproof Google Drive Backup

### Data Loss Prevention
1. **In-Place APK Updates**:
   * The APK is signed with a persistent keystore stored in GitHub Secrets.
   * Users download updates from GitHub and tap "Update"—Android **never** wipes local databases on updates.
2. **"Clear All Data" / New Phone Disaster Recovery**:
   * Backups are automatically stored in Google Drive's hidden **`appDataFolder`**.
   * Hidden from the user's regular Google Drive files (prevents accidental manual deletion).
   * Free storage, practically infinite for ~300 KB attendance JSON snapshots.
   * On fresh install: User taps "Sign in with Google", the app pulls `semester_backup.json`, and restores the entire database in under 2 seconds.

---

## 6. IPU Results Integration (Captcha-Relay & Local PDF Extraction)

### Architecture of the Result Pipeline
1. **The Captcha-Relay Flow (Official Portal)**:
   * **Step 1**: User opens "Fetch IPU Results" in Semester.
   * **Step 2**: Semester requests the latest captcha image from IPU (`GetCaptchaImage`) and displays it in a clean modal.
   * **Step 3**: Student types Roll No, Password, and the 4-character captcha.
   * **Step 4**: Semester proxies the login request to IPU, captures the `ASP.NET_SessionId` cookie, and fetches the semester result table.
   * **Step 5**: The Rust parser (`results.rs`) extracts marks, credits, and subject codes, computing SGPA/CGPA.
   * **Step 6**: Saves a **permanent copy** to local SQLite and Google Drive. Even if IPU's portal goes down the next hour, the result is saved forever.

2. **Offline Result PDF Parser (Fallback)**:
   * When IPU servers are crashed during peak traffic, students can download their result PDF once.
   * Drag & drop into Semester: Rust extracts all marks locally in 50ms without hitting any external servers.

---

## 7. Kinetic UI/UX & Craftsmanship Design System

### A. Tactile 1-Tap Attendance Marking
* **Instant Action**: Each class card row has tactile `✓` (Present) and `✕` (Absent) pill buttons:
  * Tapping `✓` springs with a neon emerald pop + haptic tick.
  * Tapping `✕` springs with a soft crimson snap.
  * No confirm button needed for daily flow.
* **Edge-Case Drawer (`...`)**:
  * Tap `...` to reveal specialized options with colored auras:
    * `🔵 Medical Leave` (Clinical cyan)
    * `🟡 Substituted` (Warm amber)
    * `⚪ Cancelled` (Slate gray)
    * `📝 Class Notes` (Micro-memo)
* **Bulk Popover**: "Mark all as Present / Absent / Medical / Cancelled" with glowing halos.

### B. Live Period Progression Radar (Timetable List View)
* **Past Periods**: 50% opacity muted fade with slate dot (eyes naturally skim past).
* **Current Active Period**:
  * **Pulsing radar beacon (`animate-ping`)**: Glowing emerald dot with rippling outer ring.
  * **Breathing border**: `border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]`.
  * **Live Timer Chip**: `[ ⏱️ 24m remaining in class ]`.
* **Future Periods**: Crisp blue dot indicating upcoming classes.

### C. Semester AI Copilot (Jarvis-Like Assistant)
* **Living Aurora Mesh**: Slow-breathing cosmic violet and cyan gradient behind the header.
* **1-Tap Quick Action Glass Chips**:
  * `⚡ Can I safely bunk today?`
  * `🚨 Critical subjects check`
  * `📅 Tomorrow's schedule summary`
  * `🧪 Pending practicals check`
* **Context Badge**: `📍 Context: Semester 3 • 10 Subjects • 33.3% Health`
* **Interactive Chat Cards**: Renders mini status cards with action links instead of walls of plain text.

### D. Practicals & Assignments
* Replace flat calculator `–` / `+` steppers with **liquid fill circular progress rings**.
* Completing a practical (`10/10`) triggers a **haptic chime** and morphs the button into an embossed **"✓ Done"** badge.

### E. Subject Syllabus Blueprint
* Interactive accordion tabs for `UNIT - I`, `UNIT - II`, etc.
* Checkboxes beside topics to mark syllabus completion as teachers progress.

---

## 8. Campus Super-App Killer Features

### 1. P2P Timetable Sharing (QR Code / 6-Letter Code)
* **The Viral College Feature**: One class representative or friend sets up the weekly schedule once.
* Tap **"Share Timetable"** → Generates an instant **QR Code** (or 6-letter room code).
* Classmates point their camera: **all 35 class slots, subject codes, and room numbers populate instantly**.

### 2. Android Home Screen Glanceable Widget (Jetpack Glance)
* Sits cleanly on the Android home screen.
* Displays:
  * **Next Class**: `Data Structures • Room 204 • Starts in 12m`
  * **Subject Health**: `41% (Need 10 classes to hit 60%)`
  * **1-Tap Quick Buttons**: `[ ✓ Present ]` / `[ ✕ Absent ]`—mark attendance without even opening the app!

### 3. The "What-If" Bunk Simulator
* An interactive slider: *"What if I skip next X classes?"*
* Dragging the slider dynamically simulates the percentage trajectory in real-time (`78% ➔ 72% ⚠️ WARNING`).
* Helps students calculate exact exam eligibility before taking leaves or college trips.

### 4. Smart Class Notifications (10 Minutes Prior)
* Automated alert via Android `AlarmManager` 10 minutes before period start:
  * *"Next: Discrete Mathematics in Room 102 (Starts at 10:55 AM)"*
  * *"Attendance is 21%. You cannot afford to skip."*
  * Direct action buttons in notification shade: `[ Mark Present ]` / `[ Skip ]`.

---

## 9. Semester & Year Summary PDF Exporter

Generates a single-page, official-grade vectorized academic report card:
* Official Header: `Semester 3 Academic Summary • Kuber Bassi • HMRITM`
* Overall Attendance with Medical Leave breakdown deductions.
* Full Course Breakdown with credit weights and safe bunks buffer.
* Practicals & Assignments submission receipts.
* Ready to show parents, faculty mentors, or attendance condonation committees.

---

## 10. GitHub Actions CI/CD Pipeline (`release.yml`)

Every git tag push (e.g. `git tag v1.0.0 && git push origin v1.0.0`) triggers an automated build:

```yaml
name: Release Semester Native
on:
  push:
    tags: ['v*']

jobs:
  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install Rust & Android NDK
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-linux-android, x86_64-linux-android
      - name: Build Rust Core via UniFFI
        run: cargo build --release --target aarch64-linux-android
      - name: Build Signed APK
        run: ./gradlew assembleRelease
      - name: Upload APK to Release
        uses: softprops/action-gh-release@v2
        with:
          files: app/build/outputs/apk/release/Semester.apk

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - name: Build Tauri .exe
        run: npm run tauri build
      - name: Upload .exe to Release
        uses: softprops/action-gh-release@v2
        with:
          files: src-tauri/target/release/Semester-Setup.exe
```

---

## 11. Phased Implementation Roadmap

### Phase 1: The Rust Core & UniFFI Bridge (Completed & Verified)
- [x] Initialize `semester-core` Cargo crate with `rusqlite`, `serde`, and `uniffi`.
- [x] Port `calculations.ts` formulas into `calculations.rs` (including SGPA/CGPA and the "What-If" simulator).
- [x] Implement SQLite schema and CRUD methods in `db.rs` with in-memory transaction testing.
- [x] Add `sync.rs` for Google Drive JSON snapshots and compressed QR timetable encoding.
- [x] Add `results.rs` structured marks parser for IPU results.
- [x] Configure UniFFI scaffolding in `src/lib.rs` for Kotlin & Swift bindings.
- [x] Pass 100% of Rust test suite (9/9 unit tests passing in 0.00s).

### Phase 2: Android Native App & Killer Features (Completed & Verified)
- [x] Setup Android Gradle project with Jetpack Compose (`semester-android/`).
- [x] Link compiled Rust core via generated UniFFI bindings (`SemesterCore.kt`).
- [x] Implement the radial bubble menu with native `EFFECT_TICK` crown haptics (`HapticCrownEngine.kt`).
- [x] Build the **Live Period Progression Radar** with pulsing green beacon for active periods (`LivePeriodRadar.kt`).
- [x] Build 1-tap `✓`/`✕` daily attendance marking with instant haptics.
- [x] Build **Android Home Screen Widget** (Jetpack Glance) with 1-tap marking without launching the app (`SemesterGlanceWidget.kt`).
- [x] Build **"What-If" Simulator** slider UI with dynamic color transitions (`WhatIfSimulatorScreen.kt`).
- [x] Implement `WorkManager` for automated background Google Drive snapshots (`GoogleDriveBackupWorker.kt`).
- [x] Set up GitHub Actions workflow (`.github/workflows/release.yml`) for $0 free APK publishing.

### Phase 3: IPU Results & PDF Exporter (Completed & Verified)
- [x] Implement IPU results fetcher modal for official `https://examweb.ggsipu.ac.in/web/login.jsp`.
- [x] Save permanent result records to local SQLite database so records are never lost.
- [x] Re-integrate official vectorized single-page PDF academic summary exporter (`downloadResultsPdf.ts`).
- [x] Restore Tiptap markdown rich-text and todo Notes engine (`Notes.tsx`, `useNotes.ts`).
- [x] Verify frontend build passes with zero TypeScript and bundle errors.

### Phase 4: Desktop Windows .exe (Completed & Verified)
- [x] Initialize Tauri v2 (`src-tauri/`) linking directly to `semester-core` as a local crate.
- [x] Wire Tauri command handlers for percentage, bunk guard, what-if simulator, QR sharing, and IPU scraping.
- [x] Verify `cargo check --manifest-path src-tauri/Cargo.toml` compiles successfully with zero warnings/errors.
- [x] Add automated Windows desktop build job to `.github/workflows/release.yml`.
