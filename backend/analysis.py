import re
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
GROUND_TRUTH_PATH = PROJECT_ROOT / "samples" / "ground_truth.json"


def detect_risks(sql: str) -> list[dict[str, str]]:
    uncommented_sql = re.sub(r"--[^\n]*|/\*.*?\*/", "", sql, flags=re.DOTALL)
    risks: list[dict[str, str]] = []

    if not (re.search(r"\bTRY\b", uncommented_sql, re.IGNORECASE)
            and re.search(r"\bCATCH\b", uncommented_sql, re.IGNORECASE)):
        risks.append({
            "code": "missing_error_handling",
            "severity": "medium",
            "title": "Missing TRY/CATCH handling",
            "detail": "This procedure has no complete TRY/CATCH block to handle runtime errors.",
        })

    for statement in re.finditer(
        r"\bDELETE\b(?:(?!;).)*(?:;|$)",
        uncommented_sql,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        if not re.search(r"\bWHERE\b", statement.group(), re.IGNORECASE):
            risks.append({
                "code": "unfiltered_delete",
                "severity": "high",
                "title": "DELETE without WHERE",
                "detail": "This DELETE statement has no WHERE clause and can remove every row from its target table.",
            })

    literal = r"(?:N?'(?:''|[^'])*'|-?\d+(?:\.\d+)?)"
    has_literal_assignment = re.search(
        rf"\b(?:WHERE|SET|IF)\b[^;]*?(?:<>|<=|>=|=|<|>)\s*{literal}"
        rf"|\bVALUES\s*\([^)]*{literal}",
        uncommented_sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if has_literal_assignment:
        risks.append({
            "code": "hard_coded_value",
            "severity": "low",
            "title": "Hard-coded SQL value",
            "detail": "A quoted literal is embedded in a condition, assignment, or VALUES clause instead of being supplied as a parameter.",
        })

    if re.search(r"\bEXEC(?:UTE)?\s*(?:\(|N?['\"]|@[A-Za-z_])", uncommented_sql, re.IGNORECASE):
        risks.append({
            "code": "dynamic_sql",
            "severity": "high",
            "title": "Dynamic SQL",
            "detail": "This procedure executes SQL assembled at runtime, so dependencies and behavior cannot be fully verified statically.",
        })

    return risks


def calculate_ground_truth_accuracy(
    procedures: list[dict[str, Any]],
    ground_truth_path: Path = GROUND_TRUTH_PATH,
) -> dict[str, Any]:
    import json

    expected_data = json.loads(ground_truth_path.read_text(encoding="utf-8"))
    expected_procedures = expected_data.get("procedures", {})
    expected: set[tuple[str, str, str]] = set()
    actual: set[tuple[str, str, str]] = set()

    for procedure_name, details in expected_procedures.items():
        procedure_id = f"dbo.{procedure_name}"
        for relation in ("reads", "writes", "calls"):
            expected.update(
                (procedure_id, relation[:-1] if relation != "calls" else "call", target)
                for target in details.get(relation, [])
            )
        if details.get("uncertain"):
            expected.add((procedure_id, "uncertain", "unknown_dynamic_dependency"))

    for procedure in procedures:
        procedure_id = procedure["id"]
        actual.update((procedure_id, "read", target) for target in procedure.get("reads", []))
        actual.update((procedure_id, "write", target) for target in procedure.get("writes", []))
        actual.update((procedure_id, "call", target) for target in procedure.get("called_procedures", []))
        actual.update(
            (procedure_id, "uncertain", edge["to"])
            for edge in procedure.get("uncertain_edges", [])
        )

    matched = expected & actual
    missing = expected - actual
    extra = actual - expected
    precision = len(matched) / len(actual) if actual else 1.0
    recall = len(matched) / len(expected) if expected else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0

    return {
        "matched": len(matched),
        "expected": len(expected),
        "found": len(actual),
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "missing": [_relationship(item) for item in sorted(missing)],
        "extra": [_relationship(item) for item in sorted(extra)],
    }


def _relationship(value: tuple[str, str, str]) -> dict[str, str]:
    return {"procedure": value[0], "type": value[1], "target": value[2]}
