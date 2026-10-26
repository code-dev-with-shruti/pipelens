import re
from typing import Dict, List


def extract_procedure_relationships(sql: str, file_name: str = "") -> Dict[str, List[str] | str | bool]:
    normalized = sql.strip()
    match = re.search(
        r"(?:CREATE(?:\s+OR\s+ALTER)?|ALTER)\s+PROCEDURE\s+"
        r"(?:[A-Za-z_][A-Za-z0-9_]*\.)?([A-Za-z_][A-Za-z0-9_]*)",
        normalized,
        flags=re.I,
    )
    if not match:
        raise ValueError("No supported CREATE or ALTER PROCEDURE declaration was found.")
    procedure_name = match.group(1)
    procedure_id = f"dbo.{procedure_name}"

    read_pattern = r"(?:FROM|JOIN)\s+([#A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)"
    write_pattern = r"(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\s+([#A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)"
    read_matches = list(re.finditer(read_pattern, normalized, flags=re.I))
    write_tokens = re.findall(write_pattern, normalized, flags=re.I)

    reads = []
    writes = []
    called_procedures = []
    temp_tables = []

    for read_match in read_matches:
        token = read_match.group(1)
        prefix = normalized[:read_match.start()].rstrip()
        if re.search(r"\bDELETE$", prefix, flags=re.I):
            continue
        if token.startswith("#"):
            temp_tables.append(token)
            continue
        reads.append(token)

    for token in write_tokens:
        if token.startswith("#"):
            temp_tables.append(token)
            continue
        writes.append(token)

    for stmt in re.findall(r"EXEC\s+(?:[A-Za-z_][A-Za-z0-9_]*\.)?([A-Za-z_][A-Za-z0-9_]*)", normalized, flags=re.I):
        if stmt:
            called_procedures.append(f"dbo.{stmt}" if not stmt.lower().startswith("dbo.") else stmt)

    # Keep the parser conservative: if temp tables present, they are tracked as temp state.
    if "CREATE TABLE #" in normalized:
        for temp in re.findall(r"CREATE\s+TABLE\s+(#\w+)", normalized, flags=re.I):
            temp_tables.append(temp)

    has_dynamic_sql = bool(re.search(r"\bEXEC(?:UTE)?\s*(?:\(|N?['\"]|@[A-Za-z_])", normalized, flags=re.I))
    reads = sorted(dict.fromkeys(reads))
    writes = sorted(dict.fromkeys(writes))
    temp_tables = sorted(dict.fromkeys(temp_tables))

    reads = sorted(dict.fromkeys(reads))
    writes = sorted(dict.fromkeys(writes))
    temp_tables = sorted(dict.fromkeys(temp_tables))

    return {
        "procedure": procedure_id,
        "file": file_name,
        "reads": reads,
        "writes": writes,
        "temp_tables": temp_tables,
        "called_procedures": sorted(dict.fromkeys(called_procedures)),
        "has_dynamic_sql": has_dynamic_sql,
        "uncertain_edges": ([{
            "from": procedure_id,
            "to": "unknown_dynamic_dependency",
            "type": "unknown",
            "confidence": "uncertain",
            "reason": "Dynamic SQL may reference dependencies that cannot be resolved statically.",
        }] if has_dynamic_sql else []),
    }
