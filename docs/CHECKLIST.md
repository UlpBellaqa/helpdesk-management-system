# Sistemet e Shperndara 2025/26 - Checklist

| # | Kerkesa | Status |
|---|---|---|
| 1 | Arkitektura klient-server | Backend dhe frontend jane te ndara. |
| 2 | HTTP/HTTPS REST | Express API me REST endpoints. |
| 3 | Minimum 20 endpoints | Swagger gjeneron 115 operacione. |
| 4 | RESTful framework | Node.js + Express. |
| 5 | OOP | Modelet, repository, cache dhe queue jane klasa. |
| 6 | Swagger | `/api-docs` dhe `/api-docs.json`. |
| 7 | ORM dhe databaza | Repository/ORM demo ne memorie; i zevendesueshem me Prisma/Sequelize. |
| 8 | Auth dhe autorizim | Login/register, token, role checks per admin resources. |
| 9 | Middleware | Logging/audit dhe auth middleware. |
| 10 | React + Context | `AuthProvider` dhe `useAuth`. |
| 11 | Testim + CI/CD | `backend/server.test.js` dhe GitHub Actions workflow. |
| 12 | Minimum 20 modele/migrime | 22 modele dhe `backend/migrations/001_initial_schema.json`. |
| 13 | Dokumentim | README + ky checklist. |
| 14 | Menaxhim projekti | Mund te lidhet me GitHub Projects/Jira; backlog rekomandohet ne Issues. |
| 15 | Git + PR reviews | Workflow i projektit parashikon PR dhe CI. |
| 16 | OpenAI LLM | `/api/ai/chat` perdor OpenAI Responses API kur ka `OPENAI_API_KEY`. |
| 17 | Caching | `CacheService` per `/api/search`. |
| 18 | Background jobs | `BackgroundQueue` dhe `/api/jobs`. |
| 19 | Multi-tenancy | `tenantId` ne te gjitha resource-t. |
| 20 | Search/filtering | `q` dhe query filters ne list endpoints + `/api/search`. |

## Shenim per prodhim

Ky version eshte MVP akademik. Per dorezim me databaze reale, repository ne memorie mund te zevendesohet me Prisma ose Sequelize pa ndryshuar kontraten REST te frontend-it.
