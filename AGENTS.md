# AGENTS.md

Guidance for AI coding agents working in this repository.

## 1. Essential Commands

```sh
pnpm install                    # Install dependencies
pnpm dev                        # Start dev server (API + UI, port 3100)
pnpm typecheck                  # Type-check all packages
pnpm build                      # Build all packages
pnpm test                       # Run all Vitest unit tests
pnpm test -- <file-pattern>     # Run a single test (e.g., pnpm test -- issues.test)
vitest run server/src/__tests__/health.test.ts   # Run one specific test file
pnpm test:watch                 # Vitest in watch mode
pnpm test:e2e                   # Playwright E2E tests (opt-in)
pnpm db:generate                # Generate DB migration from schema changes
pnpm db:migrate                 # Apply migrations
```

Full verification before hand-off: `pnpm -r typecheck && pnpm test:run && pnpm build`

## 2. Project Structure

```
server/src/          Express REST API — routes/, services/, middleware/
ui/src/              React + Vite board UI — pages/, components/, hooks/, api/
packages/db/         Drizzle schema, migrations, DB clients
packages/shared/     Shared types, constants, Zod validators, API path constants
packages/adapters/   Agent adapters (@paperclipai/adapter-<name>)
packages/adapter-utils/  Shared adapter utilities
packages/plugins/    Plugin system packages
```

All packages are ESM (`"type": "module"`). Monorepo managed with pnpm workspaces. Scoped as `@paperclipai/*`.

## 3. Code Style

### Formatting (no linter config — follow existing code)

- **2-space** indentation, **double quotes**, **semicolons**, **trailing commas** in multi-line constructs
- **No comments** unless explicitly requested

### Imports

Relative imports **must** include `.js` extension (TypeScript ESM convention):

```typescript
import { badRequest } from "../errors.js";
import { companyService } from "../services/index.js";
```

Import ordering (separated by blank lines):
1. Node built-ins with `node:` prefix: `import { randomUUID } from "node:crypto"`
2. External packages: `express`, `zod`, `drizzle-orm`
3. Workspace packages: `@paperclipai/db`, `@paperclipai/shared`
4. Relative imports with `.js` extension

Use `import type` for type-only imports.

### Naming

| Element | Convention | Example |
|---|---|---|
| Files (server) | kebab-case | `company-skills.ts` |
| Files (UI components) | PascalCase | `IssueRow.tsx`, `Dashboard.tsx` |
| Files (UI hooks/API) | camelCase | `useInboxBadge.ts` |
| DB schema files | snake_case | `activity_log.ts` |
| Test files | `.test.ts` suffix | `health.test.ts` |
| Variables/functions | camelCase | `companyId`, `issueService` |
| Constants | UPPER_SNAKE_CASE | `MAX_ATTACHMENT_BYTES` |
| Types/Interfaces | PascalCase (no `I` prefix) | `Company`, `IssueFilters` |
| Route factories | `<domain>Routes` | `companyRoutes()` |
| Service factories | `<domain>Service` | `companyService()` |

### Types and Validation

- Use `interface` for domain models, `type` for unions/aliases
- Enum-like constants: `as const` array + `(typeof ARR)[number]` derived type
- Zod schemas in `packages/shared/src/validators/`, named `<domain><Action>Schema`
- Derive types: `export type CreateCompany = z.infer<typeof createCompanySchema>`
- API path constants in `packages/shared/src/api.ts` as `API.xxx` entries

### DB Schema (Drizzle)

- TS property names: **camelCase**. SQL column names: **snake_case**
- Primary keys: `id: uuid("id").primaryKey().defaultRandom()`
- Timestamps: `createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()`
- Foreign keys use arrow function: `.references(() => table.id)`
- New tables exported from `packages/db/src/schema/index.ts`

## 4. Server Patterns

### Routes — factory function returning `Router`:

```typescript
export function companyRoutes(db: Db, storage?: StorageService) {
  const router = Router();
  const svc = companyService(db);
  router.get("/", async (req, res) => { ... });
  return router;
}
```

- Validate with `validate(zodSchema)` middleware before handler
- Throw `HttpError` factories from `../errors.js`: `badRequest()`, `forbidden()`, `notFound()`, `conflict()`, `unprocessable()`

### Services — factory function returning object literal:

```typescript
export function companyService(db: Db) {
  return {
    list: async () => { ... },
    getById: async (id: string) => { ... },
  };
}
```

- Multi-table mutations: `db.transaction(async (tx) => { ... })`
- No classes, no DI framework — manual composition passing `db`

### API Conventions

- Base path: `/api`. All endpoints company-scoped.
- Enforce company access checks and actor permissions (board vs agent)
- Activity log entries for mutations; HTTP errors: `400/401/403/404/409/422/500`

## 5. UI Patterns

- **Named exports only** — no default exports. Component name matches filename.
- Props defined as `interface` directly above component
- API clients: object literal with typed methods wrapping central `api` helper
- Data fetching: `@tanstack/react-query` hooks with centralized query keys
- Path alias: `@/` → `ui/src/`. Styling: Tailwind CSS v4, Radix UI, `lucide-react` icons

## 6. Testing

**Vitest** (`describe`/`it`/`expect`). HTTP tests use **supertest**.

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
```

- Server tests in `server/src/__tests__/`
- Mocking: `vi.mock()` for modules, `vi.fn()` for functions, `vi.hoisted()` for mock refs in `vi.mock()`
- Clean up: `vi.clearAllMocks()` in `beforeEach`/`afterEach`

## 7. Cross-Layer Contract Sync

When changing schema/API/types, update **all** impacted layers:

1. `packages/db/src/schema/` — Drizzle schema + exports
2. `packages/shared/src/` — types, constants, validators
3. `server/src/` — routes, services
4. `ui/src/` — API clients, pages, components

## 8. DB Migration Workflow

1. Edit `packages/db/src/schema/*.ts`
2. Export new tables from `packages/db/src/schema/index.ts`
3. `pnpm db:generate` (compiles db package first, then generates migration)
4. `pnpm -r typecheck` to verify

## 9. Key Invariants

- Single-assignee task model, atomic issue checkout
- Approval gates for governed actions, budget hard-stop auto-pause
- Activity logging for all mutating actions
- Agent API keys hashed at rest, scoped to own company
- Board access = full-control operator context

## 10. Fork-Specific (HenkDz/paperclip)

- Branch `feat/externalize-hermes-adapter`: no built-in Hermes adapter — install via plugin manager
- Dev server auto-detects port (3101+ if 3100 taken)
- On NTFS: `npx vite build` may hang — use `node node_modules/vite/bin/vite.js build`
- Vite cache: clear both `ui/dist` and `ui/node_modules/.vite`
