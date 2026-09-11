# RefCheck Staged Learnings Ledger

Autonomous technical friction and preventive guard rails logged by the `task-observer` skill for `refcheck`.

### [2026-09-11 12:20] Verification Guard: Pre-Deploy Build & Verification Gate
* **Target**: `deploy-gcp.sh`, `server/routes.ts`, `client/src/pages/Candidates.tsx`
* **Rule**: All deployments must pass `npm run build` (Vite build + TypeScript compilation `exit code 0`) before source deployment to Google Cloud Run.
* **Status**: Implemented & Verified
