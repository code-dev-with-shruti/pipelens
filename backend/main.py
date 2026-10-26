from pathlib import Path
import json
from typing import Any, List, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.analysis import calculate_ground_truth_accuracy, detect_risks
from backend.explanations import generate_explanations, validate_explanations
from backend.graph import build_pipeline_graph, downstream_by_node
from backend.parser import extract_procedure_relationships

app = FastAPI(title="PipeLens API")
PROJECT_ROOT = Path(__file__).resolve().parents[1]
SAMPLE_DIRECTORY = PROJECT_ROOT / "samples" / "retail_billing"
CACHE_PATH = SAMPLE_DIRECTORY / "llm_cache.json"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SqlFile(BaseModel):
    name: str
    sql: str
    use_cached_explanation: bool = False


class AnalyzeRequest(BaseModel):
    files: List[SqlFile]
    source: Literal["sample", "upload"] = "sample"


class ExplanationRequest(BaseModel):
    files: List[SqlFile]


def parse_sql_file(sql_file: SqlFile) -> dict[str, Any]:
    if not sql_file.name.lower().endswith(".sql"):
        raise ValueError("Only .sql files are supported.")
    if not sql_file.sql.strip():
        raise ValueError("The file is empty.")
    if len(sql_file.sql) > 20_000:
        raise ValueError("The file exceeds the 20,000-character limit.")

    parsed = extract_procedure_relationships(sql_file.sql, sql_file.name)
    return {
        "id": parsed["procedure"],
        "file": parsed["file"],
        "reads": parsed["reads"],
        "writes": parsed["writes"],
        "called_procedures": parsed["called_procedures"],
        "has_dynamic_sql": parsed["has_dynamic_sql"],
        "uncertain_edges": parsed["uncertain_edges"],
        "risks": detect_risks(sql_file.sql),
        "use_cached_explanation": sql_file.use_cached_explanation,
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/sample")
def sample_project():
    return {
        "files": [
            {"name": path.name, "sql": path.read_text(encoding="utf-8")}
            for path in sorted(SAMPLE_DIRECTORY.glob("*.sql"))
        ]
    }


@app.post("/explanations")
def explain_uploaded_files(req: ExplanationRequest):
    if not req.files:
        raise HTTPException(status_code=400, detail="No SQL files supplied for explanations.")
    try:
        latest_by_id = {}
        for sql_file in req.files:
            procedure = parse_sql_file(sql_file)
            latest_by_id[procedure["id"]] = procedure
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    try:
        explanations = generate_explanations(list(latest_by_id.values()))
    except (RuntimeError, ValueError) as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return {"procedures": explanations}


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if not req.files:
        raise HTTPException(status_code=400, detail="No SQL files supplied.")

    procedures_by_id = {}
    file_errors = []
    warnings = []
    for sql_file in req.files:
        try:
            procedure = parse_sql_file(sql_file)
        except ValueError as error:
            file_errors.append({"name": sql_file.name, "message": str(error)})
            continue

        if procedure["id"] in procedures_by_id:
            previous_file = procedures_by_id[procedure["id"]]["file"]
            warnings.append(
                f"Both {previous_file} and {sql_file.name} define {procedure['id']}; "
                f"using the latest file, {sql_file.name}."
            )
        procedures_by_id[procedure["id"]] = procedure

    procedures = list(procedures_by_id.values())

    explanation_error = None
    explanations = {}
    cached_ids = {
        procedure["id"]
        for procedure in procedures
        if req.source == "sample" or procedure["use_cached_explanation"]
    }
    explanation_pending = [
        procedure for procedure in procedures if procedure["id"] not in cached_ids
    ]

    if cached_ids:
        try:
            if not CACHE_PATH.exists():
                raise FileNotFoundError("The sample explanation cache does not exist yet.")
            cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
            all_cached_explanations = cache["procedures"]
            cached_explanations = {
                procedure_id: all_cached_explanations[procedure_id]
                for procedure_id in cached_ids
            }
            validate_explanations(cached_explanations, cached_ids)
            explanations.update(cached_explanations)
        except (FileNotFoundError, json.JSONDecodeError, KeyError, TypeError, ValueError):
            if req.source == "sample":
                explanation_error = (
                    "Sample explanation cache is missing or invalid. Add GEMINI_API_KEY and a Gemini "
                    "model ID to the repository-root .env file, then run "
                    "`.\\.venv\\Scripts\\python.exe -m backend.generate_sample_cache` once."
                )
            else:
                explanation_error = "Cached sample explanations are missing or invalid."

    if explanations:
        for procedure in procedures:
            explanation = explanations.get(procedure["id"])
            if explanation:
                procedure["summary"] = explanation["summary"]
                procedure["steps"] = explanation["steps"]
            procedure.pop("use_cached_explanation")
    else:
        for procedure in procedures:
            procedure.pop("use_cached_explanation")

    graph, edges = build_pipeline_graph(procedures)
    downstream = downstream_by_node(graph)
    tables = sorted(
        data["name"]
        for _, data in graph.nodes(data=True)
        if data["kind"] == "table"
    )
    for procedure in procedures:
        procedure["downstream"] = downstream[procedure["id"]]

    result = {
        "procedures": procedures,
        "tables": tables,
        "edges": edges,
        "downstream": downstream,
    }
    if file_errors:
        result["file_errors"] = file_errors
    if warnings:
        result["warnings"] = warnings
    if explanation_pending:
        result["explanation_pending"] = [procedure["id"] for procedure in explanation_pending]
    if req.source == "sample":
        result["accuracy"] = calculate_ground_truth_accuracy(procedures)
    if explanation_error:
        result["explanation_error"] = explanation_error
    return result
