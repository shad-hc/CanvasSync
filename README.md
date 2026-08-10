# CanvasFlow — Production-Grade Collaborative Whiteboard

Real-time collaborative whiteboard with infinite canvas, WebSocket sync, and full persistence.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Load Balancer / Nginx                    │
│  HTTP → frontend:3000    /api/* → backend:4000    /ws → WS      │
└───────────────────┬─────────────────┬────────────────────────────┘
                    │                 │
         ┌──────────▼──────┐ ┌────────▼──────────┐
         │  Next.js 14     │ │   Express + WS     │
         │  (App Router)   │ │  (REST + WebSocket)│
         └─────────────────┘ └──────┬─────────────┘
                                    │
                    ┌───────────────┼────────────────┐
                    ▼               ▼                ▼
             ┌────────────┐ ┌────────────┐ ┌─────────────┐
             │ PostgreSQL │ │   Redis    │ │  Redis      │
             │  (Prisma)  │ │  (Cache)  │ │  (Pub/Sub)  │
             └────────────┘ └────────────┘ └─────────────┘
```

## Tech Stack

| Layer       | Technology                                   |
|-------------|----------------------------------------------|
| Frontend    | Next.js 14, React, TypeScript, Tailwind CSS  |
| State       | Zustand + TanStack Query                     |
| Canvas      | HTML5 Canvas API (no Fabric.js/Konva)        |
| Forms       | React Hook Form + Zod                        |
| Backend     | Node.js, Express, TypeScript                 |
| WebSockets  | Native `ws` library                          |
| ORM         | Prisma + PostgreSQL                          |
| Cache       | Redis (ioredis)                              |
| Auth        | JWT (access + refresh tokens)                |
| Containers  | Docker + Docker Compose                      |
| CI/CD       | GitHub Actions → AWS ECS                     |

## Quick Start (Development)

```bash
# 1. Clone and install
git clone <repo>
cd canvasflow
npm run install:all

# 2. Configure environment
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
# Edit both files with your values

# 3. Start infrastructure
docker compose up postgres redis -d

# 4. Run migrations
cd backend && npm run prisma:migrate

# 5. Start dev servers
npm run dev:backend    # Terminal 1 — http://localhost:4000
npm run dev:frontend   # Terminal 2 — http://localhost:3000
```

## Full Docker Stack

```bash
# Production-like local run
cp backend/.env.production.example backend/.env
docker compose up --build
```

## Production Deployment (AWS ECS)

### Prerequisites
- AWS account with ECS cluster named `canvasflow-cluster`
- ECR repositories: `canvasflow-backend`, `canvasflow-frontend`
- RDS PostgreSQL instance
- ElastiCache Redis cluster
- GitHub secrets configured (see below)

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user with ECS/ECR permissions |
| `AWS_SECRET_ACCESS_KEY` | IAM secret |
| `AWS_ACCOUNT_ID` | 12-digit AWS account ID |
| `ECS_SUBNET_IDS` | VPC subnet IDs for Fargate tasks |
| `ECS_SECURITY_GROUP_IDS` | Security group IDs |

### Required GitHub Variables

| Variable | Example |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | `https://api.canvasflow.io/api/v1` |
| `NEXT_PUBLIC_WS_URL` | `wss://api.canvasflow.io` |

### Deploy Flow

1. Push to `main` → CI runs (typecheck, build, Docker build & push)
2. CI success → CD triggers (runs DB migrations, deploys to ECS)
3. ECS performs rolling deployment (zero downtime)
4. Health checks confirm new tasks are serving before old tasks stop

## API Reference

All endpoints versioned under `/api/v1`.

### Authentication
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Register + get tokens |
| POST | `/auth/login` | Login + get tokens |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke tokens |
| GET | `/auth/me` | Current user profile |

### Boards
| Method | Path | Description |
|--------|------|-------------|
| GET | `/boards` | List boards (paginated, filtered, searchable) |
| POST | `/boards` | Create board |
| GET | `/boards/:id` | Board detail |
| PATCH | `/boards/:id` | Update board |
| DELETE | `/boards/:id` | Delete board |
| POST | `/boards/:id/invites` | Invite member |
| POST | `/boards/:id/favorite` | Toggle favorite |

### Canvas
| Method | Path | Description |
|--------|------|-------------|
| GET | `/boards/:id/elements` | Full board state (HTTP fallback) |
| POST | `/boards/:id/elements/:eid/restore` | Restore soft-deleted element |

### Chat & Comments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/boards/:id/chat` | Chat history |
| GET | `/boards/:id/comments` | Comment threads |
| PATCH | `/boards/:id/comments/:cid/resolve` | Resolve comment |

## WebSocket Protocol

Connect: `ws://host/ws?token=<access_token>`

### Client → Server
| Type | Description |
|------|-------------|
| `join_board` | Join a board room |
| `canvas_delta` | Shape create/update/delete/batch |
| `cursor_move` | Live cursor position |
| `send_chat` | Send chat message |
| `typing` | Typing indicator |
| `add_comment` | Add comment/reply |
| `resolve_comment` | Resolve a thread |
| `ping` | Latency measurement |

### Server → Client
| Type | Description |
|------|-------------|
| `board_joined` | Joined room + presence list |
| `board_state` | Full element list on join |
| `canvas_delta` | Remote shape operation |
| `cursor_update` | Remote cursor position |
| `chat_message` | New chat message |
| `typing_update` | Typing indicator |
| `comment_added` | New comment/reply |
| `ack` | Delta acknowledgement |
| `pong` | Latency response |

