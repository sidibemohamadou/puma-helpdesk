# Workspace

## Overview

pnpm workspace monorepo using TypeScript. PUMA IT Helpdesk application — an internal IT ticket management system for the Programme d'Urgence de Modernisation des Axes et Territoires frontaliers.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/puma-helpdesk)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Auth**: Session-based (express-session)
- **UI**: shadcn/ui + Tailwind CSS
- **Charts**: Recharts (dashboard)
- **Routing**: Wouter

## Application Features

- Full ticket lifecycle management (open, in_progress, pending, resolved, closed)
- Role-based access: Agent, Technician, Administrator
- Dashboard with KPIs, charts by category/priority, recent activity feed
- Technician performance metrics
- Comment system with internal/external notes
- User management (admin only)
- Activity audit log

## Demo Accounts

| Email | Password | Role |
|-------|----------|------|
| admin@puma.sn | admin123 | Admin |
| tech1@puma.sn | tech123 | Technician |
| tech2@puma.sn | tech123 | Technician |
| agent1@puma.sn | agent123 | Agent |
| agent2@puma.sn | agent123 | Agent |
| agent3@puma.sn | agent123 | Agent |

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/puma-helpdesk run dev` — run frontend locally

## Architecture

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/api-client-react/` — Generated React Query hooks
- `lib/api-zod/` — Generated Zod validation schemas
- `lib/db/src/schema/` — Database schemas (users, tickets, comments, activity_log)
- `artifacts/api-server/src/routes/` — API route handlers (auth, tickets, users, dashboard)
- `artifacts/puma-helpdesk/src/` — React frontend

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
