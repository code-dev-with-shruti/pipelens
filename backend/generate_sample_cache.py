import json
from pathlib import Path

from backend.explanations import configured_model, generate_explanations
from backend.parser import extract_procedure_relationships


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SAMPLE_DIRECTORY = PROJECT_ROOT / "samples" / "retail_billing"
CACHE_PATH = SAMPLE_DIRECTORY / "llm_cache.json"


def main() -> None:
    parsed_procedures = []
    for sql_path in sorted(SAMPLE_DIRECTORY.glob("*.sql")):
        parsed = extract_procedure_relationships(
            sql_path.read_text(encoding="utf-8"),
            sql_path.name,
        )
        parsed_procedures.append({
            "id": parsed["procedure"],
            "reads": parsed["reads"],
            "writes": parsed["writes"],
            "called_procedures": parsed["called_procedures"],
            "has_dynamic_sql": parsed["has_dynamic_sql"],
        })

    cache = {
        "model": configured_model(),
        "procedures": generate_explanations(parsed_procedures),
    }
    CACHE_PATH.write_text(
        json.dumps(cache, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"Saved Gemini explanations for {len(parsed_procedures)} procedures to {CACHE_PATH}.")


if __name__ == "__main__":
    main()
