# smsVxod — авторизация по СМС

Вход на сайте по СМС-коду. Сайт стоит на Vercel, СМС отправляет твой Android-телефон.

## Архитектура

```
[Браузер]  ──POST /api/auth/request-code──▶  [Vercel: Next.js + KV]
                                                       │
                                                       ├─ генерит код
                                                       └─ кладёт задачу в очередь

[Android-приложение] ──GET /api/sms/pending──▶ [Vercel]   (раз в 3 сек)
[Android] отправляет СМС через SmsManager
[Android] ──POST /api/sms/sent──▶ [Vercel]                (отчёт)

[Браузер]  ──POST /api/auth/verify-code──▶  [Vercel]
                                                       │
                                                       └─ выдаёт JWT в httpOnly cookie
```

## Структура

```
smsVxod/
├── web/         # Next.js 15 — фронт + API
├── android/     # Kotlin-приложение (шлюз на телефоне)
├── scripts/     # backup.sh и прочая обслуга
├── docker-compose.yml
├── Makefile
└── README.md
```

## Запуск локально через Docker

Полный стек (Next.js + Postgres + Redis + ntfy + бэкап БД) поднимается одной командой на твоём ПК. Ни VPS, ни домена, ни HTTPS не нужно.

### Зависимости

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (включает `docker compose`)
- `make` (опционально — без него работают эквивалентные `docker compose`-команды, см. ниже)

### Первый запуск

```bash
cp .env.example .env
# либо `make init` — он сам скопирует и сгенерирует JWT_SECRET / GATEWAY_TOKEN / ALTCHA_HMAC_KEY
```

Если генеришь секреты вручную, для каждого из `JWT_SECRET`, `GATEWAY_TOKEN`, `ALTCHA_HMAC_KEY`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# либо: openssl rand -hex 32
```

Подними стек и накати миграции БД:

```bash
make up         # docker compose up -d
make migrate    # docker compose --profile tools run --rm db-migrate
```

### Доступы

| Что | Где |
|---|---|
| Веб-приложение | http://localhost:3000 |
| ntfy (push-уведомления) | http://localhost:8888 |
| Postgres | только внутри docker-сети (хочешь снаружи — раскомментируй `ports:` под `postgres` в `docker-compose.yml`) |
| Redis | только внутри docker-сети |

### Подписка на ntfy с телефона

1. Поставь приложение **ntfy** ([Play Store](https://play.google.com/store/apps/details?id=io.heckel.ntfy) / [F-Droid](https://f-droid.org/packages/io.heckel.ntfy/))
2. Add subscription → Use another server → `http://<IP-твоего-ПК-в-локалке>:8888`
3. Topic — то значение, что в `NTFY_TOPIC` из `.env` (по умолчанию `smsvxod-alerts`)

IP в локальной сети можно посмотреть в Системных настройках → Сеть, или командой `ipconfig getifaddr en0` на macOS. Телефон должен быть в той же Wi-Fi-сети, что и ПК.

### Полезные команды

| `make ...` | эквивалент `docker compose ...` | что делает |
|---|---|---|
| `make up` | `docker compose up -d` | поднять стек в фоне |
| `make down` | `docker compose down` | остановить |
| `make restart` | `docker compose down && docker compose up -d` | перезапуск |
| `make rebuild` | `docker compose build --no-cache && docker compose up -d` | пересобрать образ web с нуля |
| `make logs` | `docker compose logs -f` | смотреть логи |
| `make ps` | `docker compose ps` | какие сервисы запущены |
| `make migrate` | `docker compose --profile tools run --rm db-migrate` | накатить миграции drizzle |
| `make psql` | `docker compose exec postgres psql -U smsvxod -d smsvxod` | psql-шелл в БД |
| `make backup` | `docker compose exec db-backup /backup.sh` | ручной бэкап БД сейчас |

Бэкапы складываются в named volume `smsvxod_backups` (`pg_dump | gzip`, раз в час, хранятся 7 дней). Достать наружу:

```bash
docker compose cp db-backup:/backups ./backups-local
```

## 1. Запуск веб-приложения

### 1.1 Локально

```bash
cd web
npm install
cp .env.example .env.local
# отредактируй .env.local — задай JWT_SECRET и GATEWAY_TOKEN
npm run dev
```

Открой http://localhost:3000

При локальной разработке без переменных KV приложение хранит данные в **памяти процесса** — этого достаточно, чтобы пощупать UI. После рестарта `next dev` всё обнуляется.

### 1.2 Деплой на Vercel

1. Залей `web/` в репозиторий GitHub
2. На vercel.com → New Project → импортируй репозиторий, root directory укажи `web`
3. **Подключи KV:**
   - В проекте Vercel → Storage → Create Database → KV
   - Connect to Project → выбери все environments
   - Переменные `KV_*` пропишутся автоматически
4. **Добавь env vars:**
   - `JWT_SECRET` — любая длинная случайная строка (32+ символа)
   - `GATEWAY_TOKEN` — другая длинная случайная строка (это пароль для Android)
5. Redeploy

Сгенерировать секреты:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 2. Сборка Android-приложения

### 2.1 Требования

- Android Studio Hedgehog (2023.1.1) или новее
- JDK 17

### 2.2 Сборка

1. Открой Android Studio → Open → выбери папку `android/`
2. Дождись синхронизации Gradle (первый раз качает зависимости)
3. Подключи Android-телефон по USB, включи отладку по USB
4. Run ▶ — Android Studio установит и запустит приложение

Альтернатива — собрать APK без IDE:
```bash
cd android
./gradlew assembleDebug
# APK будет в app/build/outputs/apk/debug/app-debug.apk
```

### 2.3 Настройка на телефоне

1. В приложении введи:
   - **URL сервера** — `https://your-app.vercel.app` (без слеша на конце)
   - **Gateway-токен** — тот же `GATEWAY_TOKEN`, что задан на Vercel
   - **Интервал опроса** — 3 секунды (по умолчанию)
2. Нажми «Запустить» — система запросит разрешение на отправку СМС
3. Появится постоянное уведомление «SmsVxod Gateway». Не сворачивай его

Приложение автоматически запустится при перезагрузке телефона, если хотя бы раз был нажат «Запустить».

### 2.4 Важно для надёжной работы шлюза

- **Отключи оптимизацию батареи** для приложения: Настройки → Приложения → SmsVxod Gateway → Батарея → «Без ограничений»
- Телефон должен быть постоянно на зарядке и подключён к интернету
- Симка должна быть активна (положительный баланс)

## 3. Как это работает

### Запрос кода

1. Юзер вводит номер на сайте → `POST /api/auth/request-code`
2. Бэк нормализует номер (`+79991234567`), проверяет rate-limit
3. Генерирует 6-значный код, кладёт в KV с TTL 5 минут
4. Помещает задачу в очередь `sms:queue`

### Отправка

5. Android-приложение раз в 3 сек делает `GET /api/sms/pending`
6. Получает массив задач, для каждой вызывает `SmsManager.sendTextMessage()`
7. После отправки шлёт `POST /api/sms/sent` с результатами

### Проверка кода

8. Юзер вводит код → `POST /api/auth/verify-code`
9. Бэк сверяет, при успехе выдаёт JWT в httpOnly cookie на 7 дней
10. Редирект на `/success`

## 4. Лимиты (rate-limit)

| Ограничение | Лимит |
|---|---|
| Повторная отправка СМС на номер | не чаще 1 раза в 60 сек |
| Запросов СМС на номер | максимум 5 в час |
| Запросов СМС с одного IP | максимум 20 в час |
| Попыток ввода кода | 3, потом код инвалидируется |
| Время жизни кода | 5 минут |
| Время жизни сессии | 7 дней |

Параметры — в [web/lib/rate-limit.ts](web/lib/rate-limit.ts) и [web/lib/codes.ts](web/lib/codes.ts).

## 5. Безопасность

- JWT в **httpOnly** cookie + `sameSite=lax` + `secure` в продакшене
- Gateway-эндпоинты (`/api/sms/*`) защищены Bearer-токеном, разделённым с пользовательским JWT
- Коды хранятся в KV с автоматическим TTL — не нужно чистить вручную
- Phone normalization предотвращает обход лимитов через разные форматы одного номера
- Rate-limit И по номеру, И по IP — защита от спама и от перебора номеров

## 6. Что можно улучшить (если понадобится)

- Хранить пользователей в Vercel Postgres (сейчас сессия — это просто номер в JWT, отдельной таблицы users нет)
- Добавить таблицу `audit_log` для аудита входов
- Сменить `console.log` в `/api/sms/sent` на запись в БД, чтобы видеть статистику отправок
- На Android: вторая симка / выбор симки, если в телефоне их несколько
- Кастомизация шаблона СМС (сейчас зашит в `/api/auth/request-code`)

## Файлы по полочкам

**Backend:**
- [web/app/api/auth/request-code/route.ts](web/app/api/auth/request-code/route.ts) — запрос кода
- [web/app/api/auth/verify-code/route.ts](web/app/api/auth/verify-code/route.ts) — проверка кода
- [web/app/api/sms/pending/route.ts](web/app/api/sms/pending/route.ts) — выдача задач Android-у
- [web/app/api/sms/sent/route.ts](web/app/api/sms/sent/route.ts) — отчёт от Android-а
- [web/lib/rate-limit.ts](web/lib/rate-limit.ts) — все лимиты
- [web/lib/auth.ts](web/lib/auth.ts) — JWT
- [web/middleware.ts](web/middleware.ts) — защита `/success`

**Frontend:**
- [web/app/page.tsx](web/app/page.tsx) — ввод номера
- [web/app/verify/page.tsx](web/app/verify/page.tsx) — ввод кода
- [web/app/success/page.tsx](web/app/success/page.tsx) — экран успеха

**Android:**
- [android/app/src/main/java/com/smsvxod/gateway/MainActivity.kt](android/app/src/main/java/com/smsvxod/gateway/MainActivity.kt) — UI
- [android/app/src/main/java/com/smsvxod/gateway/GatewayService.kt](android/app/src/main/java/com/smsvxod/gateway/GatewayService.kt) — Foreground Service с polling
- [android/app/src/main/java/com/smsvxod/gateway/SmsSender.kt](android/app/src/main/java/com/smsvxod/gateway/SmsSender.kt) — обёртка над `SmsManager`
- [android/app/src/main/java/com/smsvxod/gateway/GatewayApi.kt](android/app/src/main/java/com/smsvxod/gateway/GatewayApi.kt) — HTTP-клиент
