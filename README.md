# Memory OS

> A private cognitive data workbench that turns notes, images, PDFs, and videos into measurable, searchable knowledge.

![Memory OS cover](public/memory-os-signal.jpg)

Memory OS is an experimental system for studying personal knowledge as data. It covers ingestion, OCR, data cleaning, quality measurement, event logging, retrieval ranking, context construction, and answer review.

The project is built to keep its reasoning inspectable. Intermediate states, source citations, retrieval scores, quality warnings, and debugging records remain available for examination instead of being hidden behind a single chat response.

## What it does

- Ingests text, images, PDFs, and video references into folder-isolated workspaces.
- Measures completeness, freshness, modality entropy, concentration, and near-duplicate content.
- Runs a traceable AI pipeline: reference resolution, intent recognition, retrieval, context construction, generation, guarding, review, parsing, and debugging.
- Maintains an event ledger for deterministic replay, projection recovery, and offline-write reconciliation.
- Provides reproducible BM25 experiments with versioned datasets and Precision, Recall, MRR, MAP, and nDCG evaluation.

## Architecture

```text
React Component
    ↓
Hook / Feature Module
    ↓
Storage Proxy
    ↓
ServerStorageAdapter ──→ /api/storage ──→ MySQLAdapter ──→ MySQL
    └────────────────────────────────────→ Event Ledger / Replay

Question
    ↓
Resolve References → Recognize Intent → Retrieve → Build Context
    ↓
LLM → Response Guard → Answer Review → Parse → Debug Record
```

The web application uses Next.js, React, and TypeScript. TanStack Query owns server state, Zustand owns interface state, and Drizzle defines the MySQL schema. The Python intelligence service contains the retrieval and evaluation kernel without third-party runtime dependencies.

## Run locally

Requirements:

- Node.js 20 or newer
- MySQL 8
- Python 3.9 or newer for retrieval experiments

```bash
npm install
npm run dev
```

Create `.env.local` for database and model-provider credentials. The file is ignored by Git and must never be committed.

```text
DATABASE_HOST=
DATABASE_PORT=3306
DATABASE_USER=
DATABASE_PASSWORD=
DATABASE_NAME=

OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_CHAT_MODEL=
```

Other OpenAI-compatible providers can be configured through the provider variables referenced in `src/app/api/chat/llm/route.ts`.

## Verification

```bash
npm run lint
npm run test:unit
npm run test:intelligence
npm run benchmark:bm25
npm run build
```

The benchmark command writes a deterministic experiment result for the versioned retrieval dataset in `experiments/datasets`.

## Project status

Memory OS is a personal research system, not a hosted multi-tenant product. Its purpose is to make data-science, retrieval, storage, and AI-engineering decisions visible enough to inspect and reproduce.
