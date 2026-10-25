---
doc: spec
status: approved
---

# PipeLens — Technical Spec

## How This Works, In Plain Language

PipeLens has two main jobs: first, it reads a small set of SQL files and builds a graph of how procedures and tables connect; second, it lets a user click a procedure or table and see everything that depends on it. The graph is created by a parser, not by free-form model guessing. That makes the dependency map trustworthy.

The backend takes uploaded SQL or the built-in sample project, extracts reads and writes, builds a directed graph, and computes downstream impact using graph traversal. The frontend displays the graph and a side panel with a plain-English summary, the ordered steps, and any risks. The model is only used to explain what the code already found: summaries, steps, and risk explanations. It never decides the graph edges or the downstream impact. Risk detection is deterministic in code; the LLM explains the staged result rather than setting the data model.

The sample project also ships with a cached JSON of the LLM output so the demo never depends on a live API call. This keeps the proof-of-concept stable and reproducible.

This shape keeps the project small and credible for a hackathon: the app proves the core idea without needing a live database, user accounts, or production infrastructure.

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`.

1. The user opens the app and sees the sample project by default.
2. The frontend loads the example pipeline files and sends them to the backend API.
3. The backend parses each SQL file, extracts procedure/table relationships, and builds a graph.
4. The graph is returned to the frontend, which renders procedures and tables as nodes and arrows.
5. The user clicks a procedure such as `load_invoices`.
6. The graph highlights the selected procedure, its direct dependencies, and everything downstream.
7. The side panel reads the procedure summary, steps, reads, writes, risks, and downstream impact.
8. The user clicks Export to download a Markdown onboarding document containing the pipeline overview and per-procedure details.
9. The app is demonstrated locally in under one minute on a synthetic sample project.

## Build Order

1. Backend parsing and graph spike: prove sqlglot can extract reads and writes from the sample T-SQL, including the `CREATE PROCEDURE` wrapper, temp tables, `TRY/CATCH`, and dynamic SQL. This is the first task before any UI work.
2. Backend graph traversal and downstream impact logic.
3. Frontend graph canvas with click-to-highlight behavior.
4. Detail panel and risk display.
5. Accuracy test against a planted ground truth.
6. Export and final polish.

## Stack

- Language: Python 3.11 for the API and analysis layer
- API framework: FastAPI + Uvicorn
- SQL parsing: sqlglot with T-SQL support
- Graph engine: NetworkX
- Graph layout: @dagrejs/dagre for layout and routing of the node graph
- LLM integration: Anthropic SDK with a configurable model via environment variables
- Validation: Pydantic
- Frontend: React + Vite + Tailwind CSS
- Graph UI: React Flow
- Testing: pytest
- Version control: Git + GitHub

Rationale:
- Python and FastAPI are fast to set up for a small proof-of-concept and support a clean API contract.
- sqlglot gives a deterministic parser-first dependency map and keeps the graph grounded in actual SQL rather than guesswork.
- NetworkX is sufficient for the graph traversal required for downstream impact.
- React and React Flow are a lightweight choice for a clickable, demonstrable graph UI.
- The LLM is intentionally constrained to writing explanations only, reducing model error risk while preserving the useful summary layer.

Any unverified items should be checked early in the build: the exact T-SQL patterns sqlglot handles, the model output schema, and the sample project edge cases.

## Where It Runs and How Someone Tries It

Runtime:
- Local development environment
- Backend API runs as a Python process
- Frontend runs in the browser via Vite dev server
- Deployment is optional; local recording is the required submission workflow

Environment requirements:
- Python 3.11+
- Node.js 18+
- Git
- Anthropic API key in a local environment file

Startup steps (PowerShell):

Backend:
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item ..\.env.example .env
uvicorn main:app --reload --port 8000
```

Frontend:
```powershell
cd frontend
npm install
npm run dev
```

Enable CORS in the Vite dev server so the frontend can talk to the local backend at `http://localhost:8000` during development.

What to open:
- Browser at the Vite dev URL
- Backend health endpoint at `/health`
- Upload or load the sample project

Demo recording:
- The required submission proof is the one-minute local demo: load sample project, inspect graph, click a procedure, show downstream impact, show a risk and export, then stop.
- No additional walkthrough view is required beyond the demo itself.

## Look and Feel

The UI should feel like an internal engineering tool: trustworthy, clean, and precise. Strong contrast, readable type, and clear emphasis on the selected node are more important than decorative touches. The page should feel calm and direct rather than playful or chatty.

The expected tone is practical and technical: useful to a new engineer who wants facts quickly, not a consumer app or a chatbot product. References may include operational dashboards, internal data tools, and crisp developer tooling, but no broad design system is required.

## Components

### Sample Loader and Upload Panel
What it does: allows the user to load the built-in sample pipeline or upload a small set of SQL files.
PRD ref: `prd.md > Load and inspect a pipeline`.

### Graph Canvas
What it does: renders procedures and tables as nodes and edges as read/write relationships.
PRD ref: `prd.md > Load and inspect a pipeline` and `prd.md > Downstream impact view`.

### Detail Panel
What it does: updates to show the selected node’s summary, reads, writes, steps, risks, and downstream impact.
PRD ref: `prd.md > Procedure detail panel` and `prd.md > Downstream impact view`.

### Risk List
What it does: displays severity-tagged risk items tied to the selected procedure.
Risk detection is performed by deterministic code rules (missing error handling, unfiltered deletes, hard-coded values, dynamic SQL, and similar patterns). The LLM is used only to explain the detected risks in plain language.
PRD ref: `prd.md > Risk detection`.

### Export Action
What it does: downloads a Markdown onboarding document for the entire pipeline.
PRD ref: `prd.md > Export onboarding doc`.

### Health and Error Feedback
What it does: shows loading states and readable error messages for empty or invalid input.
PRD ref: `prd.md > Loading and error states`.

## Data Model

Core entities:

- Procedure
  - id
  - name
  - file
  - summary
  - steps
  - reads
  - writes
  - risks
  - downstream

- Table
  - name

- Edge
  - from
  - to
  - type (read or write)
  - confidence (parsed or inferred)

- Risk
  - severity
  - title
  - detail
  - procedure_id

- PipelineResult
  - procedures
  - tables
  - edges
  - downstream

Where data lives:
- Input SQL files live temporarily in the request payload.
- Parsed dependency data is assembled in the backend analysis layer.
- The frontend stores the current result in component state and re-renders based on selection.
- Exported Markdown is generated from the result payload and downloaded client-side.

## File Structure

```text
project/
├── devpost/
│   ├── learner-profile.md
│   ├── scope.md
│   ├── prd.md
│   ├── spec.md
│   └── checklist.md
├── .env.example
├── backend/
│   ├── main.py                 # FastAPI routes and request handling
│   ├── pipeline.py             # analysis orchestration and graph build
│   ├── sql_parser.py           # sqlglot extraction + LLM fallback for uncertain edges
│   ├── graph.py                # graph traversal for downstream impact
│   ├── prompts.py              # prompt templates for summary/steps/risk generation
│   ├── schemas.py              # Pydantic models for validation
│   ├── requirements.txt
│   └── tests/
│       ├── test_api.py
│       └── test_accuracy.py
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       ├── exportMarkdown.js
│       ├── components/
│       │   ├── UploadPanel.jsx
│       │   ├── GraphView.jsx
│       │   ├── DetailPanel.jsx
│       │   ├── RiskList.jsx
│       │   └── ExportButton.jsx
│       └── styles/
├── samples/
│   ├── retail_billing/
│   │   ├── load_invoices.sql
│   │   ├── reconcile_payments.sql
│   │   ├── nightly_cleanup.sql
│   │   ├── llm_cache.json     # cached LLM explanations for the demo
│   │   └── ...
│   └── ground_truth.json
├── README.md
└── .gitignore
```

## External Services and Dependencies

- Anthropic API
  - Purpose: generate summary, ordered steps, and risk explanations for a parsed procedure.
  - Required configuration: API key and model selection via environment variables.
  - Document link: use the provider’s current API docs for the selected model.
  - Failure mode: if the model fails or returns invalid JSON, the app should surface a clear error and keep the parser-derived graph intact.
  - Demo behavior: the sample project uses a cached JSON output file so the local demo does not depend on a live API call.

- sqlglot
  - Purpose: parse T-SQL and extract reads and writes.
  - Document link: project documentation for the specific T-SQL support and limitations.

- React Flow
  - Purpose: interactive graph rendering.
  - Document link: official package docs.

- NetworkX
  - Purpose: downstream impact traversal.
  - Document link: official library docs.

## Important Failure Modes

- Invalid or unsupported SQL input → show a readable error and keep the UI stable.
- API failure during analysis → show a user-friendly message and preserve the current state.
- LLM output schema mismatch → retry once with validation feedback, then fail clearly without corrupting the graph.
- Dynamic SQL or unsupported SQL features → show a dashed or flagged uncertain edge instead of pretending the dependency is certain.

## What Was Simplified and Why

- Sample project is the default first experience instead of a production database flow — because the proof is the demo, not a live database setup.
- Local app and recorded demo rather than live hosting — because the requirement is a short demo video and a public GitHub repo, not a deployed app.
- A small, synthetic set of T-SQL files rather than a broad multi-dialect system — because the POC needs to prove the graph and impact loop quickly.
- The LLM is restricted to explanation text rather than graph decisions — because the graph must be deterministic and trustworthy.

## Decisions and Open Issues

Decisions made here:
- The app will use parser-first dependency mapping and compute downstream impact via graph traversal.
- Risk detection will be deterministic in code and the LLM will only explain detected risks.
- The LLM will only write summaries, steps, and risk explanations; it will never decide graph edges or downstream impact.
- The app will use `@dagrejs/dagre` for graph layout to keep the network readable on the sample pipeline.
- The demo flow will be a local sample-project walkthrough, with uploads also supported.
- The one-minute demo is the submission proof; no extra walkthrough screen will be created.
- The backend parsing and graph work is the first build task, and the proof is a sqlglot spike covering `CREATE PROCEDURE`, temp tables, `TRY/CATCH`, and dynamic SQL.
- The sample project includes cached LLM output so the demo never depends on the live API.

Learner uncertainty discussed and clarified:
- The key technical question was whether the model should be allowed to influence graph structure. We resolved that by limiting the LLM to explanatory text only and keeping graph logic in code.
- No unresolved technical ambiguity remains before build begins.

No additional open blockers remain before the code phase.
