# RefCheck Portal - Project State & Architecture Ledger

## Active Environment & Production Deployment
- **Cloud Run Target**: `refcheck` on project `agent-os-shared-497623` (`australia-southeast1`, Sydney).
- **Production URL**: `https://refcheck-bx6vloyj4a-ts.a.run.app`
- **Database Core**: Google Cloud SQL PostgreSQL `34.151.99.147` managing universal document table `refcheck_records` (co-located in Sydney for sub-5ms internal latency).
- **Automated CI/CD**: Cloud Build triggers automatically on `git push origin main`. Manual `gcloud builds submit` or `gcloud run deploy` is NOT required.
- **Strict Invariant**: Render is completely cut off. Never deploy to Render or reference `*.onrender.com`.

## Core Features & Workflows
1. **Manual Phone Reference Check Workflow**:
   - `GET /api/referees/:id/phone-details` & `POST /api/referees/:id/phone-complete`.
   - Live call timer, telephone dialer, verbal consent confirmation, recruiter attribution, and dynamic question rendering.
   - Bypasses IP fraud check; displays verified Phone Interview badge in UI and PDF exports.
2. **Compact Vetting Links & Token Architecture**:
   - Primary compact routes: `/r/:token` (referee questionnaire) and `/c/:token` (candidate nomination).
   - Route aliases: `/verify/:token`, `/reference/:token`, `/nominate/:token`, `/candidate/:token`.
   - Token Generator: `generateShortToken(6)` generating unambiguous 6-character Base58 tokens (38B+ combinations).
   - Frontend `getBaseUrl()` canonical resolver preventing `localhost` link leakage when tested locally.
3. **Responsive HTML Email Templates with 1-Click Action Buttons**:
   - SendGrid emails render clean, high-trust Candidex action buttons ("Complete Reference Check", "Nominate Referees"), hiding raw URLs.

## Project Memory Ledger
- `features/phone-references`: Recruiter phone interview architecture, data model, and compliance rules.
- `features/reference-vetting-links`: Token generation, route aliases, action buttons, and frontend URL resolvers.
- `global/pitfalls/gcp-cloud-run-domain-mappings`: Regional Cloud Run domain mapping limitations in Sydney (`australia-southeast1`) and zero-latency routing strategies.
- `global/architecture/cloud-run-postgres-architecture`: Production GCP infrastructure, database co-location, and CI/CD rules.
