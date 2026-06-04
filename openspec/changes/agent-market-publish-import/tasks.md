## 1. Database — Prisma Schema & Repository

- [x] 1.1 Add `PublishedAgent` model to `packages/db/prisma/schema.prisma`
- [x] 1.2 Run `pnpm db:generate` to generate Prisma client
- [x] 1.3 Create `packages/db/src/repositories/market.ts` with CRUD functions: `listPublishedAgents`, `getPublishedAgent`, `createPublishedAgent`, `updatePublishedAgent`, `deletePublishedAgent`, `incrementImportCount`, `listMyPublishedAgents`
- [x] 1.4 Export market repository from `packages/db/src/index.ts`

## 2. Server — Market API Routes

- [x] 2.1 Create `apps/server/src/routes/market.ts` with route handlers:
  - `GET /list` — list published agents (support `q`, `provider`, `tags` query params)
  - `GET /:id/detail` — get published agent detail
  - `POST /publish` — publish agent from contact (validate ownership, snapshot config)
  - `POST /:id/import` — import to user's contacts (clone config, increment count)
  - `PATCH /:id/update` — update description/tags (creator only)
  - `DELETE /:id/unpublish` — delete listing (creator only)
  - `GET /my-listings` — list user's own published agents
- [x] 2.2 Register market routes in `apps/server/src/app.ts` under protected prefix `/api/market`

## 3. Frontend — Market Browse Page

- [x] 3.1 Create `apps/web/app/(market)/market/page.tsx` — market listing page with:
  - Loading/error/empty states
  - Search bar for filtering by name
  - Provider filter tabs (All / Claude / OpenCode / Custom)
  - Agent card list showing name, provider, model, import count, tags
  - Click-to-navigate to market detail page
- [x] 3.2 Create `apps/web/components/MarketAgentCard.tsx` — market-specific agent card component

## 4. Frontend — Market Detail Page

- [x] 4.1 Create `apps/web/app/(market)/market/[id]/page.tsx` — published agent detail with:
  - Loading/error/404 states
  - Agent info display (name, provider, model, system prompt, description, tags)
  - Sidebar info (creator name, import count, publish date)
  - "Import Agent" button with loading state
  - Success toast and redirect after import

## 5. Frontend — Publish Flow

- [x] 5.1 Create `apps/web/components/PublishAgentModal.tsx` — publish modal with:
  - Description textarea (optional)
  - Tags input (optional, comma-separated)
  - Preview of what will be published (agent name, provider, model)
  - Submit/cancel buttons with loading state
- [x] 5.2 Modify `apps/web/app/(market)/agents/[id]/page.tsx` — add "Publish to Market" button (hidden for built-in agents), open PublishAgentModal on click

## 6. Frontend — Tab Integration

- [x] 6.1 Modify `apps/web/app/(market)/agents/page.tsx` — add "Market" tab alongside "All Agents" and "Contacts" tabs, navigating to `/agents/market`

## 7. Internationalization

- [x] 7.1 Add market-related translations to `apps/web/lib/i18n/translations/zh.ts`
- [x] 7.2 Add market-related translations to `apps/web/lib/i18n/translations/en.ts`

## 8. Tests

- [x] 8.1 Write DB repository tests in `packages/db/src/__tests__/market.test.ts`
