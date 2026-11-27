# Semester — Architecture & Technical Documentation

Semester is a local-first, cross-platform academic workspace for **Windows Desktop** (Tauri v2 + React + Rust) and **Android** (Jetpack Compose + Kotlin + Rust via UniFFI).

Website & Downloads: [https://kuberbassi.github.io/semester/](https://kuberbassi.github.io/semester/)

---

## 1. Repository Layout

| Directory | Role |
| :--- | :--- |
| `semester-core/` | Shared Rust library (`v0.2.0`): SQLite WAL workspace schema, medical-adjusted attendance math, bunk guard, 4-tier GGSIPU credit resolver, IPU ExamWeb parser, compact `SEMQR2` timetable QR codec, and lossless CRDT 2-way sync merge. |
| `src-tauri/` | Native Windows Desktop Tauri v2 host: SQLite engine, Windows DPAPI secret encryption, localhost loopback PKCE Google Drive sync, live IPU ExamWeb session client, and offline/BYOK AI assistant. |
| `frontend/` | React 19 + TypeScript + Vite desktop UI styled with Obsidian Dark & Studio Light themes. |
| `semester-android/` | Native Android app (minSdk 26, targetSdk 35, compileSdk 36): Jetpack Compose 120Hz UI, CameraX + ZXing offline QR scanner, Jetpack Glance home screen widget, AlarmManager schedule/exam alerts, and WorkManager background Drive sync. |
| `docs/` | Static landing & installer download page deployed automatically to GitHub Pages via `.github/workflows/pages.yml`. |
| `.github/workflows/` | Automated CI (`quality.yml`), GitHub Pages deployment (`pages.yml`), and tagged multi-platform releases (`release.yml`). |

---

## 2. Local Data Storage & Safety

- **SQLite WAL Mode**: Both Desktop (`semester_desktop_v2.db`) and Android (`semester_workspace_v2.db`) run SQLite in WAL mode with foreign keys enabled and atomic transactions.
- **Automatic Local Safety Snapshots**: Before any destructive backup import, wipe, or factory reset, a timestamped JSON snapshot is atomically saved inside `safety_backups/` (keeping the 5 most recent snapshots).
- **Empty-Device Sync Protection**: When a fresh/empty device links to Google Drive, it pulls and merges remote state first and never uploads an empty workspace shell or empty rolling backup over existing cloud data.
- **Zero Telemetry**: No analytics servers or third-party databases store student records. Sync lives strictly inside the user's private Google Drive `appDataFolder`.

---

## 3. Attendance & Credit Rules

### Attendance Accounting
- `present`, `late`, `duty`, `substituted`: `+1 attended`, `+1 total`.
- `absent`: `+0 attended`, `+1 total`.
- `approved_medical` / `medical`: Excluded from eligible denominator (`(attended - medical) / (total - medical)`); raw "medical counted absent" percentage is also shown for transparency.
- `cancelled`: `+0 attended`, `+0 total`.
- Attendance marking is intentionally scoped to **Dashboard → Today's Classes** and **Attendance Calendar** (keeping Dashboard subject cards and Timetable clean and unmixed).

### 4-Tier Result Credit Resolver
When computing GGSIPU Ordinance 11 SGPA & CGPA:
1. **Manual override** saved on the Result row (also syncs back to the linked Dashboard subject).
2. **Linked Dashboard subject** matched by canonical subject code, normalized name, or abbreviation.
3. **Explicit portal credits** (when provided by ExamWeb).
4. **Smart fallback** when credits are unavailable:
   - Labs, Practicals, Workshop, Engineering Graphics / Drawing / CAD → **1 credit**
   - NUES, HVPE, Human Values, Ethics, Constitution, UHV → **2 credits**
   - Theory subjects → **3 credits**

### Bidirectional Profile ↔ Results Sync
- Fetching IPU ExamWeb results automatically enriches local profile fields (`name`, `enrollment_number`, `college`, `course`, `branch`, `batch`, `admission_year`, `current_semester`).
- Opening Results Transcript fills any missing metadata from the local profile so both views remain consistent.

---

## 4. Offline Timetable QR (`SEMQR2`)

- Encodes period timings, a deduplicated subject dictionary, and compact slot tuples into a single `SEMQR2:{...}` string.
- Works 100% offline between Windows Desktop and Android via:
  - Built-in **CameraX + ZXing** live camera scanner (zero Play Services module dependency),
  - **Gallery QR image** decoder, or
  - **Copy / Paste** share code.
- Automatically links matching existing subjects or creates missing courses in the target semester.

---

## 5. Verification & Release Pipelines

- **Rust Core tests**: `cargo test --manifest-path semester-core/Cargo.toml`
- **Desktop backend tests**: `cargo test --manifest-path src-tauri/Cargo.toml`
- **Frontend & domain checks**: `npm run quality`
- **GitHub Pages**: Automatic deploy on pushes to `main` touching `docs/**` (`.github/workflows/pages.yml`).
- **GitHub Releases**: Automatic multi-platform build and publish on `v*` tags (`.github/workflows/release.yml`).
