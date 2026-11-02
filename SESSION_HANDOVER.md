# Course Rep Management System V2 — Session Handover & State Memory

> **Instructions for the New Chat Agent:**
> Read this entire handover file carefully before performing any action. All context, standing rules, completed phases, active code changes, and immediate next steps are preserved here.

---

## 1. Standing Mandatory Rules (Never Violate)

1. **Rule 1 (Strict Planning & Approval):**
   > *"ALWAYS PLAN YOUR IMPLEMENTATION AND ASK FOR APPROVAL BEFORE WRITING A SINGLE LINE OF CODE, AND AFTER IMPLEMENTATION, PROVIDE A REPORT ON WHAT YOU DID. ALERT: KEEP THIS RULE IN YOUR MEMORY."*
   - Never touch code or create feature files without first creating the phase plan artifact, setting `RequestFeedback: true`, and waiting for explicit user approval.
   - After each phase is verified and committed, produce a detailed `phase-X-report.md` artifact.

2. **Rule 2 (Test Coverage & Git Commit Policy):**
   > *"ON EVERY COMPLETED FEATURE, PROVIDE COMPREHENSIVE UNIT TESTS FOR THE FEATURE HAVING AT LEAST 98% COVERAGE, AND COMMIT EVERY COMPLETED FEATURE TO GIT. SAVE THIS EVERY MAKE SURE IT IS EXECUTED THEN WE CAN PROCEED TO THE NEXT PHASE."*
   - Every completed phase must achieve $\ge 98\%$ statement, branch, function, and line coverage via `pnpm test:cov`.
   - Every phase must be committed to Git with a semantic commit message before proceeding to plan the next phase.

---

## 2. Environment & Project Infrastructure

- **Project Root Directory:** `C:\Users\STYLES\Projects\Course Rep Management`
- **NestJS V2 Backend Directory:** `C:\Users\STYLES\Projects\Course Rep Management\V2`
- **Legacy V1 Express/Sequelize Directory:** `C:\Users\STYLES\Projects\Course Rep Management\course-rep-management-system`
- **Package Manager:** `pnpm` (Corepack / Node v22.x)
- **PostgreSQL Database:**
  - Docker container: `postgres`
  - Host Port: `5433` (`-p 5433:5432`)
  - Database Name: `course-rep-management-system`
  - Credentials: `postgres` / `postgrespassword`
- **Redis Cache & Queue:**
  - Docker container: `redis`
  - Host Port: `6379`
- **Server Port:** `5000` (API base: `http://localhost:5000/api`)
- **Important Dependency Note:**
  - `@nestjs/passport` is pinned to `11.0.5` and `@nestjs/jwt` is pinned to `11.0.2` (v12 packages use ESM-only builds that break Jest CommonJS runner in NestJS 11).
- **Workspace Directory Note:**
  - Always ensure the working directory is `C:\Users\STYLES\Projects\Course Rep Management\V2` (or `C:\Users\STYLES\Projects\Course Rep Management`) so Windows commands execute without directory mismatch errors.

---

## 3. Progress Summary & Git History

```text
2fd0f1c (HEAD -> master) feat(course): course catalog, lecturer association, and transactional student enrollment
52688c3 feat(lecturer): faculty management with rep-only mutations and redis caching
cfdc023 feat(student): student profile management and rep administrative directory
510651e feat(auth): jwt authentication, token rotation, and redis verification
c504cd7 feat(core): project scaffolding, typeorm, redis cache manager, and global filters
```

- **Phase 1 (Core Scaffold, Redis, Filters & Interceptors):** Complete (100% test coverage).
- **Phase 2 (JWT Auth & Token Rotation):** Complete (100% test coverage).
- **Phase 3 (Student Profile & Rep Directory):** Complete (100% test coverage).
  - *User Decision:* Students contact the course rep if their profile details need updating.
- **Phase 4 (Lecturer Management):** Complete (100% test coverage, 13/13 live integration tests).
- **Phase 5 (Course Management & Student Enrollment):** Complete (100% test coverage across 209 unit tests, 22/22 live integration tests).

---

## 4. Current Phase: Phase 6 (Google Drive Integration & File Engine)

### What Has Already Been Built in Phase 6:
1. **GoogleToken Entity:** [`src/modules/google/entities/google-token.entity.ts`](file:///C:/Users/STYLES/Projects/Course%20Rep%20Management/V2/src/modules/google/entities/google-token.entity.ts) mapped to PostgreSQL table `google_tokens`.
2. **EncryptionService:** [`src/modules/google/services/encryption.service.ts`](file:///C:/Users/STYLES/Projects/Course%20Rep%20Management/V2/src/modules/google/services/encryption.service.ts) providing AES-256-GCM authenticated encryption/decryption with SHA-256 key derivation.
3. **GoogleAuthService:** [`src/modules/google/services/google-auth.service.ts`](file:///C:/Users/STYLES/Projects/Course%20Rep%20Management/V2/src/modules/google/services/google-auth.service.ts) managing OAuth2 lifecycle, Redis CSRF state tokens, token encryption, and auto-refresh.
4. **GoogleDriveService:** [`src/modules/google/services/google-drive.service.ts`](file:///C:/Users/STYLES/Projects/Course%20Rep%20Management/V2/src/modules/google/services/google-drive.service.ts) implementing Drive query injection protection (`escapeDriveQuery`), HTTP header sanitization (`sanitizeFileName`), folder creation, recursive search, and streaming download.
5. **CreateFolderDto:** [`src/modules/google/dto/create-folder.dto.ts`](file:///C:/Users/STYLES/Projects/Course%20Rep%20Management/V2/src/modules/google/dto/create-folder.dto.ts).
6. **GoogleController:** [`src/modules/google/google.controller.ts`](file:///C:/Users/STYLES/Projects/Course%20Rep%20Management/V2/src/modules/google/google.controller.ts).
7. **GoogleModule:** [`src/modules/google/google.module.ts`](file:///C:/Users/STYLES/Projects/Course%20Rep%20Management/V2/src/modules/google/google.module.ts) registered in `AppModule`.
8. **Compilation Verified:** `pnpm build` exited with code 0.
9. **Live Integration Tests:** 11/11 tests passed in [`scratch/test-phase6.js`](file:///C:/Users/STYLES/.gemini/antigravity/brain/1dc1657c-5c2c-4786-b693-a67f52a8df71/scratch/test-phase6.js).
10. **Comprehensive Unit Tests Written:**
    - [`src/modules/google/services/encryption.service.spec.ts`](file:///C:/Users/STYLES/Projects/Course%20Rep%20Management/V2/src/modules/google/services/encryption.service.spec.ts)
    - [`src/modules/google/services/google-auth.service.spec.ts`](file:///C:/Users/STYLES/Projects/Course%20Rep%20Management/V2/src/modules/google/services/google-auth.service.spec.ts)
    - [`src/modules/google/services/google-drive.service.spec.ts`](file:///C:/Users/STYLES/Projects/Course%20Rep%20Management/V2/src/modules/google/services/google-drive.service.spec.ts)
    - [`src/modules/google/google.controller.spec.ts`](file:///C:/Users/STYLES/Projects/Course%20Rep%20Management/V2/src/modules/google/google.controller.spec.ts)

---

## 5. Immediate Next Steps to Continue in the New Chat

When opening the new chat, paste:
> *"Continue from SESSION_HANDOVER.md. Complete Phase 6 unit tests verification, commit to Git, produce Phase 6 report, and then plan Phase 7."*

The agent must immediately execute the following exact steps:
1. **Run Unit Tests & Verify $\ge 98\%$ Coverage:**
   ```bash
   cd "C:\Users\STYLES\Projects\Course Rep Management\V2"
   pnpm test:cov
   ```
   Ensure all tests pass and coverage is $\ge 98\%$.
2. **Git Commit Phase 6:**
   ```bash
   git add .
   git commit -m "feat(drive): encrypted oauth2 vault, google drive bridge, and injection-safe file streaming"
   ```
3. **Produce Deliverable Report:**
   Write artifact `phase-6-report.md` detailing the security fixes, live test results, coverage table, and git commit SHA.
4. **Plan Phase 7 (Strict Rule 1 Compliance):**
   - Write artifact `phase-7-plan.md` with `RequestFeedback: true` detailing:
     - Course Slides & Material Distribution Feature (entities `Slides`, relations with `Course`, file upload/stream via Google Drive, Redis caching).
   - Ask for user approval before writing any code for Phase 7.

---

## 6. Full 15-Phase Master Plan Roadmap

1. **Phase 1:** Core Scaffolding, TypeORM, Redis & Global Interceptors *(Completed)*
2. **Phase 2:** Authentication, JWT Rotation & Blacklist *(Completed)*
3. **Phase 3:** Student Management & Administrative Directory *(Completed)*
4. **Phase 4:** Lecturer Management *(Completed)*
5. **Phase 5:** Course Management & Transactional Enrollment *(Completed)*
6. **Phase 6:** Google Drive Integration & File Engine *(Finishing up)*
7. **Phase 7:** Course Slides & Material Distribution
8. **Phase 8:** Assignment Management & Tracking
9. **Phase 9:** Events, Calendar & Timetable
10. **Phase 10:** Attendance Sessions & Real-time Verification
11. **Phase 11:** Study Groups & Peer Collaboration
12. **Phase 12:** Feedback Submissions & Admin Resolution
13. **Phase 13:** Push Notifications (Firebase FCM) & Device Management
14. **Phase 14:** Background Queues (BullMQ / Redis) & Custom Email Engine
15. **Phase 15:** Security Hardening, Audit Logs & Performance Benchmarking

