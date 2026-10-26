import json
from pathlib import Path

from backend.parser import extract_procedure_relationships


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_DIRECTORY = PROJECT_ROOT / "samples" / "retail_billing"


def test_extracts_wrapper_temp_tables_and_try_catch_relationships():
    sample = '''
    CREATE PROCEDURE dbo.load_invoices
    AS
    BEGIN
      CREATE TABLE #temp_invoices (invoice_id INT);
      INSERT INTO #temp_invoices (invoice_id)
      SELECT invoice_id FROM staging.raw_invoices;
      TRY
      BEGIN
        UPDATE dbo.clean_invoices SET status = 'loaded';
      END
      CATCH
      BEGIN
        INSERT INTO dbo.error_log (message) VALUES ('error');
      END
      EXEC dbo.reconcile_payments;
    END
    '''

    result = extract_procedure_relationships(sample, "load_invoices.sql")

    assert result["procedure"] == "dbo.load_invoices"
    assert result["reads"] == ["staging.raw_invoices"]
    assert result["writes"] == ["dbo.clean_invoices", "dbo.error_log"]
    assert result["temp_tables"] == ["#temp_invoices"]
    assert result["called_procedures"] == ["dbo.reconcile_payments"]
    assert result["uncertain_edges"] == []


def test_unfiltered_delete_is_a_write_not_a_read():
    result = extract_procedure_relationships(
        "CREATE PROCEDURE dbo.cleanup AS BEGIN DELETE FROM dbo.audit_log; END;"
    )

    assert result["reads"] == []
    assert result["writes"] == ["dbo.audit_log"]


def test_dynamic_sql_marks_an_uncertain_edge():
    result = extract_procedure_relationships(
        "CREATE PROCEDURE dbo.dynamic_loader AS BEGIN EXEC(@statement); END;"
    )

    assert result["has_dynamic_sql"] is True
    assert result["uncertain_edges"] == [{
        "from": "dbo.dynamic_loader",
        "to": "unknown_dynamic_dependency",
        "type": "unknown",
        "confidence": "uncertain",
        "reason": "Dynamic SQL may reference dependencies that cannot be resolved statically.",
    }]


def test_create_or_alter_procedure_is_supported():
    result = extract_procedure_relationships(
        "CREATE OR ALTER PROCEDURE dbo.refresh_summary AS BEGIN SELECT id FROM dbo.source; END;"
    )

    assert result["procedure"] == "dbo.refresh_summary"
    assert result["reads"] == ["dbo.source"]


def test_sample_relationships_match_ground_truth():
    ground_truth = json.loads((PROJECT_ROOT / "samples" / "ground_truth.json").read_text(encoding="utf-8"))
    found_procedures = set()

    for sql_file in sorted(SAMPLE_DIRECTORY.glob("*.sql")):
        result = extract_procedure_relationships(sql_file.read_text(encoding="utf-8"), sql_file.name)
        procedure_name = result["procedure"].removeprefix("dbo.")
        expected = ground_truth["procedures"][procedure_name]
        found_procedures.add(procedure_name)

        assert result["reads"] == sorted(expected["reads"]), procedure_name
        assert result["writes"] == sorted(expected["writes"]), procedure_name
        assert result["called_procedures"] == sorted(expected["calls"]), procedure_name
        assert result["has_dynamic_sql"] is expected["uncertain"], procedure_name
        assert bool(result["uncertain_edges"]) is expected["uncertain"], procedure_name

    assert found_procedures == set(ground_truth["procedures"])
    assert len(list(SAMPLE_DIRECTORY.glob("*.sql"))) == 7
