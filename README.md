# Wealth Portfolio Tracker

A secure, multi-asset wealth portfolio management prototype built with Next.js, PostgreSQL, ZenStack (policy-enforced Prisma), and the Vercel AI SDK.

Demonstrates **role-based access control (RBAC)** enforced at the database policy layer, **append-only ledger accounting** with zero floating-point drift, and **agentic write safety** where an AI assistant can propose transactions but can **never** commit them without explicit user confirmation.

---

## 1. What the Project Does & Scope Rationale

### Goal

To build a focused, production-grade vertical slice showcasing full-stack engineering judgment, security invariants, streaming AI orchestration, and clean architecture.

### Scope Decisions

- **Implemented**:
  - Interactive multi-asset dashboard (Stocks, Crypto, Real Estate, Cash) with real-time valuation and allocation breakdowns.
  - Three distinct household roles: `OWNER`, `EDITOR`, and `VIEWER`.
  - Immutable append-only transaction ledger with average-cost cost-basis and unrealized PnL derivation.
  - Policy-enforced data access layer (`dbFor(userId)`) via ZenStack v2 that guarantees UI routes and AI tools share the exact same security rules.
  - Streamed AI financial assistant with bounded read tools (`getPortfolioSummary`, `listHoldings`, `getTransactions`, `suggestRebalance`).
  - Human-in-the-loop transaction proposal workflow (`proposeTransaction` generates a proposal card; the user must explicitly click **Confirm Transaction** before the server commits the write).
  - Quick Persona Switcher in the top navigation to instantly evaluate `Alice (Owner)`, `Bob (Editor)`, and `Carol (Viewer)` permissions with one click.
  - Resilient AI fallback: Works with live Anthropic Claude streaming when an API key is provided, or in deterministic local execution mode when no API key is set (never crashes).
- **Intentionally Deferred**:
  - Live third-party market data feeds & broker APIs (sample data is deterministic and clearly labeled).
  - Redis/BullMQ background queues (cron simulated via endpoint).
  - WebSockets / presence / collaborative live cursors.
  - Multi-currency FX hedging & automated bot trading.

---

## 2. Architecture & Design Decisions

```text
 Browser (Next.js React Client)
   |
   +---> Persona Switcher (Alice - Owner / Bob - Editor / Carol - Viewer)
   +---> Portfolio Dashboard & Holdings Projection
   +---> Direct Transaction Modal
   +---> Streamed AI Assistant & Proposal Confirmation Card
                 |
                 v
 Next.js App Router (Route Handlers / API)
   |
   +---> Authentication (Session / uid Cookie)
   +---> Zod Input Validation
                 |
                 v
 Data Access Layer (DAL) / Policy Enforcement
   |     - Closed over current authenticated userId
   |     - Enforced by ZenStack Runtime (fails closed)
   |     - Single source of truth for both Web UI and AI Tools
   |
   +-----------------------+-----------------------+
   |                                               |
   v                                               v
 Domain Valuation Service                    AI Tool Orchestrator
   - deriveHolding (Decimal.js)                - getPortfolioSummary()
   - computeHoldings (average cost)            - listHoldings()
   - computeAllocation (class %)               - getTransactions(limit)
   - computeRebalance (target weights)         - suggestRebalance()
                                               - proposeTransaction() [Owner/Editor only]
                                                   (NO DB writes; proposals only)
   |                                               |
   +-----------------------+-----------------------+
                           |
                           v
           Prisma ORM (Enhanced Client: dbFor)
                           |
                           v
                PostgreSQL Database
```

### Why a Single Next.js Application?

Using Next.js App Router combines the frontend, typed API routes, server-side data access, and streaming AI handlers in one cohesive codebase. A separate Express/Fastify service would duplicate authentication, TypeScript type contracts, and authorization policies without adding architectural value for this workload.

---

## 3. Technology Stack & Trade-offs

| Layer | Technology | Rationale |
| --- | --- | --- |
| **Framework** | Next.js 15 (App Router, React 19, TypeScript) | Unified full-stack TypeScript, typed boundaries, native SSE streaming support |
| **Styling** | Modern CSS (Plus Jakarta Sans, JetBrains Mono, Glassmorphism) | High visual polish, custom dark design system, zero build config conflicts |
| **Database** | PostgreSQL 16 | ACID transactions, decimal precision columns (`Decimal(28, 10)`), relational constraints |
| **ORM & Policies** | Prisma + ZenStack v2 | Declarative row-level security policies (`@@allow`) enforced at query time |
| **Arithmetic** | Decimal.js | Exact financial math; prevents IEEE 754 floating-point drift |
| **AI / Streaming** | Vercel AI SDK (`ai`) | Standardized streaming responses, structured tool calling, and SSE UI streams |
| **Icons** | Lucide React | Crisp, accessible iconography |
| **Testing** | Vitest | Fast test runner verifying permissions, valuation, and ledger invariants |

---

## 4. Role-Permission Matrix

| Action | Owner (Alice) | Editor (Bob) | Viewer (Carol) | Outsider |
| --- | :---: | :---: | :---: | :---: |
| View Portfolio & Holdings | ✅ Yes | ✅ Yes | ✅ Yes | ❌ Denied (Empty) |
| View Transaction Ledger | ✅ Yes | ✅ Yes | ✅ Yes | ❌ Denied (Empty) |
| Direct Transaction Creation | ✅ Yes | ✅ Yes | ❌ 403 Forbidden | ❌ 403 Forbidden |
| Manage Household Members | ✅ Yes | ❌ Denied | ❌ Denied | ❌ Denied |
| AI Read Tools (Summary, Holdings) | ✅ Yes | ✅ Yes | ✅ Yes | ❌ 403 Forbidden |
| AI Transaction Proposals | ✅ Tool registered | ✅ Tool registered | ❌ Tool omitted | ❌ 403 Forbidden |
| Confirm Transaction Proposal | ✅ Yes | ✅ Yes | ❌ 403 Policy Denial | ❌ 403 Forbidden |
| Update / Delete Prior Transactions | ❌ Immutable | ❌ Immutable | ❌ Immutable | ❌ Immutable |

---

## 5. Agentic Write Safety & Tool Execution

1. **Identity & Scope Isolation**: AI tools are instantiated via `createAgentTools({ userId, portfolioId, role, db })`. The model is **never** permitted to provide `userId`, `portfolioId`, or `role` parameters — they are closed over server-side after verifying membership.
2. **Read Tools Are Scoped**: `getPortfolioSummary`, `listHoldings`, `getTransactions`, and `suggestRebalance` query only assets belonging to `portfolioId`.
3. **No Direct Execution**: The AI tool `proposeTransaction` has **zero database write side-effects**. It validates the asset and returns a structured proposal object with `status: 'needs_confirmation'`.
4. **Human-in-the-Loop Confirmation**: The UI renders a dedicated **Pending Transaction Proposal** card. The transaction is only committed when the user clicks **Confirm Transaction**, which calls `POST /api/agent/confirm`. That route re-authenticates the user and executes the write through `dbFor(user.id)`, which enforces ZenStack policies before persisting.
5. **Viewer Restrictions**: For Viewers (`role === 'VIEWER'`), `proposeTransaction` is not even registered in the toolset. If the endpoint is called directly, the data access layer rejects the write with a 403 policy violation.

---

## 6. Quick Start & Setup Instructions

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for PostgreSQL)

### 1. Clone & Configure

```bash
# Clone the repository
git clone https://github.com/zabmw89/Wealth-Tracker.git
cd wealth-tracker

# Copy environment variables
cp .env.example .env
```

### 2. Start PostgreSQL

```bash
docker compose up -d
```

### 3. Install & Generate

```bash
npm install
npm run generate    # ZenStack policy compiler + Prisma Client generator
npm run db:push     # Push schema to PostgreSQL
npm run seed        # Seed demo users (Alice, Bob, Carol) and initial transactions
```

### 4. Run Automated Tests

```bash
npm test
```

*Executes all 16 automated tests covering valuation accounting, append-only transactions, agent boundary rules, outsider isolation, and Viewer denial.*

### 5. Launch the Development Server

```bash
npm run dev
```

## 7. Seed Accounts & Demo Walkthrough

The seed script creates a demo household with three test accounts:

| User | Email | Role | Test Scenarios |
| --- | --- | --- | --- |
| **Alice** | `alice@demo.test` | **OWNER** | Full administrative rights, record transactions, manage members, AI proposals |
| **Bob** | `bob@demo.test` | **EDITOR** | Can record transactions and prepare AI proposals; cannot manage members |
| **Carol** | `carol@demo.test` | **VIEWER** | Read-only access; "Record Transaction" is locked; AI write tools omitted; direct API writes denied (403) |

> **Tip**: You can switch between Alice, Bob, and Carol with a single click using the **Persona Switcher** in the top navigation bar.

---

## 8. API Reference

| Endpoint | Method | Role Required | Description |
| --- | --- | --- | --- |
| `/api/portfolio` | `GET` | Member (`OWNER`, `EDITOR`, `VIEWER`) | Returns current user, role, portfolio totals, holdings projection, and recent transactions |
| `/api/transactions` | `POST` | `OWNER` or `EDITOR` | Records a new transaction; atomically updates holdings projection; rejected for Viewers |
| `/api/chat` | `POST` | Member (`OWNER`, `EDITOR`, `VIEWER`) | Streams AI assistant responses using bounded portfolio tools |
| `/api/agent/confirm` | `POST` | `OWNER` or `EDITOR` | Commits an approved AI transaction proposal; logs to `AuditLog` |
| `/api/prices/refresh` | `POST` | Authenticated | Refreshes market price snapshots with demo timestamps |
| `/api/dev-login?email=...` | `GET` | Any | Sets the authentication cookie (`uid`) for local demo testing |

---

## 9. Financial & Accounting Assumptions

- **Average-Cost Accounting**: Holdings quantities and cost-basis are derived directly from the transaction ledger:
  - On `BUY` or `DEPOSIT`: `quantity += q`, `costBasis += (q * price) + fee`.
  - On `SELL`: cost basis is reduced by `(costBasis / quantity) * q`, preserving average unit cost.
- **Cash Valuation**: Cash balances are anchored 1:1 (`USD`).
- **Real Estate**: Real estate assets fall back to the most recent purchase/appraisal transaction price.
- **Demo Data Disclaimer**: All price quotes and transactions are simulated demonstration data for technical assessment review.

---

## Author

Ahmet Zahir Absi — Software Engineer

GitHub: <https://github.com/zabmw89>

Portfolio: <https://devfolioahmed.vercel.app/>

---

⭐ If you find this project interesting, consider giving the repository a star.
