# smsVxod — авторизация по СМС

Вход на сайт по СМС-коду. СМС отправляет твой собственный Android-телефон, выступающий в роли шлюза. Всё работает локально на твоём ПК через Docker — без внешних сервисов, без капчи, без облачных СМС-провайдеров.

## Архитектура

```
[Браузер] ──POST /api/auth/request-code──▶ [Next.js / Postgres / Redis]
                                                       │
                                                       ├─ нормализация номера
                                                       ├─ rate-limit (Redis)
                                                       ├─ генерация 6-значного кода
                                                       ├─ сохранение в Redis (TTL 5 мин)
                                                       ├─ кладёт задачу в Redis-очередь
                                                       └─ пишет audit_log в Postgres

[Android-приложение]  ──GET /api/sms/pending──▶  [сервер]   (poll каждые 3 сек)
[Android]              отправляет СМС через SmsManager
[Android]             ──POST /api/sms/sent──▶  [сервер]   (отчёт)
[Android]             ──POST /api/gateway/heartbeat──▶  [сервер]   (раз в 30 сек)

[Браузер] ──POST /api/auth/verify-code──▶ [сервер]
                                                       │
                                                       ├─ IP-rate-limit (10 за 15 мин → автобан)
                                                       ├─ сверка кода
                                                       └─ JWT в httpOnly cookie
```

## Структура

```
smsVxod/
├── web/                         # Next.js 15 (App Router) — фронт + API
├── android/                     # Kotlin-приложение шлюза
├── scripts/                     # backup.sh для pg_dump
├── docker-compose.yml           # postgres + redis + ntfy + web + db-backup
├── docker-compose.override.yml  # локальный режим (web нативно, без Docker Hub)
├── Makefile                     # init/up/down/migrate/psql/backup/logs
├── .env.example                 # шаблон секретов для compose
└── README.md
```

## Что под капотом

**Web (`web/`):**
- Next.js 15 + TypeScript + Tailwind (Apple-style минимализм)
- **Postgres 16** через **Drizzle ORM** — таблицы `users`, `auth_log`, `banned_ips`, `gateway_devices`, `sms_log`
- **Redis 7** через **ioredis** (lazy-клиент) — TTL-коды, очередь СМС, rate-limit, last_seen шлюзов
- **JWT** в `httpOnly` cookie на 7 дней
- **Security headers** + **CSRF-friendly cookies** через middleware
- **pino** structured logging
- **ntfy** для self-hosted push-алертов (опционально)
- Без капчи, без внешних SaaS

**Android (`android/`):**
- Kotlin, minSdk 26, Foreground Service + Coroutines polling
- **Dual-SIM:** выбор симки в UI, `SmsManager.createForSubscriptionId`
- **Heartbeat** каждые 30 сек с батареей, сигналом, оператором
- **WorkManager watchdog** — перезапускает сервис каждые 15 мин если автозапуск включён
- **Rotating-логи** на устройстве + share через FileProvider
- **Системные разрешения:** оптимизация батареи, vendor-autostart (MIUI/EMUI/ColorOS/Vivo/Samsung), **блокировка входящих звонков** через `CallScreeningService`
- Release-подпись через `gradle.properties`/env (fallback на debug)

**Инфраструктура:**
- `docker-compose.yml` — Postgres + Redis + ntfy + web + db-backup (cron pg_dump каждый час, retention 7 дней)
- `Makefile` для всех ежедневных операций
- `.github/workflows/` — CI на каждый push (tsc + vitest + next build, gradle assembleDebug, релиз APK по тегу)

## 1. Локальный запуск (рекомендуемый сценарий)

### 1.1 Подготовка

```bash
git clone git@github.com:usrkukharenko/smsProtytipe.git
cd smsProtytipe
make init           # сгенерирует .env с JWT_SECRET и GATEWAY_TOKEN
```

После этого открой `.env` и при желании поправь:
- `GATEWAY_TOKEN` — например на `token2026` для удобства ввода на телефоне
- `NTFY_TOPIC` — название топика для алертов

### 1.2 Запуск Postgres + Redis в Docker, web нативно

Это режим из коробки в `docker-compose.override.yml` — нужен потому что Docker Hub бывает нестабилен с тяжёлым `node:20-alpine`.

```bash
# Поднять только БД и Redis (порты 5432 и 6379 опубликованы для localhost)
docker compose up -d postgres redis

# Накатить миграции БД (одна команда; работает потому что postgres опубликован)
cd web
DATABASE_URL='postgres://smsvxod:smsvxod-local@localhost:5432/smsvxod' \
  npx drizzle-kit migrate
cd ..

# Запустить web нативно (подхватит env из .env)
cd web
DATABASE_URL='postgres://smsvxod:smsvxod-local@localhost:5432/smsvxod' \
REDIS_URL='redis://localhost:6379' \
JWT_SECRET="$(grep ^JWT_SECRET ../.env | cut -d= -f2)" \
GATEWAY_TOKEN="$(grep ^GATEWAY_TOKEN ../.env | cut -d= -f2)" \
NTFY_URL='' \
HOSTNAME=0.0.0.0 \
  npm run dev
```

Открой `http://localhost:3000`. С телефона в той же WiFi — `http://<твой-ip>:3000` (`ifconfig | grep "inet 192"`).

### 1.3 Полный Docker-стек (когда Docker Hub стабилен)

Удали `docker-compose.override.yml` и запусти всё в Docker:

```bash
rm docker-compose.override.yml
make up           # docker compose up -d
make migrate      # docker compose --profile tools run --rm db-migrate
```

`make logs` — смотреть логи; `make psql` — открыть консоль БД; `make backup` — снять бэкап вручную; `make down` — выключить.

## 2. Android-приложение

### 2.1 Сборка

```bash
# Скачать Gradle 8.7 (если ещё нет)
curl -L -o /tmp/gradle.zip https://services.gradle.org/distributions/gradle-8.7-bin.zip
mkdir -p ~/.local
unzip -q -o /tmp/gradle.zip -d ~/.local/
export PATH="$HOME/.local/gradle-8.7/bin:$PATH"

# Собрать APK
cd android
gradle assembleDebug
# APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Альтернатива — открыть `android/` в Android Studio и нажать Run.

### 2.2 Установка на телефон

```bash
~/Library/Android/sdk/platform-tools/adb install -r \
  android/app/build/outputs/apk/debug/app-debug.apk
```

Или AirDrop/Telegram → APK → тапнуть «Установить».

### 2.3 Настройка в приложении

1. **URL сервера:** `http://<ip-твоего-компьютера>:3000` (без слеша в конце)
2. **Gateway-токен:** значение из `.env`, поле `GATEWAY_TOKEN`
3. **Интервал:** `3` секунды
4. **SIM-карта:** выбрать слот, если используется Dual-SIM
5. Нажать «Запустить» → разрешить **SEND_SMS, READ_PHONE_STATE, POST_NOTIFICATIONS**
6. В секции **«Системные разрешения»**:
   - «Открыть настройки» → отключить оптимизацию батареи
   - «Открыть настройки производителя» (на Xiaomi/Huawei/etc.) → разрешить автозапуск
   - Включить Switch **«Блокировка входящих звонков»** → согласиться с диалогом «Назначить блокировщиком» (Android 10+). Входящие будут отклоняться без гудка и уведомлений, пока шлюз активен.

## 3. Лимиты (rate-limit и защита)

| Ограничение | Значение | Где конфигурируется |
|---|---|---|
| Повторный запрос СМС на номер | не чаще 1 раза в 60 сек | `web/lib/rate-limit.ts` |
| Запросов СМС на номер | максимум 5 в час | `web/lib/rate-limit.ts` |
| Запросов СМС с одного IP | максимум 20 в час | `web/lib/rate-limit.ts` |
| Verify-попыток с одного IP | 10 за 15 мин → автобан 15 мин | `web/app/api/auth/verify-code/route.ts` |
| Попыток ввода кода | 3, потом код инвалидируется | `web/lib/codes.ts` |
| Время жизни кода | 5 минут | `web/lib/codes.ts` |
| Время жизни сессии | 7 дней | `web/lib/auth.ts` |

## 4. Производительность и ёмкость

Узкое место — **одна SIM-карта**, а не сервер. Реалистичные цифры:

| Сценарий | Время на 1 СМС | Лимит оператора | Кому подходит |
|---|---|---|---|
| Одна SIM (текущий сетап) | 1–2 сек | ~50/час, ~200/день, дальше блок | внутренний продукт / друзья / тест |
| 2 SIM в одном телефоне (Dual-SIM, поддерживается) | 1–2 сек | ~100/час | до 100 регистраций/час |
| Несколько телефонов с пулом SIM | 1–2 сек × N | ~50/час × N | публичный сервис |
| Платный SMS-провайдер (SMS.ru/Twilio) как фолбэк | <0.5 сек | 1000+ СМС/сек | прод-сервис |

Сам web (Next.js + Postgres + Redis на ноуте) держит **500–1000 RPS** на `request-code` — проблем с самим API не будет. Когда система упрётся — упрётся **в физическую отправку СМС с симки** и **антиспам оператора**.

## 5. CI/CD

В `.github/workflows/`:
- `web.yml` — на push/PR с изменениями в `web/**`: `tsc --noEmit`, `vitest run`, `next build` с тестовыми env
- `android.yml` — на push/PR с изменениями в `android/**`: `gradle assembleDebug`, артефакт APK
- `release.yml` — на тег `v*`: `gradle assembleRelease` + GitHub Release с APK

## 6. Тесты

```bash
cd web
npx vitest run                # юнит-тесты (phone, codes, auth, rate-limit)
npx playwright install        # один раз — поставить браузеры
npx playwright test           # e2e (требует поднятые Postgres + Redis)
```

## 7. API

| Метод | Путь | Назначение | Авторизация |
|---|---|---|---|
| POST | `/api/auth/request-code` | запросить код по номеру | — |
| POST | `/api/auth/verify-code` | проверить код, выдать JWT | — |
| POST | `/api/auth/logout` | сбросить cookie | — |
| GET | `/api/me` | кто я | JWT cookie |
| GET | `/api/sms/pending?max=10` | очередь для Android | `Bearer GATEWAY_TOKEN` |
| POST | `/api/sms/sent` | отчёт об отправке | `Bearer GATEWAY_TOKEN` |
| POST | `/api/gateway/heartbeat` | пинг от шлюза | `Bearer GATEWAY_TOKEN` |
| GET | `/api/health` | проверка БД/Redis/очереди | — |

## 8. Безопасность

- JWT в **httpOnly** cookie, `sameSite=lax`, `secure` в production
- Gateway-эндпоинты защищены отдельным `GATEWAY_TOKEN` (не равен пользовательскому JWT)
- Коды живут в Redis с автоматическим TTL — не нужно чистить вручную
- Нормализация номера (`+7…`) предотвращает обход лимитов через разные форматы
- Rate-limit по номеру и по IP, плюс автобан за брутфорс кода
- Audit-log на каждое событие (`code_requested`, `code_verified`, `code_failed`, `banned`)
- Security headers: HSTS (если HTTPS), X-Frame-Options, CSP, Referrer-Policy
- Android: входящие звонки отклоняются `CallScreeningService` — не мешают отправке СМС

## 9. База данных

Схема в `web/lib/db/schema.ts`, миграции в `web/drizzle/`.

```
users(id, phone unique, createdAt, lastLoginAt, isBanned)
auth_log(id, userId, phone, ip, userAgent, event, createdAt)
banned_ips(ip pk, reason, bannedUntil, createdAt)
gateway_devices(deviceId pk, lastSeenAt, batteryLevel, signalStrength, simInfo)
sms_log(id, taskId, phone, success, error, deviceId, createdAt)
```

Изменение схемы:

```bash
cd web
npm run db:generate    # после правки lib/db/schema.ts
npm run db:migrate     # накатить
```

## 10. Бэкапы

В compose-стеке `db-backup` каждый час запускает `pg_dump | gzip` → `/backups/smsvxod-YYYYMMDD-HHMMSS.sql.gz`, и удаляет файлы старше 7 дней.

Достать вручную:

```bash
docker compose cp db-backup:/backups ./backups
```

Восстановление:

```bash
gunzip -c backups/smsvxod-YYYYMMDD-HHMMSS.sql.gz \
  | docker compose exec -T postgres psql -U smsvxod -d smsvxod
```

## 11. Алерты через ntfy

Когда `ntfy`-сервис поднят (`make up` без override), сервер шлёт push на `NTFY_TOPIC` при:
- gateway не пинговал >60 сек
- очередь >100 задач
- success rate СМС <90% за 5 минут
- ошибки серверной части

На телефоне:
1. Поставь приложение **ntfy** (App Store / Google Play / F-Droid)
2. Подпишись на `http://<ip-компьютера>:8888/<NTFY_TOPIC>`

Без ntfy (как сейчас в `docker-compose.override.yml`) — алерты идут в stdout сервера.

## 12. Деплой в продакшен

Этот проект задуман для локального запуска. Когда понадобится продакшен:

1. **VPS** — Hetzner / Selectel / TimeWeb, от ~300 ₽/мес
2. Открой 80/443 и закрой остальное (ufw)
3. SSH: ключи-only, отключи пароль, fail2ban
4. Перед `docker compose up -d`:
   - удали `docker-compose.override.yml`
   - сгенерируй сильные секреты (`make init` или вручную)
   - добавь reverse-proxy (Caddy или Nginx) с автоматическим HTTPS (Let's Encrypt)
   - подними домен на сервер
5. Включи бэкапы `db-backup` (уже в compose) и настрой выгрузку дампов наружу (rsync на NAS или второй VPS)
6. Добавь алерты в ntfy с реального телефона

## Файлы по полочкам

**Web:**
- [web/app/api/auth/request-code/route.ts](web/app/api/auth/request-code/route.ts)
- [web/app/api/auth/verify-code/route.ts](web/app/api/auth/verify-code/route.ts)
- [web/app/api/sms/pending/route.ts](web/app/api/sms/pending/route.ts)
- [web/app/api/gateway/heartbeat/route.ts](web/app/api/gateway/heartbeat/route.ts)
- [web/app/api/health/route.ts](web/app/api/health/route.ts)
- [web/lib/kv.ts](web/lib/kv.ts), [web/lib/db/index.ts](web/lib/db/index.ts)
- [web/lib/rate-limit.ts](web/lib/rate-limit.ts), [web/lib/auth.ts](web/lib/auth.ts)
- [web/lib/users.ts](web/lib/users.ts), [web/lib/audit.ts](web/lib/audit.ts), [web/lib/bans.ts](web/lib/bans.ts)
- [web/middleware.ts](web/middleware.ts)

**Android:**
- [android/app/src/main/java/com/smsvxod/gateway/MainActivity.kt](android/app/src/main/java/com/smsvxod/gateway/MainActivity.kt)
- [android/app/src/main/java/com/smsvxod/gateway/GatewayService.kt](android/app/src/main/java/com/smsvxod/gateway/GatewayService.kt)
- [android/app/src/main/java/com/smsvxod/gateway/SmsSender.kt](android/app/src/main/java/com/smsvxod/gateway/SmsSender.kt)
- [android/app/src/main/java/com/smsvxod/gateway/CallBlockerService.kt](android/app/src/main/java/com/smsvxod/gateway/CallBlockerService.kt)
- [android/app/src/main/java/com/smsvxod/gateway/AutostartHelper.kt](android/app/src/main/java/com/smsvxod/gateway/AutostartHelper.kt)
- [android/app/src/main/java/com/smsvxod/gateway/Heartbeat.kt](android/app/src/main/java/com/smsvxod/gateway/Heartbeat.kt)

**DevOps:**
- [docker-compose.yml](docker-compose.yml), [docker-compose.override.yml](docker-compose.override.yml)
- [Makefile](Makefile), [scripts/backup.sh](scripts/backup.sh)
- [.github/workflows/](.github/workflows/)
