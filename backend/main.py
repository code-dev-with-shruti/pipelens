from pathlib import Path
import json
from typing import List, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.analysis import calculate_ground_truth_accuracy, detect_risks
from backend.explanations import GeminiAPIError, generate_explanations, validate_explanations
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


class AnalyzeRequest(BaseModel):
    files: List[SqlFile]
    source: Literal["sample", "upload"] = "sample"


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


@app.post("/analyze")
def analyze(req: AnalyzeRequest):
    if not req.files:
        raise HTTPException(status_code=400, detail="No SQL files supplied.")

    procedures = []
    for sql_file in req.files:
        parsed = extract_procedure_relationships(sql_file.sql, sql_file.name)
        procedures.append({
            "id": parsed["procedure"],
            "file": parsed["file"],
            "reads": parsed["reads"],
            "writes": parsed["writes"],
            "called_procedures": parsed["called_procedures"],
            "has_dynamic_sql": parsed["has_dynamic_sql"],
            "uncertain_edges": parsed["uncertain_edges"],
            "risks": detect_risks(sql_file.sql),
        })

    explanation_error = None
    explanations = None
    if req.source == "sample":
        try:
            if not CACHE_PATH.exists():
                raise FileNotFoundError("The sample explanation cache does not exist yet.")
            cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
            explanations = cache["procedures"]
            validate_explanations(
                explanations,
                {procedure["id"] for procedure in procedures},
            )
        except (FileNotFoundError, json.JSONDecodeError, KeyError, TypeError, ValueError):
            explanation_error = (
                "Sample explanation cache is missing or invalid. Add GEMINI_API_KEY and a Gemini "
                "model ID to the repository-root .env file, then run "
                "`.\\.venv\\Scripts\\python.exe -m backend.generate_sample_cache` once."
            )
    else:
        try:
            explanations = generate_explanations(procedures)
        except GeminiAPIError as error:
            explanation_error = str(error)
        except RuntimeError as error:
            explanation_error = str(error)
        except ValueError as error:
            explanation_error = (
                f"{error} Dependency analysis and deterministic risks are still available."
            )

    if explanations:
        for procedure in procedures:
            explanation = explanations[procedure["id"]]
            procedure["summary"] = explanation["summary"]
            procedure["steps"] = explanation["steps"]

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
    if req.source == "sample":
        result["accuracy"] = calculate_ground_truth_accuracy(procedures)
    if explanation_error:
        result["explanation_error"] = explanation_error
    return result
