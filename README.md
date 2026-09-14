<p align="center">
  <img src="frontend/public/Semester-logo.png" alt="Semester Logo" width="140" />
</p>

# Semester — Your Academic Operating System

Semester is a high-performance, full-stack Academic Operating System designed for college students. It provides real-time attendance compliance tracking, target analysis, and interactive AI study assistance inside a premium dark-themed PWA container.

---

## 🚀 Key Features

- 📅 **Timetable & Attendance Log**: Plan weekly slots and record classes with substitution/cancellation support. Consecutive periods of the same subject share one smart attendance mark, while a later occurrence after another class is tracked separately.
- 📊 **Target Compliance & Bunk Guard**: Dynamic compliance indicators showing how many classes you can bunk or must attend to stay above your target percentage.
- 🤖 **Semester Assistant**: Contextual study chat assistant powered by Groq LLM with automatic failover to Google Gemini.
- 💾 **Google Drive Auto-Sync**: Auto-backup and sync academic data to your private Google AppData folder.
- 🔑 **Account Migration**: Cryptographically signed migration tokens to easily transfer data to another account.

---

## 📂 Project Structure

Semester is structured as a monorepo:
- **`frontend/`**: React + TypeScript + Vite Single Page Application (PWA).
- **`api-node/`**: Node.js + Express + Prisma + Neon PostgreSQL API backend.

---

## 🔑 Environment Setup

### Backend (`api-node/.env`)
```env
DATABASE_URL="postgresql://..."
JWT_SECRET="your_jwt_secret"
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
GROQ_API_KEY="your_groq_api_key"
GEMINI_API_KEY="your_gemini_api_key"
PORT=5001
NODE_ENV=development
```

### Frontend (`frontend/.env`)
```env
VITE_API_BASE_URL="http://localhost:5001"
VITE_GOOGLE_CLIENT_ID="your_google_client_id"
```

---

## 🛠️ Quick Start

You can run the entire workspace concurrently from the root directory:

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Sync Database Schema**:
   ```bash
   cd api-node
   npx prisma db push
   cd ..
   ```

3. **Start Development Servers**:
   ```bash
   npm run dev
   ```
   * Frontend will start on `http://localhost:5173`
   * Backend API will start on `http://localhost:5001`
   * The root startup command waits for `/api/health` before starting Vite, preventing temporary proxy connection errors while the API boots.

---

## 🧪 Testing

Run the fast, database-free quality checks from the repository root:

```bash
npm test
npm run lint
npm run build
```

Or run the same complete local gate used by continuous integration:

```bash
npm run quality
```

The unit tests cover attendance status rules, attendance and grade calculations, timetable compatibility and ordering, and local calendar-date formatting.

The following backend integration scripts require a configured test database. They create isolated sentinel records and clean those records after the run:

Run the attendance backend test suite to verify DB connectivity, all attendance marking statuses, counter logic, duplicate detection, substitution flow, and query filters — without touching any real data:

```bash
cd api-node
npx tsx scripts/test-attendance.ts
npm run test:tracker-activity
npm run test:bulk-attendance
```

> All test data is created under a sentinel semester (`99`) with dates in year `2000` and is fully cleaned up after the run.

The tracker activity test performs a real submitted-to-unsubmitted database round trip. It verifies that one subject row is updated, each committed transition has a unique server-timestamped event, and a stale concurrent write creates neither a state change nor a duplicate activity row.

The frontend and API lint checks can also be run separately with `npm run lint:frontend` and `npm run lint:api`. Database integration scripts are intentionally not part of the default CI gate because CI has no authenticated test database. The current cleanup status and known verification limits are recorded honestly in [logs.md](logs.md).

---

## Attendance Workflow

- Mark each scheduled attendance block individually, or use the three-dot **Mark all** menu for Present, Absent, Medical Leave, or Cancelled. **Unmark all** atomically clears only the exact Marked Records loaded for the selected date and semester. Substitution remains an individual marking action because it requires selecting a replacement subject.
- Bulk marking is available only when the selected date has no marked records. If even one record exists, use **Unmark all** first; the API independently enforces the same rule and applies the complete bulk mark atomically.
- Attendance controls remain locked until the selected date's Marked Records are verified. Failed or lost mutation responses trigger a server reload, and reconnecting automatically retries record loading; writes are never blindly repeated.
- Consecutive periods of one subject share a mark, while a later occurrence after another timetable slot remains independently markable.
- The dashboard shows official attendance and a conservative **Medical as absent** percentage for leaves that have not yet been accepted.
- Calendar colours distinguish Present, Absent, Medical Leave, Cancelled, and Substitution records.
- Semester Assistant uses the selected semester, understands block-based pending attendance, and keeps official and medical-as-absent percentages clearly separated.

---

## Code quality

Every push and pull request runs lint, the database-free unit suite, and both production builds through [the quality workflow](.github/workflows/quality.yml). See [CODE_QUALITY_PLAN.md](CODE_QUALITY_PLAN.md) for the practices behind the checks and [logs.md](logs.md) for the plain-language change record and current validation evidence.
