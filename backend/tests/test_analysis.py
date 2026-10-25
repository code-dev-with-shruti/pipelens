from pathlib import Path

from backend.analysis import calculate_ground_truth_accuracy, detect_risks
from backend.parser import extract_procedure_relationships


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_DIRECTORY = PROJECT_ROOT / "samples" / "retail_billing"


def test_detects_missing_error_handling_and_unfiltered_delete():
    risks = detect_risks(
        "CREATE PROCEDURE dbo.cleanup AS BEGIN DELETE FROM dbo.expired_sessions; END;"
    )

    assert {risk["code"] for risk in risks} == {
        "missing_error_handling",
        "unfiltered_delete",
    }
    assert next(risk for risk in risks if risk["code"] == "unfiltered_delete")["severity"] == "high"


def test_delete_with_where_is_not_unfiltered_and_literal_is_flagged():
    risks = detect_risks(
        "CREATE PROCEDURE dbo.cleanup AS BEGIN "
        "DELETE FROM dbo.audit_log WHERE created_at < '2024-01-01'; END;"
    )

    codes = {risk["code"] for risk in risks}
    assert "unfiltered_delete" not in codes
    assert "hard_coded_value" in codes


def test_detects_numeric_hard_coded_condition():
    risks = detect_risks(
        "CREATE PROCEDURE dbo.flag AS BEGIN UPDATE dbo.payments SET reconciled = 1; END;"
    )

    assert "hard_coded_value" in {risk["code"] for risk in risks}


def test_detects_dynamic_sql_and_skips_quoted_words_in_comments():
    risks = detect_risks(
        "CREATE PROCEDURE dbo.dynamic_loader AS BEGIN "
        "-- DELETE FROM dbo.safe_table;\nEXEC(@statement); END;"
    )

    codes = {risk["code"] for risk in risks}
    assert "dynamic_sql" in codes
    assert "unfiltered_delete" not in codes


def test_sample_relationship_f1_matches_ground_truth():
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

    result = calculate_ground_truth_accuracy(procedures)
    assert result["precision"] == 1.0
    assert result["recall"] == 1.0
    assert result["f1"] == 1.0
    assert result["missing"] == []
    assert result["extra"] == []
