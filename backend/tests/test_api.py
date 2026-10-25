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


def test_analyze_returns_deterministic_downstream_and_uncertain_edges():
    project_root = Path(__file__).resolve().parents[2]
    sample_directory = project_root / "samples" / "retail_billing"
    files = [
        {"name": path.name, "sql": path.read_text(encoding="utf-8")}
        for path in sorted(sample_directory.glob("*.sql"))
    ]

    response = client.post("/analyze", json={"files": files})

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

    uncertain_edges = [edge for edge in result["edges"] if edge["confidence"] == "uncertain"]
    assert uncertain_edges == [{
        "from": "dbo.dynamic_rate_refresh",
        "to": "unknown_dynamic_dependency",
        "type": "unknown",
        "confidence": "uncertain",
    }]
    assert "dbo.payments" in result["tables"]
