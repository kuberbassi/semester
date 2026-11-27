<p align="center">
  <img src="docs/brand-logo.svg" alt="Semester Logo" width="112" />
</p>

<h1 align="center">Semester</h1>

<p align="center">
  <strong>Local-first academic workspace for Windows &amp; Android.</strong><br />
  Track attendance, live timetables, IPU ExamWeb results, practicals, exam dates, and notes — all stored locally on your device with private 2-way Google Drive sync.
</p>

<p align="center">
  <a href="https://semester.kuberbassi.com/"><strong>Official Website &amp; Downloads</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/kuberbassi/semester/releases/latest"><strong>Latest Release</strong></a>
  &nbsp;&middot;&nbsp;
  <a href="DOCUMENTATION.md"><strong>Architecture Docs</strong></a>
</p>

---

## Downloads

Get the latest installers directly from [semester.kuberbassi.com](https://semester.kuberbassi.com/) or [GitHub Releases](https://github.com/kuberbassi/semester/releases/latest):

| Platform | Package | Requirements |
| :--- | :--- | :--- |
| **Windows Desktop** | `Semester_1.0.0_x64-setup.exe` (NSIS) &amp; portable `Semester.exe` | Windows 10 / 11 (64-bit) |
| **Android** | `Semester-v1.0.0-android.apk` (ARM64 + x86_64) | Android 8.0+ (API 26+) |

---

## Key Features

- **Instant Local-First Engine**: Powered by a shared Rust + SQLite (WAL) core (`semester-core`) across Windows and Android — sub-millisecond reads/writes and 100% offline capable.
- **Dashboard & Bunk Guard**: Live liquid attendance gauges, safe-skip / recovery calculations, medical leave adjustments, and slot-ordered **Today's Classes** with real-time period indicators (`Red` done · `Green` active · `Blue` upcoming).
- **Timetable & Calendar Attendance**: Monday–Friday timetable builder with linked course classrooms, Monday–Sunday attendance calendar, Present / Absent / Medical / Substituted (linked to enrolled courses) / Cancelled tracking, and offline **2-Way QR Timetable Share & Camera Scanner**.
- **IPU ExamWeb Results Vault**: Direct `examweb.ggsipu.ac.in` sync with manual CAPTCHA verification, automatic profile linking, smart credit fallback (`Theory = 3`, `Lab / Engineering Graphics = 1`, `NUES / HVPE = 2`), CGPA/SGPA analytics, and printable PDF transcript export.
- **Academic Studio**: Rich notes & checklists with **Exam Mode** (Google-Calendar-style upcoming exam & practical alerts), Practicals/Assignments & Hardcopy tracker, and self-paced Online Courses tracker.
- **Private 2-Way Google Drive Sync**: Syncs conflict-free snapshots directly to your own hidden Google Drive `appDataFolder` with empty-device upload protection and automatic local safety backups.
- **Android Home Screen Widget & Schedule Alerts**: Glanceable live/next class widget with 1-tap marking and clean pre-class & exam reminders.
- **Built-In Local AI + Optional BYOK**: Instant offline academic assistant out of the box, plus optional bring-your-own Gemini or Groq API key encrypted locally.

---

## Repository Structure

```text
semester/
├── semester-core/       # Shared Rust + SQLite workspace, math, IPU parser, QR & CRDT sync engine
├── src-tauri/           # Windows Desktop Tauri v2 backend (SQLite, DPAPI crypto, Drive sync, IPU)
├── frontend/            # React + TypeScript + Vite desktop UI
├── semester-android/    # Native Jetpack Compose Android app (UniFFI Rust bridge, Glance widget, CameraX QR)
├── docs/                # GitHub Pages download & landing site (https://semester.kuberbassi.com/)
├── scripts/             # Android build/deploy helper scripts
├── api-node/            # Legacy web API workspace & shared domain helpers
└── tests/               # Unit quality tests
```

---

## Building From Source

### Prerequisites
- **Node.js 22+**, **Rust stable**, **JDK 21**
- For Android: **Android SDK + NDK** and `cargo-ndk`

### Windows Desktop (Tauri v2)
```powershell
npm install
cargo test --manifest-path semester-core/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
npx @tauri-apps/cli@2 build --bundles nsis
```

### Android Release APK
```powershell
powershell -ExecutionPolicy Bypass -File scripts/android-dev.ps1 build -Release
```

---

## License

Released under the [MIT License](LICENSE).
