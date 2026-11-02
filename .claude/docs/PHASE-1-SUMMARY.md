# Фаза 1. Резюме результатов

Статус: реализация завершена и проверена на реальном Postgres 18 (docker). Коммит фазы НЕ сделан (ждёт команды пользователя).

## 1. Сделано (по пунктам плана)

**Сущности и миграция** (`src/modules/users/user.entity.ts`, `src/modules/auth/*-challenge.entity.ts`, `src/database/migrations/1762000000000-Phase1Users.migration.ts`)
- `users`: `id` uuid, `email` (UNIQUE, до 320), `password_hash`, `status` enum (pending/active/blocked/deleting/deleted), `display_name`, `photo_key`, `created_at`, `updated_at`.
- `registration_challenges` и `login_challenges`: `user_id` (FK, CASCADE), `method` (otp/magic_link), `secret_hash`, `attempts`, `last_sent_at`, `expires_at`, `consumed_at`, `consumed_reason` (confirmed/replaced/attempts_exhausted/user_inactive). Логика `login_challenges` — фаза 3.
- Миграция написана вручную; `migration:generate` после неё сообщает «No changes», revert/run проходят.

**Эндпоинты** (`auth.controller.ts`, `registration.service.ts`)
- `POST /auth/register`: 201 `{id, email, status:"active"}` без подтверждения; 202 `{confirmationRequired, method, attemptId, expiresInSeconds:600, resendAfterSeconds:60}` с подтверждением. Секрета в ответе нет.
- `POST /auth/register/confirm`: `{attemptId, code}` (OTP) или `{token}` (magic link), 200.
- `POST /auth/register/resend`: `{email}`, 202.
- Ошибки: 400 (валидация, любой неверный/просроченный/погашенный код — одинаковый ответ), 409 (email занят, включая `pending`), 429 (5 неверных кодов, resend чаще 60 с), 503 (SMTP недоступен, `pending` и попытка сохраняются).

**Безопасность**
- Email: trim + lowercase (DTO `@Transform`), в `main.ts` включён `ValidationPipe({ transform: true })`.
- Пароль 8–128, минимум одна буква (любой алфавит) и одна цифра, Argon2id (`PasswordService`).
- OTP 6 цифр (`randomInt`), magic link — 32 байта base64url, токен `attemptId.secret`. В БД только HMAC-SHA256 (ключ `LOGIN_CHALLENGE_HMAC_KEY`, привязка к `attemptId`), сравнение через `timingSafeEqual`.
- Confirm выполняется в транзакции с `pessimistic_write` на строку попытки; неверная попытка фиксируется до ответа 400. 5-я попытка может быть успешной.
- Resend: старая попытка гасится (`replaced`), создаётся новая, счётчик с нуля. Для неизвестного/уже активного email — нейтральный 202 без письма.
- `EmailService` (абстрактный класс = DI-токен) + `SmtpEmailService`; код и ссылка не логируются.
- Rate limit `@Throttle` 10/мин на IP для всех трёх эндпоинтов.

**Конфиг**: `REGISTRATION_CONFIRMATION_METHOD` (otp | magic_link, по умолчанию otp), `MAGIC_LINK_BASE_URL` — в `Config`, Joi и `.env.example`.

**Исправления дефектов фазы 0 (найдены только при реальном запуске)**
- `.env.example`: пустые `SMTP_*`, `S3_*`, `RBAC_BOOTSTRAP_ADMIN_USER_ID=` Joi отвергал, приложение не стартовало. Необязательные переменные закомментированы.
- `src/database/data-source.ts`: был и именованный, и default-экспорт одного DataSource — TypeORM CLI падал («must contain only one export»). Оставлен только default.
- Сущности импортируют `User` относительным путём: CLI (ts-node) не резолвит alias `@/`.

## 2. Решения, принятые самостоятельно
- Дубль email -> явный 409 (по `1.0` и таблице ошибок ТЗ), а не нейтральный ответ.
- Magic link в формате `attemptId.secret` (ТЗ), а не поиск по HMAC токена (`1.0`): не нужен индекс по `secret_hash`.
- Метод подтверждения выбирается env-переменной, а не клиентом.
- Лимит 10/мин на IP — порог для регистрации нигде не задан.
- `resend` заменяет попытку новой строкой, а не обновляет старую.
- Тело 201 — `{id, email, status}` (как в `1.0`), а не 7-полевой Safe Profile из ТЗ.

## 3. Сознательно оставлено / отложено
- Роль `user` не назначается (две пометки `TODO(phase 2)` в `registration.service.ts`).
- Нет cron-очистки просроченных challenges.
- Rate limit регистрации in-memory (общий throttler), не БД.
- Нет e2e-теста регистрации в `test/` (проверено вручную, см. п. 5).
- Коммит фазы не сделан.

## 4. Расхождения и дыры в ТЗ/доках
- Anti-enumeration (ТЗ §1) vs явный 409 (`1.0` и таблица ошибок ТЗ).
- Формат magic link: `attemptId.secret` (ТЗ) vs поиск по HMAC без `attemptId` (`1.0`).
- `consumed_reason` (enum) есть в ТЗ, в `1.0` только `consumed_at`; `user_inactive` без описанного сценария (выставляется, если пользователь не `pending` при подтверждении).
- Верхняя граница пароля 128 только в ТЗ; тело 201 различается (Safe Profile vs `{id,email,status}`).
- Ключ называется `LOGIN_CHALLENGE_HMAC_KEY`, но используется и для регистрации.
- Тело и поведение `resend` для неизвестного/активного email не описаны; порог rate limit регистрации/resend не задан; `login_challenges` в доках не описана.

## 5. Как проверить
```bash
npm run build        # без ошибок
npm run lint         # без ошибок
npm test             # 42 passed
npm run test:e2e     # 5 passed
docker compose up -d && npm run migration:run   # накат миграции
```
Вручную проверено на Postgres (приложение из `dist`, SMTP — локальный приёмник на :2525):
- регистрация без подтверждения: нормализация email, Argon2id в БД, дубль -> 409, невалидные данные -> 400;
- OTP: 202 -> код из письма -> confirm 200, `status=active`; resend сразу -> 429; 5 неверных -> 400×5, затем верный код -> 429, в БД `attempts_exhausted`.
- Magic link, SMTP-сбой (503) и просроченная попытка проверены только юнит-тестами с моками.

## 6. Что передать следующим фазам
- Фаза 2: назначать роль `user` в двух местах `registration.service.ts` (регистрация без подтверждения и `confirm`) в той же транзакции; решить, что делать, если RBAC ещё не инициализирован.
- Фаза 3: `login_challenges` готова, переиспользовать `ChallengeCryptoService`, `PasswordService` (есть `verify`), `EmailService`; нужен dummy-hash; `consumed_reason` и константы — `challenge.types.ts`. В `confirm` у регистрации нужен CSRF/guard-цепочка только после появления глобального default-deny (эндпоинты станут `@Public()`).
- Фаза 4: `display_name`, `photo_key` уже в `users`; Safe Profile DTO собрать из `User`.
- Фаза 5/6: статусы `deleting/deleted` уже в enum; при удалении очищать оба типа challenges (CASCADE по FK уже есть).
- Все: миграции — только относительные импорты в сущностях (не `@/`); новые необязательные env в `.env.example` оставлять закомментированными.
