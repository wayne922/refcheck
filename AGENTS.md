# RefCheck - Agent Guidelines

## Automated CI/CD & Deployment Rules
- **Live Production Project**: `gen-lang-client-0795662331` (Candidex Education / Sydney `australia-southeast1`).
- **Cloud Build Trigger**: Connected directly to GitHub repo.
- **Git Push Triggers Live Deploy**: Whenever completing changes:
  1. Stage changes: `git add .`
  2. Commit: `git commit -m "..."`
  3. Push: `git push origin main`
- **Do NOT run manual `gcloud builds submit` or `gcloud run deploy`**: Pushing to `main` triggers automated Cloud Build and Cloud Run deployment in the cloud.

## Email & Communication Rules
- **Gmail API Exclusive**: All drafts and emails must be created via the Gmail API (`~/.config/gmail/gmail_cli.py`). Never save drafts to Apple Mail (`Mail.app`).
