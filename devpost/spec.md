---
doc: spec
status: approved
---

# PipeLens — Technical Spec

## How This Works, In Plain Language

PipeLens has two main jobs: first, it reads a small set of SQL files and builds a graph of how procedures and tables connect; second, it lets a user click a procedure or table and see everything that depends on it. The graph is created by a parser, not by free-form model guessing. That makes the dependency map trustworthy.

The backend takes uploaded SQL or the built-in sample project, extracts reads and writes, builds a directed graph, and computes downstream impact using graph traversal. The frontend displays the graph and a side panel with a plain-English summary, ordered steps, and deterministic risks. Gemini receives parsed procedure relationships only and writes summaries and steps; it never decides graph edges, risks, or downstream impact. Uploaded-file graph analysis finishes before a separate explanation request starts, so a slow or unavailable Gemini API does not block the graph or risks.

The sample project uses `samples/retail_billing/llm_cache.json` so normal sample analysis never depends on a live API call. Generate or refresh this cache once with `.\.venv\Scripts\python.exe -m backend.generate_sample_cache`; uploaded files request Gemini explanations only after deterministic graph analysis has completed.

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
4. Readable selected-subgraph view, Gemini summaries/steps, and deterministic risk display.
5. Accuracy check against planted ground truth with a UI badge.
6. Add, replace, and remove files in the working set; re-analyze the complete set after each change.
7. Export and final polish.

## Stack

- Language: Python 3.11 for the API and analysis layer
- API framework: FastAPI + Uvicorn
- SQL parsing: sqlglot with T-SQL support
- Graph engine: NetworkX
- Graph layout: @dagrejs/dagre for layout and routing of the node graph
- LLM integration: Google GenAI SDK with a configurable Gemini model ID via environment variables
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
- Google AI Studio API key in a local environment file

Create `.env` at the repository root, alongside `backend/` and `frontend/`, with the private API key and a Gemini model ID (not a URL):
```dotenv
GEMINI_API_KEY=your-key-goes-here
MODEL=gemini-3.5-flash-lite
```

Keep `.env` local; `.gitignore` excludes it. Install backend requirements and generate the sample explanation cache once:
```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m backend.generate_sample_cache
```

Start the backend from the repository root:
```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend in a second PowerShell terminal:
```powershell
Set-Location .\frontend
npm run dev -- --host 127.0.0.1
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
What it does: starts with the built-in sample and allows `.sql` files to be added to the current in-memory working set, replaced by same-name uploads, or removed from the analysis. Reset restores the seven sample files. Each valid change re-analyzes the complete set; removal never deletes a disk or repository file.
PRD ref: `prd.md > Load and inspect a pipeline`.

Limits and feedback: accept up to 15 uploaded files per selection and 20,000 characters per file. Show per-file validation errors while keeping other valid files usable. Warn when an upload replaces a filename or when a later file definition replaces an earlier procedure definition. The working set is not persisted; refresh starts with the sample again.

### Graph Canvas
What it does: renders procedures and tables as nodes and edges as read/write relationships.
PRD ref: `prd.md > Load and inspect a pipeline` and `prd.md > Downstream impact view`.

### Detail Panel
What it does: updates to show the selected node’s summary, reads, writes, steps, risks, and downstream impact.
PRD ref: `prd.md > Procedure detail panel` and `prd.md > Downstream impact view`.

### Risk List
What it does: displays severity-tagged risk items tied to the selected procedure.
Risk detection is performed by deterministic code rules for missing TRY/CATCH, unfiltered DELETE, hard-coded values, and dynamic SQL. Each risk includes a severity, title, and deterministic explanation; Gemini does not decide or explain risk findings.
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
- The current file working set lives only in frontend component state; refresh restores the bundled sample.
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
│   ├── analysis.py             # deterministic risks and ground-truth comparison
│   ├── explanations.py         # Gemini summary/step generation and cache validation
│   ├── generate_sample_cache.py
│   ├── graph.py                # graph traversal for downstream impact
│   ├── parser.py               # deterministic SQL relationship extraction
│   ├── requirements.txt
│   └── tests/
│       ├── test_api.py
│       └── test_analysis.py
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

- Gemini API
  - Purpose: generate a procedure summary and ordered steps from parsed relationships.
  - Required configuration: `GEMINI_API_KEY` and a Gemini model ID in `MODEL`, both in the ignored repository-root `.env` file.
  - Document link: https://ai.google.dev/gemini-api/docs
  - Failure mode: if the model fails or returns invalid JSON, the app surfaces a clear guide error and keeps the parser-derived graph and deterministic risks intact.
  - Demo behavior: sample analysis reads `samples/retail_billing/llm_cache.json`; uploaded-file graph analysis is deterministic, then a separate request calls Gemini for explanations.

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
- Gemini failure or invalid explanation output → show an AI insights error without blocking or corrupting the graph or risk findings.
- Dynamic SQL or unsupported SQL features → show a dashed or flagged uncertain edge instead of pretending the dependency is certain.

## What Was Simplified and Why

- Sample project is the default first experience instead of a production database flow — because the proof is the demo, not a live database setup.
- Local app and recorded demo rather than live hosting — because the requirement is a short demo video and a public GitHub repo, not a deployed app.
- A small, synthetic set of T-SQL files rather than a broad multi-dialect system — because the POC needs to prove the graph and impact loop quickly.
- The LLM is restricted to explanation text rather than graph decisions — because the graph must be deterministic and trustworthy.

## Decisions and Open Issues

Decisions made here:
- The app will use parser-first dependency mapping and compute downstream impact via graph traversal.
- Risk detection will be deterministic in code; Gemini will only write summaries and ordered steps from parsed data.
- Gemini will never decide graph edges, risk findings, or downstream impact.
- The app will use `@dagrejs/dagre` for graph layout to keep the network readable on the sample pipeline.
- The demo flow will be a local sample-project walkthrough, with uploads also supported.
- The one-minute demo is the submission proof; no extra walkthrough screen will be created.
- The backend parsing and graph work is the first build task, and the proof is a sqlglot spike covering `CREATE PROCEDURE`, temp tables, `TRY/CATCH`, and dynamic SQL.
- The sample project includes cached LLM output so the demo never depends on the live API.

Learner uncertainty discussed and clarified:
- The key technical question was whether the model should be allowed to influence graph structure. We resolved that by limiting Gemini to summaries and steps and keeping graph and risk logic in code.
- No unresolved technical ambiguity remains before build begins.

No additional open blockers remain before the code phase.
