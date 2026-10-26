import json
from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_analyze_requires_files():
    response = client.post("/analyze", json={"files": []})
    assert response.status_code == 400


def test_sample_returns_all_bundled_sql_files():
    response = client.get("/sample")

    assert response.status_code == 200
    files = response.json()["files"]
    assert len(files) == 7
    assert {file["name"] for file in files} == {
        "archive_monthly_reports.sql",
        "build_monthly_report.sql",
        "clean_invoice_records.sql",
        "dynamic_rate_refresh.sql",
        "load_invoices.sql",
        "nightly_cleanup.sql",
        "reconcile_payments.sql",
    }


def test_analyze_returns_deterministic_downstream_and_uncertain_edges(monkeypatch, tmp_path):
    project_root = Path(__file__).resolve().parents[2]
    sample_directory = project_root / "samples" / "retail_billing"
    files = [
        {"name": path.name, "sql": path.read_text(encoding="utf-8")}
        for path in sorted(sample_directory.glob("*.sql"))
    ]
    cache_path = tmp_path / "llm_cache.json"
    cache_path.write_text(
        json.dumps({
            "procedures": {
                f"dbo.{Path(file['name']).stem}": {
                    "summary": f"Summary for {Path(file['name']).stem}.",
                    "steps": ["Read inputs.", "Apply the procedure's changes."],
                }
                for file in files
            },
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr("backend.main.CACHE_PATH", cache_path)
    monkeypatch.setattr(
        "backend.main.generate_explanations",
        lambda _: (_ for _ in ()).throw(AssertionError("Sample requests must use the cache.")),
    )

    response = client.post("/analyze", json={"files": files, "source": "sample"})

    assert response.status_code == 200
    result = response.json()
    load_downstream = set(result["downstream"]["dbo.load_invoices"])
    assert {
        "dbo.clean_invoice_records",
        "dbo.reconcile_payments",
        "dbo.build_monthly_report",
        "dbo.archive_monthly_reports",
        "dbo.clean_invoices",
        "dbo.payments",
        "dbo.reconciled",
        "dbo.monthly_report",
        "dbo.report_archive",
    } <= load_downstream
    assert "dbo.nightly_cleanup" not in load_downstream
    assert "dbo.dynamic_rate_refresh" not in load_downstream
    assert "dbo.build_monthly_report" in result["downstream"]["dbo.payments"]

    uncertain_edges = [edge for edge in result["edges"] if edge["confidence"] == "uncertain"]
    assert uncertain_edges == [{
        "from": "dbo.dynamic_rate_refresh",
        "to": "unknown_dynamic_dependency",
        "type": "unknown",
        "confidence": "uncertain",
    }]
    assert "dbo.payments" in result["tables"]
    assert result["accuracy"]["f1"] == 1.0
    assert result["procedures"][0]["summary"]
    assert result["procedures"][0]["steps"]
    assert all("severity" in risk for procedure in result["procedures"] for risk in procedure["risks"])


def test_upload_generates_explanations_and_skips_sample_accuracy(monkeypatch):
    monkeypatch.setattr(
        "backend.main.generate_explanations",
        lambda _: {
            "dbo.one": {"summary": "Generated summary.", "steps": ["Read the source."]}
        },
    )

    response = client.post("/analyze", json={
        "source": "upload",
        "files": [{
            "name": "one.sql",
            "sql": "CREATE PROCEDURE dbo.one AS BEGIN SELECT id FROM dbo.source_table; END;",
        }],
    })

    assert response.status_code == 200
    result = response.json()
    assert result["explanation_pending"] == ["dbo.one"]
    assert "summary" not in result["procedures"][0]
    assert "accuracy" not in result

    explanation_response = client.post("/explanations", json={
        "files": [{
            "name": "one.sql",
            "sql": "CREATE PROCEDURE dbo.one AS BEGIN SELECT id FROM dbo.source_table; END;",
        }],
    })

    assert explanation_response.status_code == 200
    assert explanation_response.json()["procedures"]["dbo.one"] == {
        "summary": "Generated summary.",
        "steps": ["Read the source."],
    }


def test_upload_graph_remains_available_when_gemini_is_unavailable(monkeypatch):
    monkeypatch.setattr(
        "backend.main.generate_explanations",
        lambda _: (_ for _ in ()).throw(RuntimeError("Gemini quota unavailable.")),
    )
    sql_file = {
        "name": "one.sql",
        "sql": "CREATE PROCEDURE dbo.one AS BEGIN DELETE FROM dbo.source_table; END;",
    }

    analysis_response = client.post("/analyze", json={
        "source": "upload",
        "files": [sql_file],
    })
    explanation_response = client.post("/explanations", json={"files": [sql_file]})

    assert analysis_response.status_code == 200
    result = analysis_response.json()
    assert result["procedures"][0]["id"] == "dbo.one"
    assert result["procedures"][0]["risks"]
    assert result["explanation_pending"] == ["dbo.one"]
    assert explanation_response.status_code == 502
    assert explanation_response.json()["detail"] == "Gemini quota unavailable."


def test_upload_uses_sample_cache_and_generates_only_new_file_explanations(monkeypatch, tmp_path):
    sample_procedure = {
        "id": "dbo.sample_step",
        "file": "sample_step.sql",
        "reads": [],
        "writes": [],
        "called_procedures": [],
        "has_dynamic_sql": False,
        "uncertain_edges": [],
        "risks": [],
    }
    (tmp_path / "llm_cache.json").write_text(
        json.dumps({
            "procedures": {
                "dbo.sample_step": {
                    "summary": "Cached sample summary.",
                    "steps": ["Use the sample cache."],
                },
            },
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr("backend.main.CACHE_PATH", tmp_path / "llm_cache.json")
    generated_ids = []

    def generate_only_new(procedures):
        generated_ids.extend(procedure["id"] for procedure in procedures)
        return {
            procedure["id"]: {
                "summary": f"Live summary for {procedure['id']}.",
                "steps": ["Use live generation."],
            }
            for procedure in procedures
        }

    monkeypatch.setattr(
        "backend.main.generate_explanations",
        generate_only_new,
    )

    response = client.post("/analyze", json={
        "source": "upload",
        "files": [
            {
                "name": sample_procedure["file"],
                "sql": "CREATE PROCEDURE dbo.sample_step AS BEGIN SELECT 1; END;",
                "use_cached_explanation": True,
            },
            {
                "name": "new_step.sql",
                "sql": "CREATE PROCEDURE dbo.new_step AS BEGIN SELECT id FROM dbo.sample_table; END;",
            },
        ],
    })

    assert response.status_code == 200
    procedures = {procedure["id"]: procedure for procedure in response.json()["procedures"]}
    assert procedures["dbo.sample_step"]["summary"] == "Cached sample summary."
    assert response.json()["explanation_pending"] == ["dbo.new_step"]

    explanation_response = client.post("/explanations", json={
        "files": [{
            "name": "new_step.sql",
            "sql": "CREATE PROCEDURE dbo.new_step AS BEGIN SELECT id FROM dbo.sample_table; END;",
        }],
    })
    assert explanation_response.status_code == 200
    assert explanation_response.json()["procedures"]["dbo.new_step"]["summary"] == (
        "Live summary for dbo.new_step."
    )
    assert generated_ids == ["dbo.new_step"]


def test_upload_reports_invalid_files_but_analyzes_valid_files(monkeypatch):
    monkeypatch.setattr(
        "backend.main.generate_explanations",
        lambda procedures: {
            procedure["id"]: {"summary": "Generated.", "steps": ["Read the source."]}
            for procedure in procedures
        },
    )

    response = client.post("/analyze", json={
        "source": "upload",
        "files": [
            {"name": "empty.sql", "sql": "  "},
            {"name": "notes.txt", "sql": "CREATE PROCEDURE dbo.notes AS SELECT 1;"},
            {"name": "valid.sql", "sql": "CREATE PROCEDURE dbo.valid AS SELECT 1;"},
            {"name": "not-procedure.sql", "sql": "SELECT * FROM dbo.source_table;"},
        ],
    })

    assert response.status_code == 200
    result = response.json()
    assert [procedure["id"] for procedure in result["procedures"]] == ["dbo.valid"]
    assert {error["name"] for error in result["file_errors"]} == {
        "empty.sql",
        "notes.txt",
        "not-procedure.sql",
    }


def test_analyze_rejects_files_over_character_limit_individually(monkeypatch):
    monkeypatch.setattr(
        "backend.main.generate_explanations",
        lambda procedures: {
            procedure["id"]: {"summary": "Generated.", "steps": ["Read the source."]}
            for procedure in procedures
        },
    )

    response = client.post("/analyze", json={
        "source": "upload",
        "files": [
            {"name": "large.sql", "sql": "x" * 20_001},
            {"name": "valid.sql", "sql": "CREATE PROCEDURE dbo.valid AS SELECT 1;"},
        ],
    })

    assert response.status_code == 200
    result = response.json()
    assert [procedure["id"] for procedure in result["procedures"]] == ["dbo.valid"]
    assert result["file_errors"] == [{
        "name": "large.sql",
        "message": "The file exceeds the 20,000-character limit.",
    }]


def test_latest_duplicate_procedure_definition_wins_with_warning(monkeypatch):
    monkeypatch.setattr(
        "backend.main.generate_explanations",
        lambda procedures: {
            procedure["id"]: {
                "summary": f"Summary from {procedure['file']}.",
                "steps": ["Use the latest definition."],
            }
            for procedure in procedures
        },
    )

    response = client.post("/analyze", json={
        "source": "upload",
        "files": [
            {"name": "first.sql", "sql": "CREATE PROCEDURE dbo.shared AS SELECT id FROM dbo.old_table;"},
            {"name": "latest.sql", "sql": "CREATE PROCEDURE dbo.shared AS SELECT id FROM dbo.new_table;"},
        ],
    })

    assert response.status_code == 200
    result = response.json()
    assert len(result["procedures"]) == 1
    assert result["procedures"][0]["file"] == "latest.sql"
    assert result["explanation_pending"] == ["dbo.shared"]
    assert "dbo.new_table" in result["tables"]
    assert "dbo.old_table" not in result["tables"]
    assert "using the latest file, latest.sql" in result["warnings"][0]

    explanation_response = client.post("/explanations", json={
        "files": [{
            "name": "latest.sql",
            "sql": "CREATE PROCEDURE dbo.shared AS SELECT id FROM dbo.new_table;",
        }],
    })
    assert explanation_response.status_code == 200
    assert explanation_response.json()["procedures"]["dbo.shared"]["summary"] == (
        "Summary from latest.sql."
    )


def test_missing_sample_cache_keeps_graph_and_reports_action(monkeypatch, tmp_path):
    monkeypatch.setattr("backend.main.CACHE_PATH", tmp_path / "missing-cache.json")
    files = [{
        "name": "one.sql",
        "sql": "CREATE PROCEDURE dbo.one AS BEGIN SELECT id FROM dbo.source_table; END;",
    }]

    response = client.post("/analyze", json={"files": files, "source": "sample"})

    assert response.status_code == 200
    result = response.json()
    assert result["procedures"][0]["id"] == "dbo.one"
    assert "generate_sample_cache" in result["explanation_error"]
    assert result["accuracy"]["f1"] < 1
