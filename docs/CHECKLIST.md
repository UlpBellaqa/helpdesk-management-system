# Sistemet e Shperndara 2025/26 - Checklist

| # | Kerkesa | Status |
|---|---|---|
| 1 | Arkitektura klient-server | `frontend` dhe `backend` jane projekte te ndara dhe komunikojne vetem me API. |
| 2 | HTTP/HTTPS REST | Express REST API me JSON dhe metodat `GET`, `POST`, `PUT`, `PATCH`, `DELETE`. |
| 3 | Minimum 20 endpoints | 22 resource CRUD + auth/search/AI/jobs/ticket workflow. |
| 4 | RESTful framework | Node.js + Express. |
| 5 | Programimi OOP | `MemoryRepository`, `PostgresRepository`, cache classes, queue class dhe store classes. |
| 6 | Swagger | `/api-docs` dhe `/api-docs.json`. |
| 7 | ORM dhe databaza | Repository/ORM i thjeshte mbi `pg`; runtime perdor PostgreSQL kur vendoset `DATABASE_URL`. |
| 8 | Auth dhe autorizim | Login/register, token HMAC dhe role checks per admin resources/status workflow. |
| 9 | Middleware | Auth middleware dhe audit/logging middleware. |
| 10 | Frontend React + Context | React app me `AuthProvider`, `AuthContext`, `useAuth`. |
| 11 | Testimi + CI/CD | Backend API tests, frontend lint/build dhe GitHub Actions workflow. |
| 12 | Minimum 20 modele/migrime | 22 modele ne `001_initial_schema.json`; SQL migration krijon 22 tabela PostgreSQL. |
| 13 | Dokumentimi i Projektit | README, checklist dhe Swagger. |
| 14 | Menaxhimi i Projektit | Backlog i ndare per GitHub Projects/Issues. |
| 15 | Git dhe bashkepunimi | Repo ne GitHub, PR workflow dhe CI. |
| 16 | Integrimi me OpenAI | `/api/ai/chat` thirret me `OPENAI_API_KEY` ose kthen demo reply. |
| 17 | Caching Redis | `RedisCache` perdor Redis per `/api/search`; ka fallback memory per test/dev pa Redis. |
| 18 | Background jobs | `BackgroundQueue` dhe `/api/jobs`; status/comment/AI krijojne jobs. |
| 19 | Multi-tenancy | `tenantId` izolon kompanite/perdoruesit ne repository dhe API. |
| 20 | Search/filtering | Query `q`, filters ne list endpoints dhe global `/api/search`. |

## Stack i kerkuar

- React
- Node.js
- PostgreSQL
- Redis

## Komandat

```bash
docker compose up -d postgres redis
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

```bash
cd backend
npm test
cd ../frontend
npm run lint
npm run build
```
