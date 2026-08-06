---
name: reference-fraud-detection-rules
description: Details reference check fraud detection heuristics, including IP validation, domain mismatches, and fast submission triggers.
---

# Reference Fraud Detection Rules Skill

Use this skill when auditing referee responses, modifying the reference submission form routes, or altering safety verification thresholds.

## 1. Fraud Detection Heuristics (server/services/fraudDetection.ts)
The portal runs automated compliance audits on every submission using three primary rules:
1.  **Shared IP Check**: Compares candidate's submission IP address with referee's submission IP address. If identical, triggers `shared_ip` flag.
2.  **Domain Mismatch Check**: 
    *   Excludes standard personal domains (gmail, hotmail, outlook, xtra.co.nz, etc.).
    *   Compares company email brand domain name with candidate's stated employer name. If they do not match, and referee claims to be a Manager/Director, triggers `domain_mismatch` flag.
3.  **Fast Completion Check**: Audits total time duration to submit. If submission took less than 90 seconds, triggers `fast_completion` flag.

## 2. Verification in Code
Ensure any new endpoints or questions run through the main verification function:
```typescript
import { detectFraud } from "./services/fraudDetection";
```
Always save resulting flag arrays and details JSON blocks directly to the Airtable candidate record schema to flag the entries for review in the dashboard.
