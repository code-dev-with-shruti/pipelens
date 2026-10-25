import json
from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.parser import extract_procedure_relationships


SAMPLE_DIRECTORY = PROJECT_ROOT / "samples" / "retail_billing"


def main() -> None:
    sql_files = sorted(SAMPLE_DIRECTORY.glob("*.sql"))
    if not sql_files:
        print(f"No SQL files found in {SAMPLE_DIRECTORY}")
        return

    for sql_file in sql_files:
        result = extract_procedure_relationships(
            sql_file.read_text(encoding="utf-8"),
            sql_file.name,
        )
        print(f"{sql_file.name} ({result['procedure']})")
        print(f"  Reads: {', '.join(result['reads']) or '(none)'}")
        print(f"  Writes: {', '.join(result['writes']) or '(none)'}")
        print("  Uncertain edges:")
        uncertain_edges = result["uncertain_edges"]
        if uncertain_edges:
            for edge in uncertain_edges:
                print(f"    {json.dumps(edge, sort_keys=True)}")
        else:
            print("    (none)")


if __name__ == "__main__":
    main()