# Helpdesk Management System

Projekt demo per lenden **Sistemet e Shperndara 2025/26**.

## Arkitektura

- `backend`: Express REST API, klient/server te ndare, komunikim vetem me HTTP.
- `frontend`: React + Context API.
- Multi-tenancy realizohet me `tenantId` ne cdo entitet.
- Dokumentimi API: `http://localhost:4000/api-docs`.

## Backend

```bash
cd backend
npm install
npm run dev
```

Kredenciale demo:

- `admin@demo.com` / `admin123`
- `agent@demo.com` / `agent123`

API perfshin login/register, 20+ burime REST, search/filtering, cache ne memorie, background jobs, audit logging middleware dhe endpoint AI.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

## Testet

```bash
cd backend
npm test
cd ../frontend
npm run build
```

## Modelet

Projekti ka mbi 20 modele te strukturuara: Tenant, User, Role, Permission, Department, Team, AgentProfile, Customer, ServiceCatalog, SlaPolicy, Priority, Category, Ticket, TicketComment, TicketAttachment, TicketHistory, KnowledgeArticle, Notification, AuditLog, AiConversation, CacheEntry dhe BackgroundJob.

Ne kete version demo, repository/ORM eshte implementuar ne memorie me klasa OOP. Per prodhim mund te zevendesohet me Prisma/Sequelize dhe migrime SQL duke ruajtur te njejtat endpoint-e.
