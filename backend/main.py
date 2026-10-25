from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

from backend.graph import build_pipeline_graph, downstream_by_node
from backend.parser import extract_procedure_relationships

app = FastAPI(title="PipeLens API")

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


@app.get("/health")
def health():
    return {"status": "ok"}


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
        })

    graph, edges = build_pipeline_graph(procedures)
    downstream = downstream_by_node(graph)
    tables = sorted(
        data["name"]
        for _, data in graph.nodes(data=True)
        if data["kind"] == "table"
    )
    for procedure in procedures:
        procedure["downstream"] = downstream[procedure["id"]]

    return {
        "procedures": procedures,
        "tables": tables,
        "edges": edges,
        "downstream": downstream,
    }
