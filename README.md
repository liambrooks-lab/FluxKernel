<p align="center">
  <img src="assets/logo/fluxkernel-glyph-dark.svg" alt="FluxKernel Logo" width="96" height="96"/>
</p>

<h1 align="center">FluxKernel</h1>

<p align="center">
  <strong>An MNC-grade, OS-level AI Agent with an unfiltered cognitive core.</strong><br/>
  Built for engineers who demand full system access, persistent memory, and zero guard-rails in their local environment.
</p>

<p align="center">
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js"/>
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white"/>
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-15-336791?style=flat-square&logo=postgresql&logoColor=white"/>
  <img alt="Python" src="https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white"/>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white"/>
  <img alt="Docker" src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white"/>
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green?style=flat-square"/>
</p>

---

## What is FluxKernel?

FluxKernel is not a chat wrapper. It is an **AI Operating System Agent** — a persistent, memory-driven kernel that operates directly on your filesystem, executes arbitrary code, diffs and patches files, routes to local or cloud LLMs based on active persona, and surfaces everything through a premium developer-grade UI.

### Core Capabilities

| Capability | Description |
|---|---|
| **Persona Engine** | Multiple cognitive identities (`Standard`, `Architect`, `Unfiltered`). Each has its own system prompt and intensity. The *Unfiltered* persona routes directly to your local Ollama instance. |
| **Workspace Sandbox** | The AI can read, create, and modify files within a strictly sandboxed `workspace/` directory. Path traversal attacks are blocked at the filesystem layer. |
| **Code Execution** | Python code is executed in a secure subprocess with a 10-second hard timeout. stdout + stderr are captured and returned. |
| **Diff Viewer** | Every AI-proposed code change is surfaced as a side-by-side diff. You `Approve` or `Reject` before anything touches disk. |
| **SSE Streaming** | Responses stream token-by-token from the FastAPI backend → Next.js Edge Route → React frontend via `ReadableStream`. |
| **Persistent Memory** | All sessions, messages, and personas are persisted in PostgreSQL via SQLAlchemy. |
| **Image Canvas** | Generated assets are displayed in the right-sidebar with Download and Expand actions. |
| **Webhook Bus** | An async webhook endpoint (`/api/webhooks`) receives events from the Python backend (image generation, task completion, etc.). |

---

## Monorepo Structure

```
FluxKernel/
├── frontend/               # Next.js 15 (App Router) — the UI
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/     # Login & Register pages
│   │   │   ├── (dashboard)/# 3-column workspace layout
│   │   │   └── api/        # Next.js API routes (chat, workspace, webhooks)
│   │   ├── components/
│   │   │   ├── chat/       # ChatInput, MessageStream, MonacoEditor
│   │   │   ├── modals/     # PersonaManager, ConfirmAction, DangerZone
│   │   │   ├── ui/         # Shadcn primitives + ThemeToggle
│   │   │   └── workspace/  # FileExplorer, DiffViewer, ImageCanvas
│   │   ├── hooks/          # useIsMobile
│   │   ├── lib/            # apiClient, constants
│   │   ├── providers/      # ThemeProvider
│   │   └── store/          # Zustand: useFluxStore, usePersonaStore
│   └── public/             # logo.svg, favicon
│
├── kernel-engine/          # FastAPI — the brain
│   └── app/
│       ├── api/routes/     # chat.py, files.py
│       ├── core/           # config.py, llm_router.py
│       ├── database/       # connection.py, models.py
│       └── tools/          # file_manager.py, code_executor.py
│
├── workspace/              # Sandboxed AI workspace (read/write/execute)
├── assets/logo/            # SVG brand assets
└── docker-compose.yml      # PostgreSQL + FastAPI orchestration
```

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | ≥ 24 | Runs PostgreSQL + FastAPI |
| [Node.js](https://nodejs.org/) | ≥ 20 LTS | Next.js frontend |
| [Ollama](https://ollama.com/) *(optional)* | latest | Local LLM for the *Unfiltered* persona |

---

## Quick Start

### 1 — Clone & configure

```bash
git clone https://github.com/your-org/fluxkernel.git
cd FluxKernel

# Copy env template
cp kernel-engine/.env.example kernel-engine/.env
```

The defaults in `.env.example` match the `docker-compose.yml` credentials exactly — no edits needed for local dev.

### 2 — Start the backend stack

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL 15** on `localhost:5432` — tables auto-created on first boot via SQLAlchemy `create_all`.
- **FastAPI Kernel Engine** on `localhost:8000` — auto-restarts on failure.

Verify the engine is live:

```bash
curl http://localhost:8000/
# → {"status":"online","message":"FluxKernel Engine is running"}
```

Interactive API docs are available at **http://localhost:8000/docs**.

### 3 — Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

### 4 *(Optional)* — Enable the Unfiltered Persona

Install [Ollama](https://ollama.com/), then pull a model:

```bash
ollama pull llama3
```

Ollama runs on `http://localhost:11434` by default, which the Docker API container reaches via `host.docker.internal`.

---

## Environment Variables

### `kernel-engine/.env`

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://fluxuser:fluxpass@localhost:5432/fluxkernel` | SQLAlchemy connection string |
| `LOCAL_LLM_URL` | `http://localhost:11434` | Ollama or any OpenAI-compatible local endpoint |

### `frontend/.env.local` *(create manually)*

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Overrides the FastAPI base URL |

---

## Tech Stack

### Frontend
- **Next.js 15** (App Router, React Server Components)
- **TypeScript 5** — strict mode throughout
- **Tailwind CSS** + **Shadcn UI** — deep charcoal dark theme
- **Zustand** — global state (messages, streaming, persona, file selection)
- **`next-themes`** — Sun/Moon theme toggle with system detection

### Backend
- **FastAPI** — async REST + SSE streaming
- **SQLAlchemy 2** + **psycopg2** — ORM + PostgreSQL driver
- **Pydantic v2** + **pydantic-settings** — typed config from `.env`
- **httpx** — async HTTP client for LLM routing
- **Uvicorn** — ASGI server

---

## Security Model

FluxKernel's agentic capabilities are constrained by a layered security model:

1. **Path Sandboxing**: All file operations are resolved against an absolute `WORKSPACE_DIR`. Any path resolving outside this boundary raises a `SecurityException` and returns HTTP 403.
2. **Execution Timeout**: Subprocess code execution is capped at **10 seconds**. Runaway processes are terminated with exit code `124`.
3. **Diff Approval Gate**: No AI-proposed file change reaches disk without explicit user approval via the `DiffViewer` UI.
4. **CORS Lockdown**: In production, replace `allow_origins=["*"]` with your frontend's exact origin.

---

## License

MIT © FluxKernel Contributors