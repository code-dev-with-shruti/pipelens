import json
from pathlib import Path

from backend.graph import build_pipeline_graph, downstream_by_node
from backend.parser import extract_procedure_relationships


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_DIRECTORY = PROJECT_ROOT / "samples" / "retail_billing"


def load_sample_procedures():
    procedures = []
    for sql_path in sorted(SAMPLE_DIRECTORY.glob("*.sql")):
        parsed = extract_procedure_relationships(
            sql_path.read_text(encoding="utf-8"),
            sql_path.name,
        )
        procedures.append({
            "id": parsed["procedure"],
            "reads": parsed["reads"],
            "writes": parsed["writes"],
            "called_procedures": parsed["called_procedures"],
            "uncertain_edges": parsed["uncertain_edges"],
        })
    return procedures


def test_every_called_procedure_is_a_direct_edge_and_downstream():
    procedures = load_sample_procedures()
    graph, edges = build_pipeline_graph(procedures)
    downstream = downstream_by_node(graph)

    for procedure in procedures:
        assert procedure["id"] not in downstream[procedure["id"]]
        for called_procedure in procedure["called_procedures"]:
            assert {
                "from": procedure["id"],
                "to": called_procedure,
                "type": "call",
                "confidence": "parsed",
            } in edges
            assert called_procedure in downstream[procedure["id"]]


def test_sample_downstream_counts_match_ground_truth():
    ground_truth = json.loads(
        (PROJECT_ROOT / "samples" / "ground_truth.json").read_text(encoding="utf-8")
    )
    procedures = load_sample_procedures()
    graph, _ = build_pipeline_graph(procedures)
    downstream = downstream_by_node(graph)
    procedure_ids = {procedure["id"] for procedure in procedures}
    table_ids = {
        data["name"]
        for _, data in graph.nodes(data=True)
        if data["kind"] == "table"
    }

    for procedure_id, expected in ground_truth["downstream_counts"].items():
        impacted = downstream[procedure_id]
        assert sum(item in procedure_ids for item in impacted) == expected["procedures"]
        assert sum(item in table_ids for item in impacted) == expected["tables"]
