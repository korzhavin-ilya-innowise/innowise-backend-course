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

## Workflow

Work is split into phases described in `.claude/docs/PLAN.md`. Requirements (ТЗ) live in `.claude/docs/0.x–2.x`; the main session does **not** read those files — a subagent reads them and returns a summary (protocol in `PLAN.md`). Each finished phase gets `.claude/docs/PHASE-N-SUMMARY.md` (see `PHASE-0-SUMMARY.md` / `PHASE-1-SUMMARY.md` for the format). Check the latest summary for what is done, deferred, and `TODO(phase N)` markers.

Verify a phase on a real Postgres: `migration:run`, then `migration:generate` must report "No changes", then run the built app (`node dist/main.js`) and exercise it with `curl`.

## Architecture

NestJS 11 on **Fastify** (not Express) — use Fastify plugins/types in `src/main.ts` (`app.register(...)`). `main.ts`:
- imports `./instrumentation` (OpenTelemetry) first — it must stay the first import;
- calls `initializeTransactionalContext({ storageDriver: StorageDriver.AUTO })` before creating the app (required for `@Transactional()` from `typeorm-transactional`);
- registers helmet, compression, cookies (secret from `COOKIE_SECRET`), request logging, a global `ValidationPipe({ whitelist: true, transform: true })`, and CORS with origins from `CSRF_ALLOWED_ORIGINS` (comma-separated).

- `src/core/*` — infrastructure modules (app, config, database, errors, health, logging, throttler). `core/app/app.module.ts` is the root module. Feature modules live in `src/modules/*` (currently `auth`, `users`) and must be added to the "Application modules" imports in `AppModule`.
- **Config**: `ConfigService` wraps `@nestjs/config` with Joi validation (fails at startup). Adding an env var requires updating `config.types.ts` (`Config` interface), `config.validation.ts`, and `.env.example`. Details in `src/core/config/README.MD`.
- **Errors**: throw `AppException` (`src/core/errors/app.exception.ts`, e.g. `AppException.notFound()`); HTTP status is derived from the `ErrorCode` in `error-codes.ts`. `AllExceptionsFilter` (registered as `APP_FILTER` in `ErrorsModule`) produces the single error body format. Don't throw bare Nest `HttpException`s in feature code.
- **Throttler**: `ThrottlerGuard` is a global `APP_GUARD`; override per route with `@Throttle`. Storage is in-memory.
- **Health**: `GET /health`; with `HEALTH_CHECK_ENABLED=false` (default) it skips all indicators and returns `{ status: 'ok', details: {} }`. Add indicators in `health.service.ts`.
- **Database**: two separate DataSource definitions that must stay in sync — `src/core/database/database.module.ts` (runtime, built from `ConfigService`, wrapped with `addTransactionalDataSource`) and `src/database/data-source.ts` (TypeORM CLI only, reads `process.env` directly). Entities are any `*.entity.ts` under `src/` (auto-loaded); migrations are `src/database/migrations/*.migration.ts`. `POSTGRES_SYNCHRONIZE` defaults to false — use migrations. `POSTGRES_MIGRATIONS_RUN=true` runs pending migrations on app start.

## Conventions

- Import alias `@/*` → `src/*` (tsconfig, and `moduleNameMapper` in jest). The README's `@config/...` example is wrong; only `@/` exists.
- **Entities must import other entities by relative path, not `@/`** — the TypeORM CLI (ts-node) does not resolve the alias.
- `src/database/data-source.ts` must have only a default export; TypeORM CLI fails if it finds several DataSource exports.
- Optional env vars in `.env.example` must be commented out, not left empty — Joi rejects empty strings and the app won't start.
- Prettier: single quotes, trailing commas everywhere. ESLint uses type-checked typescript-eslint; `no-explicit-any` is off, floating promises and unsafe args are warnings.
