# Фаза 0. Резюме результатов

Статус: реализация завершена, коммит фазы НЕ сделан (ждёт команды пользователя).

## 1. Сделано (по пунктам плана)

**Починка шаблона**
- `ThrottlerGuard` подключён как `APP_GUARD`; `AuthModule` импортирован в `AppModule`.
- Jest `moduleNameMapper` для `@/` (unit и e2e).
- `test/app.e2e-spec.ts` переписан под Fastify (`app.inject`, без Postgres).

**Конфиг и env** (`config.types.ts`, `config.validation.ts`, `.env.example`, тест схемы `config.validation.spec.ts`)
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `LOGIN_CHALLENGE_HMAC_KEY` (>= 32 байт, падение на старте), `JWT_ISSUER`, `JWT_AUDIENCE`.
- Флаги подтверждения email, `RBAC_BOOTSTRAP_ADMIN_USER_ID`, `CSRF_ALLOWED_ORIGINS` (CORS берёт origin'ы оттуда).
- `SMTP_*`, `STORAGE_DRIVER` + `S3_*` (обязательны при `s3`), `STORAGE_LOCAL_DIR`, лимиты файлов.
- `OTEL_*` — только в `.env.example` и `instrumentation.ts`.

**Единый формат ошибок** (`src/core/errors`)
- `AppException`, `ErrorCode`, `STATUS_BY_CODE`; глобальный `AllExceptionsFilter` (`APP_FILTER` в `ErrorsModule`).
- Тело: `{statusCode, code, message, requestId, details?}`.
- Маппинг: `HttpException`; ValidationPipe -> 400 + `details`; Throttler -> 429; PG 23505 -> 409; ошибки соединения -> 503; Fastify-ошибки со `statusCode` (413/415); неизвестное -> 500 `internal_error` без утечек.

**Логирование и наблюдаемость** (`src/core/logging`, `src/instrumentation.ts`, `main.ts`)
- `X-Request-Id`: валидный `[A-Za-z0-9_-]{8,64}`, иначе `randomUUID` (через `genReqId` + `onRequest`).
- Access-лог в `onResponse`: requestId, trace_id/span_id (best-effort), method, route-шаблон, path без query, status, durationMs; успешные `/health*` — на уровне debug.
- Helmet, CORS `allowedHeaders`/`exposedHeaders`, OpenTelemetry (включается только при `OTEL_EXPORTER_OTLP_ENDPOINT`, первым импортом в `main.ts`), `enableShutdownHooks` + `shutdownTelemetry` в `onClose`.

**Health**
- `GET /health` — как раньше (при `HEALTH_CHECK_ENABLED=true` пингует БД).
- `GET /health/ready` -> 503 при сбое через глобальный `ReadinessService` (`markFailed`/`markOk`).

**Зависимости**: argon2, @nestjs/jwt, nodemailer (+types), @fastify/multipart, sharp, csv-parse, csv-stringify, fast-xml-parser, yaml, @aws-sdk/client-s3, @fastify/helmet, OpenTelemetry (api, sdk-node, auto-instrumentations-node, OTLP http exporters, sdk-metrics).

## 2. Решения, принятые самостоятельно
- Формат тела ошибки (в ТЗ/доках не задан).
- Fail-fast (Joi) на невалидных секретах; `/health/ready` — для сбоев после старта (default-deny из фазы 3, RBAC snapshot).
- По умолчанию 401 -> `invalid_session`, 403 -> `permission_denied`. Конкретные `invalid_credentials`, `ownership_denied`, `csrf_rejected`, `authorization_unavailable` выбираются через `AppException` в guards/сервисах.
- Regex request id строже доков (там GUID).

## 3. Сознательно оставлено / отложено
- Problem Details RFC 9457 (`application/problem+json`) не используется — осознанное отклонение, можно перейти позже.
- Joi-валидации для `OTEL_*` нет. Метрики — только автоинструментация OTel, кастомных нет. Sampling и Collector не настроены.
- Миграций нет (таблиц в фазе 0 нет) — с фазы 1.
- Rate limit хранится in-memory в throttler'е; ТЗ требует stateless/БД-счётчики для login — решить в фазе 3.
- `Retry-After` на 429 полагается на `ThrottlerGuard`, не тестировался.
- Проверки «guard, а не middleware», preflight/401/403 тесты — фаза 3.
- Коммит фазы не сделан.

## 4. Расхождения и дыры в ТЗ/доках
- В доках нет метрик/health/readiness для NestJS.
- ТЗ: fail-fast на старте и `readiness=false` противоречат друг другу.
- Нет условия выбора между парными кодами 401/403/503.
- Нет формата тела ошибки.
- Фаза 5: 409 на активную задачу удаления vs идемпотентный повтор с существующим `jobId`.
- «Тот же ключ для другой цели -> 409» из 0.4 в ТЗ отсутствует.
- Хранилище rate-limit не указано; при этом login (30/мин на IP, 5 неудач/15 мин) требует БД-счётчиков.

## 5. Как проверить
```bash
npm run build        # без ошибок
npm run lint         # без ошибок (автоправит файлы)
npm test             # 19 passed
npm run test:e2e     # 5 passed
```
- Приложение целиком не запускалось (нет Postgres): проверены только build/lint/тесты.
- Ручная проверка после `docker compose up -d`: `GET /health`, `GET /health/ready`, заголовок `X-Request-Id`, формат ошибки (400/404/429).

## 6. Что передать следующим фазам
- Фаза 1: бросать `AppException` с `ErrorCode`, не `HttpException`; первая миграция; использовать секреты и `SMTP_*` из конфига.
- Фаза 2: RBAC snapshot и `authorization_unavailable` (503) + `ReadinessService.markFailed/markOk`; `RBAC_BOOTSTRAP_ADMIN_USER_ID`.
- Фаза 3: решить хранилище rate-limit для login; default-deny с переводом readiness в false; guard-цепочка и тесты 401/403/preflight; CSRF по `CSRF_ALLOWED_ORIGINS`.
- Фаза 4: `StorageAdapter` по `STORAGE_DRIVER`; лимиты файлов из конфига; `@fastify/multipart` и `sharp` уже установлены.
- Фаза 5: разрешить конфликт 409 vs идемпотентный повтор.
- Все: requestId уже в теле ошибки и логах; при добавлении env — обновлять `Config`, Joi и `.env.example`.
