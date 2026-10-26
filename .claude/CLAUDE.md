# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start:dev          # dev server with watch
npm run build              # nest build
npm run lint               # eslint --fix (auto-modifies files)
npm run format             # prettier --write on src/ and test/
npm test                   # unit tests (jest, rootDir=src, *.spec.ts)
npm test -- config.service # run a single spec by filename pattern
npm test -- -t "test name" # run tests by name
npm run test:e2e           # e2e (test/jest-e2e.json, *.e2e-spec.ts)

docker compose up -d       # local Postgres 18 (reads .env; copy from .env.example)
npm run migration:generate # generate migration from entity changes
npm run migration:run | migration:revert | migration:show
```

## Architecture

NestJS 11 on **Fastify** (not Express) — use Fastify plugins/types in `src/main.ts` (`app.register(...)`). `main.ts` calls `initializeTransactionalContext()` before creating the app (required for `@Transactional()` from `typeorm-transactional`), registers compression + cookies (secret from `COOKIE_SECRET`), a global `ValidationPipe({ whitelist: true })`, and CORS with hardcoded localhost origins.

- `src/core/*` — infrastructure modules (config, database, health, throttler) plus `core/app/app.module.ts`, the root module. Feature modules live in `src/modules/*` and must be added to the "Application modules" imports in `AppModule` (note `AuthModule` exists but is not imported yet).
- **Config**: `ConfigService` wraps `@nestjs/config` with Joi validation (fails at startup). Adding an env var requires updating both `config.types.ts` (`Config` interface) and `config.validation.ts`, plus `.env.example`. Details in `src/core/config/README.MD`.
- **Health**: `GET /health`; with `HEALTH_CHECK_ENABLED=false` (default) it skips all indicators and returns `{ status: 'ok', details: {} }`. Add indicators in `health.service.ts`.
- **Database**: two separate DataSource definitions that must stay in sync — `src/core/database/database.module.ts` (runtime, built from `ConfigService`, wrapped with `addTransactionalDataSource`) and `src/database/data-source.ts` (TypeORM CLI only, reads `process.env` directly). Entities are any `*.entity.ts` under `src/` (auto-loaded); migrations are `src/database/migrations/*.migration.ts`. `POSTGRES_SYNCHRONIZE` defaults to false — use migrations. `POSTGRES_MIGRATIONS_RUN=true` runs pending migrations on app start.

## Conventions

- Import alias `@/*` → `src/*` (tsconfig). The README's `@config/...` example is stale; only `@/` is configured. Jest has no `moduleNameMapper`, so specs under `src/` that import via `@/` may need one added.
- Prettier: single quotes, trailing commas everywhere. ESLint uses type-checked typescript-eslint; `no-explicit-any` is off, floating promises and unsafe args are warnings.
