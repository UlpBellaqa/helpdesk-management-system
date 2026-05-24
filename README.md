# Helpdesk Management System

Projekt per lenden **Sistemet e Shperndara 2025/26**.

Platforme per menaxhimin e tiketave te supportit per kompani te ndryshme. Perdoruesit raportojne probleme, ndjekin statusin e kerkesave dhe komunikojne me agjentet e supportit.

## Teknologjite

- Next.js 16 (React 19)
- Node.js + Express 5
- Prisma ORM
- PostgreSQL
- Redis
- Google Gemini AI + OpenAI fallback

## Struktura

- `backend`: REST API, auth, ticket management, Prisma ORM, Redis cache.
- `frontend`: Next.js 16 app router + Context API.
- `docker-compose.yml`: PostgreSQL dhe Redis per zhvillim lokal.
- `backend/prisma`: Prisma schema me 22 modele.

## Nisja Lokale

```bash
docker compose up -d postgres redis
```

```bash
cd backend
copy .env.example .env
# Edit .env and set DATABASE_URL and TOKEN_SECRET
npm install
npx prisma generate
npx prisma migrate dev
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
- AI endpoint `/api/ai/chat` (Google Gemini primary, OpenAI fallback)
- Swagger docs

## Testet

```bash
cd backend
npm test
npm run test:db
```

```bash
cd frontend
npm run lint
npm test
npm run build
```

Testet backend perfshijne API tests me store ne memorie dhe database integration tests me PostgreSQL kur vendoset `DATABASE_URL`. Frontend perdor Vitest dhe React Testing Library per component tests, plus lint dhe production build ne CI. Kur vendoset `REDIS_URL`, kerkimi cache-ohet ne Redis.

## CI/CD

CI eshte konfiguruar ne `.github/workflows/ci.yml` dhe ekzekutohet ne `push` ne `main` ose `pull_request`.

CD eshte konfiguruar ne `.github/workflows/cd.yml`. Deploy ekzekutohet automatikisht pasi CI kalon me sukses ne `main`, ose manualisht nga GitHub Actions me `workflow_dispatch`.

Per CD duhen keto GitHub repository secrets:

- `DEPLOY_HOST`: IP ose domain i serverit.
- `DEPLOY_USER`: user-i SSH ne server.
- `DEPLOY_SSH_KEY`: private key per SSH deploy.
- `DEPLOY_PATH`: folderi ku ndodhet projekti ne server.
- `DEPLOY_RESTART_COMMAND`: komanda qe ristarton aplikacionin, p.sh. `pm2 restart helpdesk-backend && pm2 restart helpdesk-frontend`.
- `DEPLOY_PORT`: opsional, default eshte `22`.

Workflow ben `git pull`, instalon dependencies, gjeneron Prisma client, ekzekuton migrimet, teston backend-in, ben build frontend-in dhe pastaj ekzekuton komanden e restartimit.
