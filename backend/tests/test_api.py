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
        lambda procedures: {
            procedure["id"]: {"summary": "Generated summary.", "steps": ["Read the source."]}
            for procedure in procedures
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
    assert result["procedures"][0]["summary"] == "Generated summary."
    assert result["procedures"][0]["steps"] == ["Read the source."]
    assert "accuracy" not in result


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
