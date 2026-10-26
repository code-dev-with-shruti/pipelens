# PipeLens

PipeLens helps engineers explore how a small T-SQL pipeline fits together. It parses stored procedures into a dependency graph so you can inspect what a procedure reads, writes, calls, and what may be affected downstream.

The graph and downstream impact are computed from parsed SQL relationships. Google Gemini is used only to generate plain-language procedure summaries and steps; it does not decide graph edges, detected risks, or impact counts.

## Features

- Interactive graph of procedures, tables, and dependencies. Confirmed relationships are shown as solid edges; uncertain dynamic-SQL dependencies are marked separately.
- Select procedures and tables to inspect downstream impact.
- Procedure summaries, ordered steps, reads and writes, and deterministic risk findings with severity.
- Purpose captions for procedures and graph-derived captions for tables.
- Add `.sql` files to an in-memory working set, remove files, and reset to the bundled sample. These actions do not modify or delete files on disk.
- Export the current analysis as a Markdown guide and companion SVG graph snapshot.
- Sample-project accuracy check against the bundled ground truth. The verification badge is shown for the unmodified sample set only.

The parser currently targets a small proof-of-concept set of T-SQL stored procedures. Dynamic SQL can contain dependencies that cannot be resolved statically; PipeLens marks those as uncertain.

## Sample project

The bundled retail-billing sample is in [`samples/retail_billing/`](samples/retail_billing/). It contains seven SQL files, including `load_invoices.sql`, `clean_invoice_records.sql`, `reconcile_payments.sql`, and `build_monthly_report.sql`.

The sample uses cached explanations from `samples/retail_billing/llm_cache.json`, so you can run and explore it **without a Gemini API key**. Uploaded SQL can still be parsed and its graph and deterministic risks inspected without Gemini; a key is needed only if you want Gemini-generated summaries and steps for uploaded procedures.

## Requirements

- Windows with PowerShell
- Python 3.11 or newer
- Node.js and npm

## Run locally (Windows PowerShell)

Run these commands from the repository root.

### 1. Create and activate a Python virtual environment

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, use the virtual environment's Python executable directly as shown below.

### 2. Install backend dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install -r backend\requirements.txt
```

### 3. Create the local environment file

```powershell
Copy-Item .env.example .env
```

The sample works with the placeholder values because its explanations are cached. To generate Gemini explanations for uploaded SQL, replace the placeholder `GEMINI_API_KEY` with a Google AI Studio API key. `MODEL` must be a Gemini model ID, not a URL. Keep `.env` private; it is ignored by Git.

Environment variable names and example values:

```dotenv
GEMINI_API_KEY=replace-with-your-Google-AI-Studio-key
MODEL=gemini-3.5-flash-lite
```

### 4. Start the backend

In the first PowerShell terminal, from the repository root:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

The API health endpoint is available at `http://127.0.0.1:8000/health`.

### 5. Install frontend dependencies and start the app

Open a second PowerShell terminal:

```powershell
Set-Location .\frontend
npm install
npm run dev -- --host 127.0.0.1
```

Open the local Vite URL printed in the terminal.

## Tests and production build

From the repository root, run the backend tests:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests -q
```

Build the frontend:

```powershell
Set-Location .\frontend
npm run build
```

## Project guide

See [`devpost/app-map.html`](devpost/app-map.html) for a visual overview of the problem PipeLens addresses, an example dependency path, and links to the code behind it.

## License

This project is licensed under the MIT License. See [`LICENSE`](LICENSE) for the complete license text.
