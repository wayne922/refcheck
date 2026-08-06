# Reference Check Portal - Custom Agent Rules

This file contains custom developer rules and architecture guidelines for the Reference Check Portal project.

## Technology Stack & Core Libs
- **Frontend**: React 18 (Vite-based), Wouter for routing.
- **Backend**: Express (v4.x) running under TypeScript/tsx.
- **Database / API Core**: Airtable API (`airtable` JS client) as primary database, integrated via services.
- **Integrations**: OpenAI API for AI evaluations, PDFKit (`pdfkit`) and `pdf-parse` for PDF reports creation/parsing.
- **Styling**: Tailwind CSS (v3.x), Lucide React icons, Clsx.

## Project Structure & Architecture
- **Client**: Located in [client/](file:///Users/waynesullivan/Documents/antigravity/reference-portal/client). Ensure all React frontend views and components go here.
- **Server**: Located in [server/](file:///Users/waynesullivan/Documents/antigravity/reference-portal/server). Express configurations and endpoints are set in [server/index.ts](file:///Users/waynesullivan/Documents/antigravity/reference-portal/server/index.ts).
- **Services**: Located in [server/services/](file:///Users/waynesullivan/Documents/antigravity/reference-portal/server/services). Contains modules for Airtable, Gemini/OpenAI models, emails, and SMS.
  - [airtable.ts](file:///Users/waynesullivan/Documents/antigravity/reference-portal/server/services/airtable.ts) encapsulates Airtable base operations and user/candidate queries.

## Development Practices
1. **Security & Authentication**: Ensure strict endpoint authentication using JWT middleware. Check token claims against role configurations using the `requireRole` middleware.
2. **Data Model Updates**: Schema definition changes are applied through Airtable base tables. Update service queries in [airtable.ts](file:///Users/waynesullivan/Documents/antigravity/reference-portal/server/services/airtable.ts) to match schema updates.
3. **Type Safety**: Strictly adhere to TypeScript. Run `npm run build` or compile with `tsc` to verify code correctness before proposing changes.
4. **PDF Reports**: Use PDFKit within the Express routes to render reference reports on the fly.
