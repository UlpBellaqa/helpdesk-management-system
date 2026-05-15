# Helpdesk Management System

Projekt per lenden **Sistemet e Shperndara 2025/26**.

Platforme per menaxhimin e tiketave te supportit per kompani te ndryshme. Perdoruesit raportojne probleme, ndjekin statusin e kerkesave dhe komunikojne me agjentet e supportit.

## Teknologjite

- React
- Node.js + Express
- PostgreSQL
- Redis

## Struktura

- `backend`: REST API, auth, ticket management, PostgreSQL repository layer, Redis cache.
- `frontend`: React + Context API.
- `docker-compose.yml`: PostgreSQL dhe Redis per zhvillim lokal.
- `backend/migrations`: schema SQL dhe lista e 22 modeleve.

## Nisja Lokale

```bash
docker compose up -d postgres redis
```

```bash
cd backend
copy .env.example .env
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

URL-te kryesore:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Swagger: `http://localhost:4000/api-docs`

Kredenciale demo:

- `admin@demo.com` / `admin123`
- `agent@demo.com` / `agent123`

## API

API perfshin:

- login/register dhe `/api/auth/me`
- CRUD per 22 resource
- ticket comments dhe status updates
- search/filtering me Redis cache
- background jobs
- OpenAI endpoint `/api/ai/chat`
- Swagger docs

## Testet

```bash
cd backend
npm test
```

```bash
cd frontend
npm run lint
npm run build
```

Testet backend perdorin nje store ne memorie per te qene te thjeshta ne CI. Kur vendoset `DATABASE_URL`, aplikacioni real perdor PostgreSQL; kur vendoset `REDIS_URL`, kerkimi cache-ohet ne Redis.

## Shtrim Projekti

Backlog-u ne GitHub Projects mund te ndahet sipas ketyre pjeseve: auth/roles, PostgreSQL schema, multi-tenancy, ticket CRUD, comments/status updates, search/filtering, Redis cache, OpenAI, Swagger, frontend, tests/CI dhe dokumentim.
