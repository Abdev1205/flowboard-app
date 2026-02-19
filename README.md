# Real-Time Collaborative Task Board

A Kanban-style task board with real-time collaboration, conflict resolution, and offline support.

## Features

- **Real-Time Sync**: Updates propagate instantly via WebSockets (`socket.io`).
- **Conflict Resolution**:
  - **Move + Edit**: Automatically merges concurrent moves and edits without data loss.
  - **Move + Move**: Uses a Redis-based mutex to deterministically accept the first move and notify the conflicting user.
  - **Reorder**: Uses fractional indexing for O(1) consistent ordering.
- **Offline Support**: Queues actions locally when disconnected and replays them upon reconnection (with conflict resolution).
- **Optimistic UI**: Immediate local updates with rollback on server failure/conflict.

## Architecture

- **Frontend**: React, TypeScript, Vite, Zustand, Tailwind CSS, dnd-kit.
- **Backend**: Node.js, Express, Socket.io, TypeScript.
- **Database**: PostgreSQL (via Supabase).
- **Cache**: Redis - used as an authoritative write-around cache and for distributed locks.

See [DESIGN.md](./DESIGN.md) for detailed architecture and trade-off analysis.

## Setup Instructions

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local frontend dev)

### Running Locally

1. **Start the backend and services (Redis/Database)**
   The project is configured to work with a single command:

   ```bash
   docker compose up --build
   ```

   *Note: The default `docker-compose.yml` sets up the server. If you need a local Postgres/Redis, ensure `.env` points to them or add them to the compose file.*

2. **Start the frontend**
   Open a new terminal:

   ```bash
   cd apps/web
   npm install
   npm run dev
   ```

   Access the app at `http://localhost:5173`.

## Testing

Unit tests for conflict resolution and ordering logic:

```bash
cd apps/server
npm run test
```

## Deployment

### Live URL
`https://flowboard-demo.railway.app` *(Placeholder - Deploy to see live version)*

### Deployment Guide
1. **Backend**: Deploy `apps/server` to Railway/Render. Set `REDIS_URL` and `DATABASE_URL`.
2. **Frontend**: Deploy `apps/web` to Vercel/Netlify. Set `VITE_WS_URL` to the backend URL.
