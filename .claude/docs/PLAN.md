# План реализации

Источник требований: `0.0 Техническое задание ...md`. Стартовый шаблон описан в `0.0 Bootstrap Nest Js App README.md`.
Остальные файлы `.claude/docs/0.x–2.x` главный агент НЕ читает. Их читает субагент фазы и возвращает саммари (формат ниже).

## Протокол работы над фазой

1. Главная сессия запускает субагента (`Explore` или `general-purpose`) с промптом: «Прочитай файлы X, Y из `.claude/docs/`. Верни саммари до ~60 строк: обязательные эндпоинты и контракты, схемы таблиц, граничные случаи, тест-кейсы, расхождения с ТЗ».
2. Главная сессия сверяет саммари с ТЗ, уточняет фазу и реализует её. Для крупных фаз реализацию можно отдать другому субагенту.
3. По фазе: unit-тесты, `npm run build`, `npm run lint`, миграция, отдельный коммит.

## Фаза 0. Фундамент (доки: `0.1 Базы данных`, `0.3 Архитектуры Back End`, `0.5 Middleware`, `0.6 Наблюдаемость`, `0.4 Идемпотентность`)

- Починить шаблон: `ThrottlerGuard` как `APP_GUARD`, подключить `AuthModule` в `AppModule`, исправить или удалить `test/app.e2e-spec.ts` (он написан под Express), добавить `moduleNameMapper` для `@/` в jest.
- Конфиг и env: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `LOGIN_CHALLENGE_HMAC_KEY` (>= 32 байт, иначе падение на старте и `readiness=false`), `JWT_ISSUER`, `JWT_AUDIENCE`, `REGISTRATION_EMAIL_CONFIRMATION_ENABLED`, `LOGIN_EMAIL_CONFIRMATION_ENABLED`, `RBAC_BOOTSTRAP_ADMIN_USER_ID`, whitelist origin для CSRF, SMTP, S3, `STORAGE_DRIVER`, лимиты файлов. Правим `config.types.ts`, `config.validation.ts`, `.env.example`.
- Единый формат ошибок: глобальный `ExceptionFilter` с кодами из таблицы ТЗ (400–504, `code`), единый тип `AppException`.
- Логирование и наблюдаемость (по `0.6`), `/health` с readiness.
- Зависимости: `argon2`, `@nestjs/jwt`, `nodemailer`, `@fastify/multipart`, `sharp`, `csv-parse`/`csv-stringify`, `fast-xml-parser`, `yaml`, `@aws-sdk/client-s3`.

## Фаза 1. Пользователи и регистрация (доки: `1.0 Регистрация`, `0.2 UML-диаграммы`)

- Сущности: `User` (status enum pending/active/blocked/deleting/deleted, `password_hash`, `display_name`, `photo_key`), `registration_challenges`, `login_challenges` (`consumed_reason` enum, `secret_hash`, attempts, `expires_at`).
- `POST /auth/register` (201 / 202), `/auth/register/confirm`, `/auth/register/resend` (60 с).
- Нормализация email, политика пароля 8–128, Argon2id, HMAC-SHA256 для OTP/Magic Link (`attemptId.secret`), `EmailService` (SMTP, интерфейс для мока).
- Нейтральные ответы (anti-enumeration).

## Фаза 2. RBAC (доки: `1.1 RBAC`, `1.3 Авторизация`)

- 7 таблиц RBAC и миграции. Bootstrap при старте на пустых таблицах (роли `user`/`admin`, каталог разрешений, назначение `RBAC_BOOTSTRAP_ADMIN_USER_ID`).
- In-memory snapshot политики с проверкой `rbac_policy_state.version` на каждый запрос и атомарной подменой. При сбое 503 `authorization_unavailable`.
- Инвариант «>= 1 пользователя с `rbac@manage`» (транзакционно, 409).
- Админ API `/admin/rbac/*` (roles, permissions, grants, user roles). Любое изменение инкрементирует версию политики.
- Назначение роли `user` при регистрации.

## Фаза 3. Аутентификация и цепочка безопасности (доки: `1.2 Аутентификация`, `1.3 Авторизация`, `0.5 Middleware`)

- `POST /auth/login` (+ `/auth/login/confirm`, dummy-hash против timing-атак, лимиты 30/мин на IP и 5 неудач на (email+IP) за 15 мин), `/auth/refresh` (stateless, 30/мин), `/auth/logout` (204, идемпотентно).
- Cookies `access_token`/`refresh_token` с разными `Path`. JWT HS256 с проверкой `iss`/`aud`/`token_use`.
- Глобальный default-deny: `@Public()`, `@RequirePermission('perm@action')`, `@Ownership(...)`. Проверка при старте: маршрут без декоратора переводит readiness в false.
- Guard-цепочка из 5 шагов: JWT → статус пользователя в БД → CSRF (`Origin` + `X-CSRF-Protection: 1`) → RBAC → ownership (`*_any`).

## Фаза 4. Профиль пользователя (доки: `1.4`, `1.5`)

- Safe Profile DTO (ровно 7 полей, `photoUrl` вида `/users/{id}/photo`). `GET/PATCH /users/{id}`.
- Смена email через подтверждение нового адреса без потери сессии.
- `PUT/DELETE/GET /users/{id}/photo`: multipart, EXIF, resize 1024, WebP.
- `StorageAdapter` (интерфейс, `local-storage`, `s3-storage`) и таблица `storage_cleanup_jobs` с воркером очистки.

## Фаза 5. Удаление аккаунта (доки: `1.6`, `0.4 Идемпотентность`)

- `DELETE /users/{id}` → 202 `{jobId, status}`, `Idempotency-Key` (32 hex), задача в одной транзакции со сменой статуса на `deleting`, проверка инварианта `rbac@manage`.
- `deletion-worker` с erasers: Avatar, Personal Data (маска email), Data Purge. Финал `deleted`. Идемпотентные повторы.

## Фаза 6. Админ-список пользователей (доки: `1.7`)

- `GET /admin/users`: keyset-пагинация `(created_at, id)`, HMAC-подписанный курсор, `snapshotAt`, whitelist-фильтры (`status`, `created_after/before`, `search`).
- Общий переиспользуемый хелпер пагинации. Он понадобится в фазе 8.

## Фаза 7. Трансформации (доки: `2.0`, `2.1`, `2.2`)

- Ядро: стриминг, таймаут 30 с (504), лимит размера (413), белый список MIME (415).
- `POST /api/convert` и `GET /api/convert/formats`: матрица 12 направлений CSV/JSON/XML/YAML, anti-XXE, безопасный YAML.
- `POST /api/images/convert` и `GET /api/images/convert/formats`: PNG/JPEG/SVG→PNG/JPEG, макс 4096×4096, защита от image bombs, санитизация SVG, flatten альфы на белый, качество JPEG.

## Фаза 8. История и хранилище (доки: `2.3`, `2.4`)

- Таблица истории трансформаций, `GET /api/transformations/history` (курсор, `history_any`).
- `save=true`: асинхронное сохранение через `StorageAdapter`, `GET .../history/{itemId}/download` (`download_any`).
- `retention-worker` раз в 24 ч, TTL 90 дней.

## Фаза 9. Закрепление

- E2E-тесты ключевых сценариев: регистрация → логин → refresh → CSRF → RBAC → удаление.
- Аудит по чеклисту ТЗ (коды ошибок, default-deny, whitelist DTO, секреты).
- Обновить `CLAUDE.md` и README.

## Зависимости между фазами

0 → 1 → 2 → 3 → (4, 6, 7 параллельно) → 5 (нужны 4 и 2) → 8 (нужны 7 и StorageAdapter из 4) → 9.

## Риски и допущения

- В ТЗ есть противоречие: «пользователь без ролей получает роль `user`» работает при bootstrap, но при регистрации RBAC может быть не инициализирован. Решить в фазе 2.
- Курсовые доки могут уточнять или менять детали ТЗ. Расхождения субагент обязан выписывать отдельным пунктом.
- На Fastify вместо multer нужен `@fastify/multipart`.
