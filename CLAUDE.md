# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Install Dependencies**: `pnpm install`
- **Start Dev Server (API + UI, Watch Mode)**: `pnpm dev`
- **Start Dev Server (No Watch)**: `pnpm dev:once`
- **Type Checking**: `pnpm typecheck`
- **Build All**: `pnpm build`
- **Run Unit Tests (Vitest)**: `pnpm test`
- **Run Single Test (Vitest)**: `pnpm vitest run <test_file_path>`
- **Run E2E Browser Tests (Playwright)**: `pnpm test:e2e`
- **Database Migrations**: `pnpm db:generate` (generate), `pnpm db:migrate` (apply)
- **Local Embedded DB Backups**: `pnpm db:backup`
- **Paperclip CLI Tool**: `pnpm paperclipai [command]` (e.g., `doctor`, `configure`, `run`)
- **Git Worktree Isolation**: Run `pnpm paperclipai worktree:make <branch-name>` to create a new branch in an isolated git worktree with its own configured port and separate embedded embedded PostgreSQL instance (to prevent collision with the main DB).

## Architecture overview

Paperclip is an orchestration server (Node.js) and frontend UI (React) that manages simulated organizations of AI agents working towards configurable business goals, with governance, cost control, budgets, and scheduling integrated.

This repository is set up as a `pnpm` monorepo workspaces:
- `/server`: Node.js backend. Serves the API, orchestrates agents using atomic budget enforcement & task checkouts, handles scheduled heartbeats, delegates tasks via an embedded PostgreSQL database, and hosts adapters for agent runtimes (like OpenClaw, Claude Code, and Codex).
- `/ui`: React-based control plane dashboard for managing agent status, tickets, organizational hierarchies, and reviews.
- `/cli`: Code for the `paperclipai` CLI used for configuration, initial start, diagnostic checks, and worktree initialization.
- `/packages`: Shared dependencies and adapters across the workspace.
- `/doc`: Project documentation, containing operational standards and integration rules.

### Important Development Details
- **Database**: By default, no external PostgreSQL instance is needed in dev mode. The backend spins up an embedded PostgreSQL database storing data in `~/.paperclip/instances/default/db` with uploaded attachments in `~/.paperclip/instances/default/data/storage`.
- **Lockfile Policy**: `pnpm-lock.yaml` should not be committed by manually resolving dependencies in pull requests. GitHub Actions regenerates and owns it on `master`.
- **Dev Runner Context**: The dev server runs idempotently via `pnpm dev`. It starts on port `3100` and automatically proxies the frontend. Use `pnpm dev --bind lan` to run private-network bounds (useful alongside tailscale).