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
- **Cache**: Redis (via Upstash) - used as an authoritative write-around cache and for distributed locks.
- **Infrastructure**: Dockerized backend deployed on Azure App Service.

See [DESIGN.md](./DESIGN.md) for detailed architecture and trade-off analysis.

## Demo 
- Offline Support 
<img width="1919" height="1025" alt="image" src="https://github.com/user-attachments/assets/a88d0a56-893c-4128-bad8-0a4330356ad4" />
<img width="1919" height="1034" alt="image" src="https://github.com/user-attachments/assets/b939a88c-6623-4ab8-a3ce-eff97f273e87" />

- Video


https://github.com/user-attachments/assets/adf3bd6c-14ec-4bcb-a7b3-8530d719fb08



## Setup Instructions

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local frontend dev)


### Running Locally

1. **Start the backend and services**
   The project is configured to work with a single command using Docker:

   ```bash
   docker compose up --build
   ```

   *Note: Ensure `.env` files are configured with valid Supabase and Upstash credentials.*

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
`https://flowboard.abhaymishra.in`

### Infrastructure
- **Frontend**: Vercel/Netlify
- **Backend**: Azure App Service (Docker Container)
- **Database**: Supabase (PostgreSQL)
- **Cache**: Upstash (Redis)

### Deployment Steps
1. **Build Docker Image**:
   ```bash
   docker build -t your-user/flowboard-server .
   docker push your-user/flowboard-server
   ```
2. **Deploy to Azure**:
   - Create Web App for Containers.
   - Point to the Docker Hub image.
   - Configure Environment Variables (from `azure-app-settings.json`).
3. **Deploy Frontend**:
   - Push to Vercel.
   - Set `VITE_WS_URL` to the Azure backend URL.
