<USER_REQUEST>
Ok I have some more build detail can you crosscheck what we have done and the updated build details and make a plan. RefCheck by Candidex
Developer Handoff Document
Sprint Plan · v2.0 · June 2026 · With Form Builder

Prepared for:
Wayne Sullivan — Founder, Candidex
Location:
New Zealand
Sprints:
10 × 2-week sprints (20 weeks / ~5 months)
Version:
2.0 — With Form Builder SprintClassification: Confidential — Development Team Only

Table of Contents
Executive Summary

User Roles

Airtable Schema

Sprint Plan

4.1 Sprint 1 — Foundation & Auth

4.2 Sprint 2 — Questionnaire / Form Builder (NEW)

4.3 Sprint 3 — Candidate & Referee Management

4.4 Sprint 4 — Referee Questionnaire Engine

4.5 Sprint 5 — Automation & Nudge Engine

4.6 Sprint 6 — Fraud Detection Layer

4.7 Sprint 7 — Reporting & Dashboard

4.8 Sprint 8 — White-Label & Branding

4.9 Sprint 9 — AI Features

4.10 Sprint 10 — FLOCC Integration & Webhooks

Tech Stack Summary

Deployment Notes

1. Executive Summary
RefCheck is a purpose-built SaaS platform for automating the reference checking process for New Zealand and Australian recruitment agencies and employers. It replaces manual email chasing and PDF form distribution with a smart, mobile-first workflow: employers create a candidate record, the system tokenises and dispatches questionnaires to referees via email and SMS, referees complete a structured form on any device without logging in, and a consolidated report is generated automatically.

The platform is scoped exclusively to reference checking — no background screening, no visa monitoring, no psychometric testing. It is designed from the ground up for the NZ/AU market, with a full-featured questionnaire and form builder that lets employers create, manage, and deploy all three form types (questionnaire, candidate form, referee form) from a single interface, pre-built question templates for regulated roles (ECE/childcare, healthcare, trades), fraud-detection heuristics appropriate for that regulatory conte
<truncated 45215 bytes>
form name 'RefCheck' to candidate or referee — use employer's companyName

Branded PDF report header:

Update PDF export (Sprint 7) to include employer logo in header

Report footer: 'Reference check conducted via [brandedSenderName]' — NOT 'RefCheck'

ACCEPTANCE CRITERIA:

Employer uploads logo — appears immediately in dashboard preview

Candidate form shows employer logo and brand colour (navbar/buttons match brand colour)

Referee dispatch email shows employer logo in header and branded sender name in From field

PDF report shows employer logo on cover page

Platform name 'RefCheck' does not appear anywhere in candidate or referee-facing touchpoints

Employer with no branding set sees clean default styling — no broken image placeholders

Estimated Effort: M

SPRINT 9 — AI Features XL
GOAL: Build on the AI question generator foundation from Sprint 2 to deliver two additional AI capabilities: a response summariser that extracts per-competency insights from raw referee text, and advanced anomaly detection (tone inconsistency, copy-paste detection). Add an AI-driven 0–100 risk score per candidate. Note: the AI question generator (POST /ai/generate-questions) is already live from Sprint 2 — this sprint extends and refines the OpenAI integration.

USER STORIES:

As an Employer, I want to see a structured competency summary from each referee's responses so that I can quickly assess a candidate without reading every raw answer.

As an Employer, I want to see a risk score for each candidate based on all available data so that I can prioritise which checks need manual review.

As an Employer, I want to have advanced copy-paste and tone anomaly detection run automatically so that I catch sophisticated fraud that basic heuristics miss.

TECHNICAL TASKS:

OpenAI integration extension (building on Sprint 2 setup):

OpenAI SDK already installed from Sprin
<truncated 11764 bytes>

NOTE: The output was truncated because it was too long. Use a more targeted query or a smaller range to get the information you need.