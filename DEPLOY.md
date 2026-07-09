# Deploy — Monitor de scrapers + orquestación BullMQ

Arquitectura de la feature:

```
┌──────────────────────┐        cola "scrapers"        ┌──────────────────────┐
│  Backend NestJS       │  ──enqueue jobs (BullMQ)──►   │  Worker de scrapers   │
│  (Servicio 1, ya      │        Upstash Redis          │  (Servicio 2, nuevo)  │
│   existe)             │  ◄──lee scraper_runs────      │  Playwright + BullMQ  │
│  - Scheduler (cron)   │        Supabase               │  - concurrencia 3     │
│  - GET/POST /admin/…  │                               │  - GET /health        │
└──────────┬────────────┘                               └──────────┬────────────┘
           │                                                        │
           └──────────────────── Supabase (scraper_runs) ──────────┘
```

- **El backend sólo encola y lee estado.** El scheduler (`@nestjs/schedule`,
  cron con timezone ART) encola un job por scraper en la cola `scrapers`.
- **El worker vive en el servicio de scrapers.** Procesa la cola con
  concurrencia 3 y registra cada corrida en `scraper_runs` vía `runScraper`.
- Ambos servicios comparten **la misma** instancia de Upstash Redis y de
  Supabase.

---

## 0) Migración de base de datos (Supabase)

Correr en el **SQL Editor de Supabase**:

```
db/migrations/2026-07-09_scraper_runs_v2.sql
```

Crea/recrea `scraper_runs` (esquema v2), la tabla `user_roles`, la función
`is_admin()` y las policies de RLS (lectura del monitor sólo para admins).

> ⚠️ La migración hace `drop table scraper_runs` (el esquema viejo era
> incompatible). Es data operativa efímera que se repuebla en cada corrida,
> por eso no hay backfill.

Marcar un usuario como admin (además del claim JWT / `ADMIN_EMAILS`):

```sql
insert into user_roles (user_id, role)
values ('<uuid-del-usuario>', 'admin')
on conflict (user_id) do update set role = 'admin';
```

---

## 1) Credenciales de Upstash Redis (conexión TCP / ioredis)

Desde la consola de Upstash, sección **"Connect" → "ioredis / TCP"** (no la
REST API). Anotá host, puerto y password. Upstash usa TLS.

Variables (idénticas en backend y worker):

| Variable         | Ejemplo                          | Notas                         |
|------------------|----------------------------------|-------------------------------|
| `REDIS_HOST`     | `xxx.upstash.io`                 | host TCP de Upstash           |
| `REDIS_PORT`     | `6379`                           | puerto TCP                    |
| `REDIS_PASSWORD` | `Ab1...`                         | password de la instancia      |
| `REDIS_TLS`      | `true`                           | Upstash requiere TLS          |

---

## 2) Servicio 1 — Backend NestJS (ya existe)

Sólo hay que **agregar las variables de Redis** si faltan. El resto del
servicio no cambia.

**Variables de entorno:**

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>
ADMIN_EMAILS=vos@mail.com,otro@mail.com   # admins por email (opcional si usás user_roles)
CORS_ORIGIN=https://tu-frontend            # opcional
REDIS_HOST=xxx.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=<password>
REDIS_TLS=true
```

**Build / Start (Render, Node service):**

```
Root Directory:  backend
Build Command:   npm ci && npm run build
Start Command:   npm run start:prod
Health Check:    /            (el backend ya responde en GET /)
```

Endpoints nuevos (todos con guard de admin — `JwtGuard + AdminGuard`):

- `GET  /admin/scrapers/status` — última corrida de cada scraper + agregados.
- `GET  /admin/scrapers/:name/runs?limit=20` — historial de un scraper.
- `POST /admin/scrapers/:name/run` — encola una corrida manual.

`:name` es el slug del scraper: `galicia`, `naranja-x`, `bbva`, `carrefour`,
`coto`, `dia`, `jumbo`, `disco`, `vea`, `la-anonima`, `changomas`, `farmacity`.

---

## 3) Servicio 2 — Worker de scrapers (nuevo)

Es un **worker**, no un HTTP server: su `Start Command` levanta el consumidor
de la cola BullMQ. Igual expone un `GET /health` mínimo para el health check
del hosting.

Usa el `Dockerfile` de `scrapers/` (imagen `mcr.microsoft.com/playwright`
para que Chromium funcione).

**En Render (Web Service con Docker):**

```
Root Directory:   scrapers
Environment:      Docker
Dockerfile Path:  scrapers/Dockerfile
Health Check:     /health          (puerto expuesto: 3001, o el $PORT que asigne Render)
```

> El `Dockerfile` ya hace `CMD ["node", "dist/worker.js"]`. Si el hosting
> pide un start command explícito en vez de Docker CMD, usar:
> `npm ci && npm run build && npm run start` (start = `node dist/worker.js`).

**Variables de entorno:**

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>
REDIS_HOST=xxx.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=<password>
REDIS_TLS=true
WORKER_CONCURRENCY=3        # opcional (default 3)
PORT=3001                   # el hosting normalmente lo inyecta; el /health lo usa
```

El `GET /health` responde:
- `200` si el worker está corriendo **y** conectado a Redis.
- `503` si Redis está caído o el worker se detuvo.

```json
{ "status": "ok", "redis": "connected", "worker": "running", "scrapers": ["galicia", ...] }
```

> **Railway:** mismo Dockerfile y mismas variables. Railway inyecta `PORT`;
> el health check apunta a `/health`.

---

## 4) Orquestación (cron) — corre en el backend

El scheduler (`backend/src/admin-scrapers/admin-scrapers.scheduler.ts`) encola
los jobs automáticamente, en horario de Argentina (`America/Argentina/Buenos_Aires`):

| Grupo         | Horario ART    | Cron          |
|---------------|----------------|---------------|
| Supermercados | 06:00 y 15:00  | `0 6 * * *` y `0 15 * * *` |
| Bancos        | 07:00          | `0 7 * * *`   |

Cada job se encola con **2 reintentos** (3 intentos totales) y **backoff
exponencial** (30s base). El worker los toma con concurrencia 3.

> Nota: el scheduler debe correr en **una sola** instancia del backend. Si
> escalás el backend a varias réplicas, mové el scheduler a un proceso único
> o usá jobs repetibles de BullMQ para evitar encolar duplicados.

---

## 5) Verificación post-deploy

1. **Migración aplicada:** `select * from scraper_runs limit 1;` no da error.
2. **Worker vivo:** `curl https://<worker>/health` → `200` con `redis: connected`.
3. **Encolar manual:** desde la app (admin) → *Perfil → Monitor de scrapers →*
   botón ▶️ *Ejecutar ahora*, o
   `POST /admin/scrapers/carrefour/run` con `Authorization: Bearer <token admin>`.
4. **Ver estado:** `GET /admin/scrapers/status` debería mostrar el scraper en
   `running` y luego `success`/`partial`/`error`.
5. **Pantalla:** `Perfil → Monitor de scrapers` (visible sólo para admins).

---

## Resumen de variables de entorno

| Variable               | Backend | Worker | Descripción                          |
|------------------------|:-------:|:------:|--------------------------------------|
| `SUPABASE_URL`         |   ✅    |   ✅   | URL del proyecto Supabase            |
| `SUPABASE_SERVICE_KEY` |   ✅    |   ✅   | service_role key (bypassa RLS)       |
| `REDIS_HOST`           |   ✅    |   ✅   | host TCP de Upstash                  |
| `REDIS_PORT`           |   ✅    |   ✅   | puerto TCP (6379)                    |
| `REDIS_PASSWORD`       |   ✅    |   ✅   | password de Redis                    |
| `REDIS_TLS`            |   ✅    |   ✅   | `true` para Upstash                  |
| `WORKER_CONCURRENCY`   |         |   ✅   | jobs en paralelo (default 3)         |
| `PORT`                 |   ✅    |   ✅   | puerto HTTP (health check del worker)|
| `ADMIN_EMAILS`         |   ✅    |        | admins por email (coma-separado)     |
| `CORS_ORIGIN`          |   ✅    |        | origen del frontend (opcional)       |
