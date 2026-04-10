# CLAUDE.md — PulseBox

> **Active tasks: [docs/TASKS.md](docs/TASKS.md) — check before starting work.**
---

## Project Overview

PulseBox is a modern, multi-tenant **headless CMS** platform built by Next Novas.
It provides a flexible schema builder, REST API, and content management foundation that can scale into any vertical — HRMS, Finance, Manufacturing, or any ERP domain.
The PM team gives direction, AI handles implementation.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui (components live in `src/components/ui/`)
- **Database & Auth**: Supabase (Postgres + Auth + Row-Level Security)
- **Icons**: lucide-react
- **Package manager**: npm
- **Deployment**: Localhost (dev), Vercel (production)

## Architecture

### Multi-Tenancy Model

- **tenants** table with `is_super` flag — Next Novas is the super-tenant (slug: `nextnovas`)
- **tenant_users** join table maps users → tenants with roles
- Users can belong to multiple tenants (Next Novas staff may access client tenants for support)
- All data queries are scoped via Supabase Row-Level Security (RLS) based on `auth.uid()` lookups against `tenant_users`
- Current tenant stored in `pb-tenant` cookie (httpOnly, set by middleware)

### Roles (hierarchical)

1. `super_admin` — Next Novas platform team. Full access to all tenants and platform settings
2. `tenant_admin` — Client org admin. Manages users/settings within their tenant

> `manager` and `employee` roles were dropped from the design.

### Key Directories

- `middleware.ts` — Auth guard, tenant resolution, route-level RBAC
- `supabase/migrations/` — SQL migrations (push via `supabase db push --linked`)
- `docs/THEME.md` — Theme token reference
- `src/app/dashboard/` — All protected pages (users, tenants, studio/*)
- `src/components/ui/` — shadcn/ui primitives (never edit manually)
- `src/lib/supabase/` — client.ts / server.ts / admin.ts
- `src/lib/auth.ts` — getUser, getUserRole, getUserTenants
- `src/lib/tenant.ts` — getCurrentTenantId, resolveTenant

### Middleware Pipeline (`middleware.ts`)

1. Skip public routes (`/login`, `/signup`, `/auth/callback`)
2. Validate Supabase session → redirect to `/login` if missing
3. Resolve tenant → set `pb-tenant` cookie if missing
4. Route-level RBAC: `/dashboard/admin/tenants` = super_admin, `/dashboard/admin` = tenant_admin+

## Conventions

- **Mobile-first**: All UI must be responsive. Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`)
- **Server Components by default**: Only add `"use client"` when the component needs interactivity (state, effects, event handlers)
- **shadcn/ui components**: Never edit files in `src/components/ui/` manually. Add new ones via `npx shadcn@latest add <component>`
- **Supabase clients**: Use `client.ts` in client components, `server.ts` in server components/route handlers, `admin.ts` only for admin operations that bypass RLS
- **Tenant scoping**: Never query data without tenant context. RLS handles this at the DB level
- **No secrets in client code**: Only `NEXT_PUBLIC_*` env vars are accessible in the browser

## Environment Variables

File: `.env.local` (never commit this)

```
NEXT_PUBLIC_SUPABASE_URL      # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY # Supabase anon/public key
SUPABASE_SERVICE_ROLE_KEY     # Server-only service role key
NEXT_PUBLIC_APP_NAME          # "PulseBox"
NEXT_PUBLIC_SUPER_TENANT_SLUG # "nextnovas"
```

## Super-Tenant (Next Novas) Behavior

Next Novas (`is_super: true`) has special privileges:
- Can view and manage all tenants via `/dashboard/admin/tenants`
- `super_admin` users can access any tenant's data
- Platform-level settings and configurations are Next Novas-only

## Machine Constraints

- **DO NOT install Docker** — corporate laptop (Next Novas), not licensed
- **DO NOT run `npx supabase start`** — requires Docker
- All Supabase work must target cloud instances via `npx supabase db push --linked`

## Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npx supabase db push --linked                 # Apply migrations to cloud
npx supabase gen types typescript --linked > src/types/database.ts
```

---

## Working with Claude Code

### Approach
- Prefer reading only the files directly relevant to the task — avoid bulk reads of the whole codebase.
- Use the Explore agent for broad codebase searches instead of multiple Grep rounds.

### Tool Preferences
- Use dedicated tools (Read, Grep, Glob, Edit, Write) over Bash equivalents
- Use the Explore agent for broad codebase searches instead of multiple Grep rounds

### Code Conventions (Claude enforces these)
- shadcn/ui: Never edit `src/components/ui/` manually — use `npx shadcn@latest add <component>`
- Supabase admin client (`admin.ts`) only for operations that must bypass RLS
- All new pages must have a corresponding RLS policy before shipping
- No `"use client"` unless the component genuinely needs browser APIs / state

### UI / Dark Theme (STRICTLY enforced — no exceptions)
PulseBox supports light + dark mode. Every element MUST include both light and dark Tailwind variants. Never use `bg-white`, `text-gray-900`, `border-gray-200`, or any bare light class without a `dark:` counterpart.

**Before building any new screen or component, run `/new-screen`** to load the full template and dark-token cheatsheet.

