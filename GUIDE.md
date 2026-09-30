# OpsFlow — Operations Under Pressure ⚡️

OpsFlow is a scalable, resilient operational work management platform designed for high-concurrency environments. It allows teams to create, track, triage, and resolve operational incidents and tasks efficiently without stepping on each other's toes.

## Critical Capabilities Included

This project fulfills all core critical capabilities requested:
1. **Optimistic Concurrency & Safe Updates**: Prevents lost updates when multiple users edit the same work item using Prisma's row versioning (`@default(1)`).
2. **Idempotency**: Prevents duplicate execution of critical actions using Redis-backed idempotency keys (`SET NX`).
3. **Atomic Assignment**: Prevents two people from claiming the same ticket at the exact same moment using `SELECT FOR UPDATE` and version checks.
4. **State Machine Validation**: Prevents invalid workflows (e.g. going from `OPEN` to `RESOLVED` directly) with a robust server-side state machine.
5. **Real-time Conflict Detection**: Notifies users via Socket.IO if someone else is viewing or editing the same item.
6. **Asynchronous Processing**: Non-blocking background workers using BullMQ and Redis for heavy tasks (notifications, AI triage).

### 🌟 Bonus: AI-Powered Intelligence Layer
OpsFlow uses an **MCP-Style Tool-Use AI Architecture**. The AI features gracefully degrade if the API isn't available, but when active, it provides:
- **Auto-Triage**: Suggests Priority, Type, and Tags based on the ticket description.
- **Auto-Summarization**: Reads the activity log and discussion to provide a 3-bullet-point summary of long-running tickets.
- **Smart Assignment (Bonus)**: Recommends the best team member to handle an issue based on context.

---

## Prerequisites

- **Node.js** (v26.x or newer recommended)
- **PostgreSQL** (with the `pgvector` extension installed)
- **Redis**
- **Docker & Docker Compose** (Optional, for easier DB/Redis setup)

---

## Local Setup Instructions

### 1. Database & Redis Setup
**Option A: Using Docker (Recommended)**
1. Navigate to the project root.
2. Run `docker compose up -d` to spin up PostgreSQL and Redis.
   - *Note: The provided `docker-compose.yml` automatically includes the `pgvector` image.*

**Option B: Using Native Services**
Ensure PostgreSQL and Redis are running locally on their default ports (`5432` and `6379`).

### 2. Environment Variables
1. Navigate to the `server/` directory.
2. The `.env` file should already be configured for local development:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/opsflow?schema=public"
   REDIS_URL="redis://localhost:6379"
   PORT=4000
   JWT_SECRET="opsflow-super-secret-key-do-not-use-in-prod"
   # Optional: Add your Gemini API key here for AI features
   # GEMINI_API_KEY="your-api-key"
   ```

### 3. Server Setup
1. Navigate to the `server/` directory:
   ```bash
   cd server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate Prisma client, push the schema, and seed the database:
   ```bash
   npx prisma generate
   npx prisma db push
   npx tsx prisma/seed.ts
   ```
   *The seed script creates a rich demo environment with 6 users, 3 teams, and 10 realistic work items.*

### 4. Client Setup
1. Open a new terminal and navigate to the `client/` directory:
   ```bash
   cd client
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### 5. Running Integration Tests
To prove the critical capabilities of the application (Optimistic Concurrency, Idempotency, State Machine), an integration test suite has been provided.

1. Ensure both the database and the server are running locally (`npm run dev`).
2. Run the tests in the `server` directory:
   ```bash
   cd server
   npm run test
   ```

---

## Running the Application

1. **Start the Server:**
   In the `server/` directory, run:
   ```bash
   npm run dev
   ```
   The backend API, WebSocket server, and BullMQ workers will start on `http://localhost:4000`.

2. **Start the Client:**
   In the `client/` directory, run:
   ```bash
   npm run dev
   ```
   The Vite dev server will start on `http://localhost:5173`.

### Demo Credentials
Open your browser to `http://localhost:5173` and log in with:
- **Email**: `demo@opsflow.com` (or `alice@opsflow.com`, `bob@opsflow.com`, etc.)
- **Password**: `password123`

---

## Architecture Overview

- **Frontend**: React 18 + Vite + TypeScript. Uses `@tanstack/react-query` for data fetching, caching, and optimistic UI updates. Custom vanilla CSS for a premium dark-mode aesthetic.
- **Backend API**: Node.js + Express. Highly modular router structure.
- **Database**: PostgreSQL accessed via Prisma ORM.
- **Queue System**: BullMQ backed by Redis for offloading AI generation and notification dispatching.
- **Real-Time**: Socket.IO for presence indicators ("Alice is viewing this item") and instant cross-client updates.
- **AI Integration**: Uses Google's `@google/generative-ai` SDK (`gemini-2.0-flash`) as the brain behind the triage and summarization tools.
