---
name: refcheck-test-and-deploy
description: Guides build compilation, PDFKit report generation verification, and JWT auth route testing for the Reference Check Portal.
---

# Reference Check Portal Test and Deploy Skill

Use this skill when modifying the reference portal code, JWT security rules, Airtable queries, or PDF reports template generation.

## 1. Verify Build & Compilation
Verify that the React frontend client and Express backend compile correctly without errors:
```bash
npm run build
```
Verify the output files are correctly created in `dist/`.

## 2. PDF Report Compilation Check
If modifying `pdfkit` report templates (used for compiling reference responses into PDF files):
1. Test PDF generation endpoint locally or via script to verify that fonts and page heights are rendered without overflows.
2. Verify that `pdfkit` is correctly imported and utilized inside routes.

## 3. JWT & Google Cloud SQL Database Connection
*   Verify that Cloud SQL PostgreSQL credentials (`DATABASE_URL`) are configured in `.env` pointing to `34.151.99.147`.
*   Ensure authentication JWT signatures use the secure `JWT_SECRET` generated during startup.
*   Verify that user and candidate queries operate via `server/services/dbService.ts`.

## 4. GCP Cloud Run Deployment (Render is Cut Off)
*   **GUARD RAIL**: Render is completely deprecated and cut off. Do NOT deploy to Render or reference Render configs under any circumstances.
*   Deploy exclusively to Google Cloud Run in project `agent-os-shared-497623` (region `australia-southeast1`) using `./deploy-gcp.sh`.
*   Verify Cloud Run service name is `refcheck`.
*   Ensure changes are pushed to `https://github.com/wayne922/refcheck.git`.
